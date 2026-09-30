import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { hash } from 'bcryptjs';
process.env.NODE_ENV = 'test';
process.env.APP_ORIGIN = 'http://localhost:5173';
const schema = 'ep_test_' + Date.now();
process.env.DB_SCHEMA = schema;
const { sql, pool } = await import('../server/db.ts');
const { providers, catalog } = await import('../server/providers.ts');
const { webProvider } = await import('../server/web-discovery.ts');
const { PostgresRateStore } = await import('../server/rate-limit.ts');
const { demand, enqueue, runOne, startWorker } = await import('../server/workflow.ts');
let server: any,
  base: string,
  adminCookie: string,
  readerCookie: string,
  readerId: string,
  otherId: string;
const mockBook = {
  externalId: 'test-edition',
  title: 'Obra de teste',
  authors: 'Autora de teste',
  language: 'pt',
  edition: '2026',
  origin: 'Fixture de teste',
  candidates: [],
};
async function call(path: string, body?: unknown, cookie = readerCookie, method?: string) {
  const r = await fetch(base + path, {
    method: method || (body ? 'POST' : 'GET'),
    headers: {
      Origin: process.env.APP_ORIGIN!,
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return {
    status: r.status,
    data: await r.json(),
    cookie: r.headers.get('set-cookie')?.split(';')[0] || '',
  };
}
before(async () => {
  const folder = new URL('../supabase/migrations/', import.meta.url);
  for (const file of (await readdir(folder)).filter((f) => f.endsWith('.sql')).sort())
    await pool.query(
      (await readFile(new URL(file, folder), 'utf8')).replaceAll('entre_paginas', schema),
    );
  const password = await hash('Test-password-42', 12);
  for (const [name, role] of [
    ['Admin', 'admin'],
    ['Reader', 'reader'],
    ['Other', 'reader'],
  ]) {
    const [u] = await sql(
      'insert into users(name,email,password_hash,role) values($1,$2,$3,$4) returning id',
      [name, name.toLowerCase() + '@test.local', password, role],
    );
    if (name === 'Reader') readerId = u.id;
    if (name === 'Other') otherId = u.id;
  }
  const { app } = await import('../server/index.ts');
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api`;
  adminCookie = (
    await call('/login', { email: 'admin@test.local', password: 'Test-password-42' }, '')
  ).cookie;
  readerCookie = (
    await call('/login', { email: 'reader@test.local', password: 'Test-password-42' }, '')
  ).cookie;
  for (const key of Object.keys(providers)) delete providers[key];
  providers.Fixture = async () => [mockBook];
  webProvider.search = async () => [];
});
after(async () => {
  if (server) await new Promise<void>((r) => server.close(r));
  if (!/^ep_test_\d+$/.test(schema)) throw new Error('Unsafe test schema');
  await pool.query(`drop schema ${schema} cascade`);
  await pool.end();
});
test('Arquivo enviado exige login e preserva os bytes no download', async () => {
  const { PDFDocument } = await import('pdf-lib');
  const doc = await PDFDocument.create(); doc.addPage();
  const bytes = Buffer.from(await doc.save());
  const book = await catalog({...mockBook, externalId:'upload-test',title:'Arquivo enviado de teste'});
  const [file] = await sql('insert into uploaded_files(book_id,filename,sha256,content,pages) values($1,$2,$3,$4,1) returning id', [book.id,'teste.pdf','test-hash',bytes]);
  assert.equal((await fetch(base+'/uploads/'+file.id+'/download')).status,401);
  const r = await fetch(base+'/uploads/'+file.id+'/download',{headers:{Cookie:readerCookie}});
  assert.equal(r.status,200);
  assert.match(r.headers.get('content-disposition')!,/attachment/);
  assert.deepEqual(Buffer.from(await r.arrayBuffer()),bytes);
  const detail = await call('/books/'+book.id);
  assert.equal(detail.data.available,true);
  assert.equal(detail.data.uploads[0].id,file.id);
  assert.equal(detail.data.uploads[0].content,undefined);
});
test('Login, sessão HTTP-only, autorização administrativa e CSRF', async () => {
  assert.match(readerCookie, /session=/);
  assert.equal((await call('/admin/overview')).status, 403);
  assert.equal((await call('/admin/overview', undefined, adminCookie)).status, 200);
  assert.equal((await call('/requests', undefined, '')).status, 401);
  const r = await fetch(base + '/requests', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://evil.invalid',
      Cookie: readerCookie,
    },
    body: JSON.stringify({ query: 'abc' }),
  });
  assert.equal(r.status, 403);
  assert.equal(
    (await call('/login', { email: 'reader@test.local', password: 'wrong' })).status,
    401,
  );
});
test('Busca identificada sem PDF registra pedido; falhas preservam os demais resultados', async () => {
  providers.Falha = async () => {
    throw new Error('HTTP 503 fixture');
  };
  const r = await call('/search', { query: 'Obra de teste' });
  assert.equal(r.status, 200);
  assert.equal(r.data.books.length, 1);
  assert.equal(r.data.request.title, 'Obra de teste');
  assert.equal(r.data.request.status, 'temporary_error');
  assert.equal(r.data.incomplete, true);
  assert.equal(r.data.books[0].available, false);
  delete providers.Falha;
});
test('Consulta sem identificação preserva texto sem inventar título', async () => {
  providers.Fixture = async () => [];
  const r = await call('/search', { query: 'gênero inexistente teste' });
  assert.equal(r.data.request.title, null);
  assert.equal(r.data.request.query, 'gênero inexistente teste');
  assert.equal(r.data.request.reason, 'unidentified');
  providers.Fixture = async () => [mockBook];
});
test('Pedidos simultâneos não duplicam solicitações nem interessados', async () => {
  const book = await catalog(mockBook);
  const requests = await Promise.all(
    Array.from({ length: 8 }, () => demand(readerId, 'Obra de teste', book, false)),
  );
  assert.equal(new Set(requests.map((r) => r.id)).size, 1);
  const [count] = await sql('select count(*)::int n from interests where request_id=$1', [
    requests[0].id,
  ]);
  assert.equal(count.n, 1);
  await demand(otherId, 'Obra de teste', book, false);
  assert.equal(
    (await sql('select count(*)::int n from interests where request_id=$1', [requests[0].id]))[0].n,
    2,
  );
});
test('Estante e solicitações ficam isoladas por leitor', async () => {
  const book = await catalog(mockBook);
  assert.equal(
    (await call('/shelf/' + book.id, { favorite: true, state: 'reading' }, readerCookie, 'PUT'))
      .status,
    200,
  );
  const other = (
    await call('/login', { email: 'other@test.local', password: 'Test-password-42' }, '')
  ).cookie;
  assert.equal((await call('/shelf', undefined, other)).data.length, 0);
  assert.equal((await call('/shelf')).data.length, 1);
  const privateDemand = await demand(readerId, 'Meu pedido privado', null, false);
  assert.equal(
    (await call('/requests', undefined, other)).data.some((r: any) => r.id === privateDemand.id),
    false,
  );
});
test('Fila persiste, impede duplicação e executa busca real do adaptador', async () => {
  const r = await demand(readerId, 'Pedido worker', null, false);
  await Promise.all([enqueue(r.id), enqueue(r.id)]);
  assert.equal((await sql(`select count(*)::int n from jobs where request_id=$1`, [r.id]))[0].n, 1);
  await runOne();
  assert.equal(
    (await sql('select status from jobs where request_id=$1', [r.id]))[0].status,
    'done',
  );
  assert.equal(
    (await sql('select status from requests where id=$1', [r.id]))[0].status,
    'not_found',
  );
  assert.equal(
    (await sql('select count(*)::int n from attempts where request_id=$1', [r.id]))[0].n,
    1,
  );
});
test('Recupera tarefa interrompida após reinício, com limite de tentativas', async () => {
  const r = await demand(readerId, 'Pedido recovery', null, false);
  await enqueue(r.id);
  await sql(`update jobs set status='running',attempts=1 where request_id=$1`, [r.id]);
  const timer = await startWorker();
  clearInterval(timer);
  assert.equal(
    (await sql('select status from jobs where request_id=$1', [r.id]))[0].status,
    'queued',
  );
  await sql(`update jobs set status='running',attempts=2 where request_id=$1`, [r.id]);
  const timer2 = await startWorker();
  clearInterval(timer2);
  assert.equal(
    (await sql('select status from jobs where request_id=$1', [r.id]))[0].status,
    'failed',
  );
});
test('Fonte interna é reprovada, não pode ser aprovada ou baixada', async () => {
  const r = await demand(readerId, 'Livro interno teste', null, false);
  const source = await call(
    '/admin/sources',
    {
      requestId: r.id,
      title: 'Livro interno teste',
      authors: 'Teste',
      language: 'pt',
      edition: '2026',
      origin: 'Teste',
      url: 'https://127.0.0.1/private.pdf',
      evidence_url: 'https://127.0.0.1/license',
      license: 'CC BY 4.0',
      region: 'BR',
    },
    adminCookie,
  );
  assert.equal(source.data.validation.ok, false);
  assert.equal(
    (
      await call(
        '/admin/sources/' + source.data.id + '/approve',
        { confirmed: true, requestId: r.id },
        adminCookie,
      )
    ).status,
    500,
  );
  assert.equal((await call('/download/' + source.data.id)).status, 404);
});
test('União preserva interessados únicos e histórico', async () => {
  const a = await demand(readerId, 'Primeiro duplicado', null, false);
  const b = await demand(readerId, 'Segundo duplicado', null, false);
  await demand(otherId, 'Primeiro duplicado', null, false);
  await sql('insert into attempts(request_id,query,providers) values($1,$2,$3)', [
    a.id,
    'Primeiro duplicado',
    '[]',
  ]);
  assert.equal(
    (await call('/admin/requests/' + a.id + '/merge', { targetId: b.id }, adminCookie)).status,
    200,
  );
  assert.equal(
    (await sql('select count(*)::int n from interests where request_id=$1', [b.id]))[0].n,
    2,
  );
  assert.equal(
    (await sql('select count(*)::int n from attempts where request_id=$1', [b.id]))[0].n,
    1,
  );
});

test('Instâncias compartilham limite de chamadas no PostgreSQL', async () => {
  const a = new PostgresRateStore('test-shared'),
    b = new PostgresRateStore('test-shared');
  const counts = await Promise.all([a.increment('client'), b.increment('client')]);
  assert.deepEqual(counts.map((c) => c.totalHits).sort(), [1, 2]);
  await sql("update rate_limits set reset_at=now()-interval '1 second' where key=$1", [
    a.key('client'),
  ]);
  assert.equal((await b.increment('client')).totalHits, 1);
});
test('Worker não recupera nem duplica uma tarefa com lease ainda válido', async () => {
  const r = await demand(readerId, 'Pedido lease', null, false);
  await enqueue(r.id);
  await sql(
    `update jobs set status='running',attempts=1,lease_until=now()+interval '10 minutes',lease_token=gen_random_uuid() where request_id=$1`,
    [r.id],
  );
  const timer = await startWorker();
  clearInterval(timer);
  await Promise.all([runOne(), runOne()]);
  const [job] = await sql('select * from jobs where request_id=$1', [r.id]);
  assert.equal(job.status, 'running');
  assert.equal(job.attempts, 1);
  await sql(`update jobs set lease_until=now()-interval '1 second' where id=$1`, [job.id]);
  await Promise.all([runOne(), runOne()]);
  const [done] = await sql('select * from jobs where id=$1', [job.id]);
  assert.equal(done.status, 'done');
  assert.equal(done.attempts, 2);
});
test('Cron rejeita invocações sem autenticação', async () => {
  assert.equal((await call('/cron/worker', undefined, '')).status, 401);
});
