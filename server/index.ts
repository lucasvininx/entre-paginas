import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { limiter } from './rate-limit.ts';
import { hash, compare } from 'bcryptjs';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';
import { z, ZodError } from 'zod';
import { pool, sql, transaction } from './db.ts';
import { catalog, discover, providers } from './providers.ts';
import {
  demand,
  enqueue,
  approve,
  startWorker,
  validateSource,
  scheduleWorker,
  runOne,
} from './workflow.ts';
import { streamDownload } from './stream-download.ts';
import { normalize } from './normalize.ts';
import { validatePdf } from './safe-fetch.ts';
export const app = express();
const production = process.env.NODE_ENV === 'production';
if (process.env.VERCEL) app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        'img-src': ["'self'", 'https:', 'data:'],
        'upgrade-insecure-requests': production ? [] : null,
      },
    },
  }),
);
app.use(express.json({ limit: '32kb' }));
app.use(cookieParser());
app.use('/api', limiter('api', 60000, 180));
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store');
  next();
});
app.get('/api/cron/worker', async (req, res) => {
  const actual = Buffer.from(req.get('authorization') || '');
  const expected = Buffer.from('Bearer ' + (process.env.CRON_SECRET || ''));
  if (
    !process.env.CRON_SECRET ||
    actual.length !== expected.length ||
    !timingSafeEqual(actual, expected)
  )
    return void res.status(401).json({ error: 'Não autorizado' });
  await runOne();
  await sql('delete from rate_limits where reset_at<now()');
  await sql('delete from sessions where expires_at<now()');
  await sql('delete from search_cache where expires_at<now()');
  res.json({ ok: true });
});
app.use('/api', (req, res, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const origin = req.get('origin');
    const origins = production
      ? [
          process.env.APP_ORIGIN,
          ...[process.env.VERCEL_PROJECT_PRODUCTION_URL, process.env.VERCEL_URL]
            .filter(Boolean)
            .map((host) => 'https://' + host),
        ]
      : [process.env.APP_ORIGIN, 'http://localhost:5173', 'http://127.0.0.1:5173'];
    if (!origins.includes(origin))
      return res.status(403).json({ error: 'Origem da requisição não autorizada' });
  }
  next();
});
const digest = (t: string) => createHash('sha256').update(t).digest('hex');
app.use('/api', async (req, res, next) => {
  try {
    if (req.cookies.session) {
      const [u] = await sql(
        `select u.id,u.name,u.email,u.role from sessions s join users u on u.id=s.user_id where s.id=$1 and s.expires_at>now()`,
        [digest(req.cookies.session)],
      );
      res.locals.user = u;
    }
    next();
  } catch (e) {
    next(e);
  }
});
const auth: express.RequestHandler = (_req, res, next) =>
  res.locals.user
    ? next()
    : void res.status(401).json({ error: 'Entre na sua conta para continuar.' });
const admin: express.RequestHandler = (_req, res, next) =>
  res.locals.user?.role === 'admin'
    ? next()
    : void res.status(403).json({ error: 'Acesso exclusivo do administrador.' });
const uuid = z.string().uuid();
const querySchema = z.string().trim().min(2).max(200);
app.get('/api/health', async (_req, res) => {
  await sql('select 1');
  res.json({ ok: true });
});
app.get('/api/me', (_req, res) => res.json({ user: res.locals.user || null }));
const dummyHash = await hash(randomBytes(24).toString('hex'), 12);
app.post('/api/login', limiter('login', 15 * 60000, 12), async (req, res) => {
  const { email, password } = z
    .object({ email: z.email(), password: z.string().min(1).max(128) })
    .parse(req.body);
  const [u] = await sql('select * from users where email=$1', [email.toLowerCase()]);
  const valid = await compare(password, u?.password_hash || dummyHash);
  if (!u || !valid) return void res.status(401).json({ error: 'E-mail ou senha incorretos.' });
  const token = randomBytes(32).toString('hex');
  await sql('delete from sessions where expires_at<now()');
  await sql(`insert into sessions(id,user_id,expires_at) values($1,$2,now()+interval '7 days')`, [
    digest(token),
    u.id,
  ]);
  res.cookie('session', token, {
    httpOnly: true,
    secure: production,
    sameSite: 'strict',
    maxAge: 7 * 86400000,
    path: '/',
  });
  res.json({
    user: { id: u.id, name: u.name, email: u.email, role: u.role },
  });
});
app.post('/api/logout', auth, async (req, res) => {
  await sql('delete from sessions where id=$1', [digest(req.cookies.session)]);
  res.clearCookie('session');
  res.json({ ok: true });
});
app.get('/api/providers', (_req, res) => res.json(Object.keys(providers)));
const bookSelect = `select b.*, (exists(select 1 from sources s where s.book_id=b.id and s.status='approved') or exists(select 1 from uploaded_files f where f.book_id=b.id)) as available from books b`;
app.get('/api/books', async (req, res) => {
  const page = z.coerce.number().int().min(1).max(10000).default(1).parse(req.query.page);
  const q = String(req.query.q || '').slice(0, 200);
  res.json(
    await sql(
      `${bookSelect} where ($1='' or b.title ilike $2 or b.authors ilike $2) order by available desc,b.created_at desc limit 24 offset $3`,
      [q, '%' + q + '%', (page - 1) * 24],
    ),
  );
});
app.get('/api/books/:id', async (req, res) => {
  const id = uuid.parse(req.params.id);
  const [b] = await sql(`${bookSelect} where b.id=$1`, [id]);
  if (!b) return void res.status(404).json({ error: 'Livro não encontrado' });
  const sources = await sql(
    `select id,origin,evidence_url,license,region,validated_at from sources where book_id=$1 and status='approved'`,
    [id],
  );
  const uploads = await sql('select id,filename,pages from uploaded_files where book_id=$1', [id]);
  res.json({ ...b, sources, uploads });
});
app.post('/api/search', auth, limiter('search', 60000, 5), async (req, res) => {
  const { query } = z.object({ query: querySchema }).parse(req.body);
  const result = await discover(query);
  const ids: string[] = [];
  for (const b of result.books) {
    if (b.title) ids.push((await catalog(b)).id);
  }
  const local = await sql(
    `${bookSelect} where b.id=any($1::uuid[]) or b.title ilike $2 or b.authors ilike $2 limit 200`,
    [ids, '%' + query + '%'],
  );
  const incomplete = result.providers.some((p) => !p.ok);
  const exact = local.filter(
    (b) => normalize(b.title) === normalize(query) || b.isbn === query.replace(/[- ]/g, ''),
  );
  let request = null;
  if (exact.length === 1 && !exact[0].available)
    request = await demand(res.locals.user.id, query, exact[0], incomplete);
  else if (!exact.some((b) => b.available))
    request = await demand(res.locals.user.id, query, null, incomplete);
  if (request)
    await sql('insert into attempts(request_id,query,providers) values($1,$2,$3)', [
      request.id,
      query,
      JSON.stringify(result.providers),
    ]);
  res.json({
    books: local,
    providers: result.providers,
    leads: result.leads || [],
    incomplete,
    request,
    message: request
      ? 'Registramos seu pedido. Você poderá acompanhar a busca em Minhas solicitações.'
      : null,
  });
});
app.post('/api/requests', auth, async (req, res) => {
  const d = z
    .object({
      query: querySchema,
      bookId: uuid.optional(),
      title: z.string().max(300).optional(),
      author: z.string().max(300).optional(),
      language: z.string().max(30).optional(),
    })
    .parse(req.body);
  const [book] = d.bookId ? await sql('select * from books where id=$1', [d.bookId]) : [];
  if (d.bookId && !book) return void res.status(404).json({ error: 'Livro não encontrado' });
  res.json(await demand(res.locals.user.id, d.query, book || null, false, d));
});
app.get('/api/requests', auth, async (_req, res) => {
  res.json(
    await sql(
      `select r.*,(select count(*)::int from interests where request_id=r.id) interested from requests r join interests i on i.request_id=r.id where i.user_id=$1 order by r.last_at desc`,
      [res.locals.user.id],
    ),
  );
});
app.get('/api/notifications', auth, async (_req, res) =>
  res.json(
    await sql(
      'select id,message,created_at,read_at from notifications where user_id=$1 order by created_at desc limit 50',
      [res.locals.user.id],
    ),
  ),
);
app.post('/api/notifications/read', auth, async (_req, res) => {
  await sql('update notifications set read_at=now() where user_id=$1 and read_at is null', [
    res.locals.user.id,
  ]);
  res.json({ ok: true });
});
app.get('/api/shelf', auth, async (_req, res) =>
  res.json(
    await sql(
      `select b.*,s.favorite,s.state,exists(select 1 from sources x where x.book_id=b.id and x.status='approved') available from shelves s join books b on b.id=s.book_id where s.user_id=$1`,
      [res.locals.user.id],
    ),
  ),
);
app.put('/api/shelf/:id', auth, async (req, res) => {
  const d = z
    .object({
      favorite: z.boolean(),
      state: z.enum(['want', 'reading', 'read']),
    })
    .parse(req.body);
  await sql(
    `insert into shelves(user_id,book_id,favorite,state) values($1,$2,$3,$4) on conflict(user_id,book_id) do update set favorite=$3,state=$4`,
    [res.locals.user.id, uuid.parse(req.params.id), d.favorite, d.state],
  );
  res.json({ ok: true });
});
app.get('/api/uploads/:id/download', auth, limiter('uploaded-download', 60000, 6), async (req, res) => {
  const [file] = await sql('select filename,content from uploaded_files where id=$1', [uuid.parse(req.params.id)]);
  if (!file) return void res.status(404).json({ error: 'Arquivo não encontrado' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="livro.pdf"; filename*=UTF-8''${encodeURIComponent(file.filename)}`);
  await streamDownload(res, file.content);
});
app.get('/api/download/:id', auth, limiter('download', 60000, 6), async (req, res) => {
  const [s] = await sql(`select * from sources where id=$1 and status='approved'`, [
    uuid.parse(req.params.id),
  ]);
  if (!s) return void res.status(404).json({ error: 'PDF indisponível' });
  try {
    const pdf = await validatePdf(s.url);
    await sql(
      'update sources set downloads_started=downloads_started+1,validated_at=now() where id=$1',
      [s.id],
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${
        normalize(s.title)
          .replace(/[^a-z0-9]+/g, '-')
          .slice(0, 100) || 'livro'
      }.pdf"; filename*=UTF-8''${encodeURIComponent(s.title.slice(0, 100) + '.pdf')}`,
    );
    await streamDownload(res, pdf.body);
  } catch {
    if (res.headersSent) {
      if (!res.destroyed) res.destroy();
      return;
    }
    await transaction(async (q) => {
      await q(`update sources set status='rejected',validation=$2 where id=$1`, [
        s.id,
        JSON.stringify({
          ok: false,
          message: 'Link falhou na revalidação do download',
        }),
      ]);
      await q(
        `update requests set status='temporary_error' where book_id=$1 and not exists(select 1 from sources where book_id=$1 and status='approved')`,
        [s.book_id],
      );
    });
    res.status(502).json({
      error:
        'A fonte falhou na revalidação. A disponibilidade foi atualizada; tente outra fonte ou solicite nova busca.',
    });
  }
});
app.use('/api/admin', auth, admin);
app.get('/api/admin/overview', async (_req, res) => {
  scheduleWorker();
  const [counts] = await sql(
    `select (select count(*)::int from books) books,(select count(distinct book_id)::int from sources where status='approved') pdfs,(select count(*)::int from requests where status<>'available') pending,(select count(*)::int from jobs where status in ('running','queued')) jobs`,
  );
  res.json(counts);
});
app.get('/api/admin/requests', async (req, res) => {
  const filters = z
    .object({
      q: z.string().max(200).default(''),
      status: z.string().max(40).default(''),
      language: z.string().max(30).default(''),
      priority: z.coerce.number().int().min(0).max(3).optional(),
      after: z.iso.date().optional(),
    })
    .parse(req.query);
  res.json(
    await sql(
      `select r.*,(select count(*)::int from interests where request_id=r.id) interested from requests r where ($1='' or concat(r.title,r.author,r.query) ilike $2) and ($3='' or r.status=$3) and ($4='' or r.language=$4) and ($5::int is null or r.priority=$5) and ($6::date is null or r.last_at>=$6::date) order by r.priority desc,interested desc,r.last_at desc limit 200`,
      [
        filters.q,
        '%' + filters.q + '%',
        filters.status,
        filters.language,
        filters.priority ?? null,
        filters.after ?? null,
      ],
    ),
  );
});
app.get('/api/admin/requests/:id', async (req, res) => {
  const id = uuid.parse(req.params.id);
  const [request] = await sql('select * from requests where id=$1', [id]);
  if (!request) return void res.status(404).json({ error: 'Solicitação não encontrada' });
  res.json({
    request,
    attempts: await sql('select * from attempts where request_id=$1 order by created_at desc', [
      id,
    ]),
    jobs: await sql('select * from jobs where request_id=$1 order by created_at desc', [id]),
    sources: await sql('select * from sources where request_id=$1 or book_id=$2', [
      id,
      request?.book_id || null,
    ]),
  });
});
app.patch('/api/admin/requests/:id', async (req, res) => {
  const d = z
    .object({
      title: z.string().max(300).nullable(),
      author: z.string().max(300).nullable(),
      isbn: z.string().max(30).nullable(),
      language: z.string().max(30).nullable(),
      edition: z.string().max(300).nullable(),
      priority: z.number().int().min(0).max(3),
      notes: z.string().max(4000),
      status: z.enum(['pending', 'review', 'not_found', 'temporary_error', 'paused']),
    })
    .parse(req.body);
  if (['paused', 'not_found'].includes(d.status) && !d.notes.trim())
    return void res.status(400).json({ error: 'Informe um motivo nas observações' });
  await sql(
    "update requests set title=$2,author=$3,isbn=$4,language=$5,edition=$6,priority=$7,notes=$8,status=case when status='available' then status else $9 end where id=$1",
    [
      uuid.parse(req.params.id),
      d.title,
      d.author,
      d.isbn,
      d.language,
      d.edition,
      d.priority,
      d.notes,
      d.status,
    ],
  );
  res.json({ ok: true });
});
app.post('/api/admin/requests/:id/search', async (req, res) => {
  const job = await enqueue(uuid.parse(req.params.id));
  scheduleWorker();
  res.status(202).json(job);
});
app.post('/api/admin/requests/:id/merge', async (req, res) => {
  const from = uuid.parse(req.params.id),
    to = uuid.parse(req.body.targetId);
  if (from === to) return void res.status(400).json({ error: 'Escolha outro pedido' });
  await transaction(async (q) => {
    const rs = await q('select * from requests where id=any($1::uuid[]) order by id for update', [
      [from, to],
    ]);
    if (rs.length !== 2) throw new Error('Pedido não encontrado');
    if (rs.every((r) => r.book_id) && rs[0].book_id !== rs[1].book_id)
      throw new Error('Edições diferentes não podem ser unidas');
    const active = await q(
      `select id from jobs where request_id=any($1::uuid[]) and status in ('running','queued')`,
      [[from, to]],
    );
    if (active.length) throw new Error('Aguarde a conclusão das buscas');
    await q(
      'insert into interests(request_id,user_id) select $2,user_id from interests where request_id=$1 on conflict do nothing',
      [from, to],
    );
    for (const table of ['attempts', 'jobs', 'sources', 'notifications'])
      await q(`update ${table} set request_id=$2 where request_id=$1`, [from, to]);
    await q(
      `update requests set first_at=least(first_at,(select first_at from requests where id=$1)),last_at=greatest(last_at,(select last_at from requests where id=$1)),notes=notes||E'\nPedido unido: '||(select query||' — '||notes from requests where id=$1) where id=$2`,
      [from, to],
    );
    await q('delete from requests where id=$1', [from]);
  });
  res.json({ ok: true });
});
app.post('/api/admin/sources', async (req, res) => {
  const d = z
    .object({
      requestId: uuid,
      bookId: uuid.optional(),
      title: z.string().min(1).max(300),
      authors: z.string().min(1).max(300),
      language: z.string().min(2).max(30),
      edition: z.string().min(1).max(300),
      url: z.url(),
      evidence_url: z.url(),
      license: z.string().min(5).max(1000),
      region: z.enum(['BR', 'WORLD']),
      origin: z.string().min(2).max(100),
    })
    .parse(req.body);
  const [r] = await sql('select * from requests where id=$1', [d.requestId]);
  if (!r) throw new Error('Pedido não encontrado');
  const bookId =
    d.bookId ||
    r.book_id ||
    (
      await catalog({
        externalId: d.url,
        title: d.title,
        authors: d.authors,
        language: d.language,
        edition: d.edition,
        origin: d.origin,
        official_url: d.evidence_url,
        candidates: [],
      })
    ).id;
  const [s] = await sql(
    `insert into sources(book_id,request_id,url,origin,evidence_url,license,region,title,authors,language,edition) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) on conflict(book_id,url) do update set evidence_url=excluded.evidence_url,license=excluded.license,region=excluded.region,status='candidate' returning *`,
    [
      bookId,
      d.requestId,
      d.url,
      d.origin,
      d.evidence_url,
      d.license,
      d.region,
      d.title,
      d.authors,
      d.language,
      d.edition,
    ],
  );
  res.json({ ...s, validation: await validateSource(s.id) });
});
app.post('/api/admin/sources/:id/approve', async (req, res) => {
  const d = z.object({ confirmed: z.literal(true), requestId: uuid.optional() }).parse(req.body);
  res.json(await approve(uuid.parse(req.params.id), res.locals.user.id, d.requestId));
});
app.post('/api/admin/sources/:id/validate', async (req, res) =>
  res.json(await validateSource(uuid.parse(req.params.id))),
);
app.post('/api/admin/users', async (req, res) => {
  const d = z
    .object({
      name: z.string().min(2).max(100),
      email: z.email(),
      password: z.string().min(12).max(128),
    })
    .parse(req.body);
  const [u] = await sql(
    `insert into users(name,email,password_hash,role) values($1,$2,$3,'reader') returning id,name,email,role`,
    [d.name, d.email.toLowerCase(), await hash(d.password, 12)],
  );
  res.status(201).json(u);
});
app.use('/api', (_req, res) => res.status(404).json({ error: 'Endpoint não encontrado' }));
app.use(express.static(resolve('dist')));
app.get('/{*path}', (_req, res) => res.sendFile(resolve('dist/index.html')));
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err.message);
  res.status(err instanceof ZodError ? 400 : err.code === '23505' ? 409 : 500).json({
    error:
      err instanceof ZodError
        ? 'Confira os campos informados.'
        : err.code === '23505'
          ? 'Este registro já existe.'
          : 'Não foi possível concluir a operação. ' +
            (production ? 'Tente novamente.' : err.message),
  });
});
if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
  await startWorker();
  const server = app.listen(Number(process.env.PORT || 3001), process.env.HOST || '127.0.0.1', () =>
    console.log('Entre Páginas API: http://localhost:3001'),
  );
  process.on('SIGTERM', () => server.close(() => pool.end().then(() => process.exit(0))));
}
