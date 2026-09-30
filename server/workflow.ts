import { sql, transaction } from './db.ts';
import { catalog, discover } from './providers.ts';
import { normalize } from './normalize.ts';
import { safeFetch, validatePdf } from './safe-fetch.ts';
export async function demand(
  userId: string,
  query: string,
  book: any | null,
  incomplete: boolean,
  details: any = {},
) {
  return transaction(async (q) => {
    const key = book ? `book:${book.id}` : `query:${normalize(query)}:${details.language || '?'}`;
    const [r] = await q(
      `insert into requests(identity,book_id,query,normalized_query,title,author,isbn,language,edition,reason,status) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) on conflict(identity) do update set last_at=now() returning *`,
      [
        key,
        book?.id || null,
        query,
        normalize(query),
        book?.title || details.title || null,
        book?.authors || details.author || null,
        book?.isbn || null,
        book?.language || details.language || null,
        book?.edition || null,
        book ? 'pdf_unavailable' : 'unidentified',
        incomplete ? 'temporary_error' : 'pending',
      ],
    );
    await q('insert into interests(request_id,user_id) values($1,$2) on conflict do nothing', [
      r.id,
      userId,
    ]);
    return r;
  });
}
export async function enqueue(id: string) {
  return transaction(async (q) => {
    const [r] = await q('select * from requests where id=$1 for update', [id]);
    if (!r) throw new Error('Solicitação não encontrada');
    if (r.status === 'available') throw new Error('Livro já disponível');
    const [job] = await q(
      `insert into jobs(request_id) values($1) on conflict(request_id) where status in ('queued','running') do nothing returning *`,
      [id],
    );
    if (job) await q(`update requests set status='searching' where id=$1`, [id]);
    return job || { status: 'already_queued' };
  });
}
export async function validateSource(id: string) {
  const [s] = await sql('select * from sources where id=$1', [id]);
  if (!s) throw new Error('Fonte não encontrada');
  try {
    if (!s.license || !s.evidence_url) throw new Error('Evidência de autorização ausente');
    await safeFetch(s.evidence_url, 6_000_000);
    const p = await validatePdf(s.url);
    const validation = {
      ok: true,
      size: p.body.length,
      pages: p.pages,
      finalUrl: p.url,
      message:
        'PDF íntegro. Confirme edição, idioma, integridade editorial e licença antes de aprovar.',
    };
    await sql(
      `update sources set status=case when status='approved' then 'approved' else 'validated' end,validation=$2,validated_at=now() where id=$1`,
      [id, JSON.stringify(validation)],
    );
    return validation;
  } catch (e) {
    const validation = { ok: false, message: (e as Error).message };
    await sql(`update sources set status='rejected',validation=$2,validated_at=now() where id=$1`, [
      id,
      JSON.stringify(validation),
    ]);
    await sql(
      `update requests set status='temporary_error' where book_id=$1 and status='available' and not exists(select 1 from sources where book_id=$1 and status='approved')`,
      [s.book_id],
    );
    return validation;
  }
}
export async function approve(id: string, admin: string, requestId?: string) {
  await validateSource(id);
  return transaction(async (q) => {
    const [s] = await q('select * from sources where id=$1 for update', [id]);
    if (!s || !['validated', 'approved'].includes(s.status))
      throw new Error('Arquivo reprovado na validação');
    if (s.region !== 'WORLD' && s.region !== (process.env.REGION || 'BR'))
      throw new Error('Confirme autorização para a região da aplicação antes de aprovar');
    const [book] = await q('select * from books where id=$1', [s.book_id]);
    if (
      !book ||
      normalize(book.title) !== normalize(s.title) ||
      normalize(book.authors) !== normalize(s.authors) ||
      (book.language && book.language !== s.language) ||
      (book.edition && normalize(book.edition) !== normalize(s.edition || ''))
    )
      throw new Error(
        'Dados da fonte não correspondem ao livro/edição do catálogo. Corrija o vínculo antes de aprovar.',
      );
    let bookId = s.book_id;
    if (requestId) {
      const [r] = await q('select * from requests where id=$1 for update', [requestId]);
      if (!r) throw new Error('Pedido não encontrado');
      if (r.book_id && r.book_id !== bookId)
        throw new Error('Edição diferente: revise o vínculo antes de aprovar');
      if (!r.book_id)
        await q('update requests set book_id=$2,title=$3,author=$4 where id=$1', [
          requestId,
          bookId,
          s.title,
          s.authors,
        ]);
    }
    await q(`update sources set status='approved',approved_by=$2 where id=$1`, [id, admin]);
    const rs = await q(
      `update requests set status='available',last_at=now() where book_id=$1 and status<>'available' returning id`,
      [bookId],
    );
    for (const r of rs)
      await q(
        `insert into notifications(user_id,request_id,message) select user_id,$1,$2 from interests where request_id=$1`,
        [r.id, `O livro “${s.title}” está disponível para baixar.`],
      );
    return { ok: true };
  });
}
export async function runOne() {
  const job = await transaction(async (q) => {
    const [j] = await q(
      `select * from jobs where status='queued' order by created_at for update skip locked limit 1`,
    );
    if (j)
      await q(`update jobs set status='running',started_at=now(),attempts=attempts+1 where id=$1`, [
        j.id,
      ]);
    return j;
  });
  if (!job) return;
  try {
    const [r] = await sql('select * from requests where id=$1', [job.request_id]);
    const result = await discover([r.title || r.query, r.author || ''].join(' '), true);
    const candidateIds: string[] = [];
    const rejected: { title: string; reason: string }[] = [];
    for (const b of result.books) {
      const book = await catalog(b);
      if (r.title && normalize(r.title) !== normalize(b.title)) {
        rejected.push({ title: b.title, reason: 'Título diferente; correspondência incerta' });
        continue;
      }
      if (r.language && b.language && r.language !== b.language) {
        rejected.push({ title: b.title, reason: 'Idioma diferente' });
        continue;
      }
      if (candidateIds.length >= 8) continue;
      const sources = await sql(
        `select id from sources where book_id=$1 and status in ('candidate','rejected','validated')`,
        [book.id],
      );
      for (const s of sources.slice(0, 2)) {
        await sql('update sources set request_id=$2 where id=$1', [s.id, r.id]);
        await validateSource(s.id);
        candidateIds.push(s.id);
      }
    }
    const status = candidateIds.length
      ? 'review'
      : result.providers.some((p) => !p.ok)
        ? 'temporary_error'
        : 'not_found';
    await transaction(async (q) => {
      await q('insert into attempts(request_id,query,providers) values($1,$2,$3)', [
        r.id,
        r.query,
        JSON.stringify(result.providers),
      ]);
      await q("update requests set status=$2 where id=$1 and status='searching'", [r.id, status]);
      await q(`update jobs set status='done',finished_at=now(),result=$2 where id=$1`, [
        job.id,
        JSON.stringify({
          providers: result.providers,
          candidateIds,
          books: result.books.length,
          rejected,
          leads: result.leads || [],
        }),
      ]);
    });
  } catch (e) {
    await sql(`update jobs set status='failed',finished_at=now(),result=$2 where id=$1`, [
      job.id,
      JSON.stringify({ error: (e as Error).message }),
    ]);
    await sql(`update requests set status='temporary_error' where id=$1 and status='searching'`, [
      job.request_id,
    ]);
  }
}
export async function startWorker() {
  // One server instance; interrupted work gets one bounded recovery.
  await sql(
    `update jobs set status=case when attempts<2 then 'queued' else 'failed' end where status='running'`,
  );
  await sql(
    `update requests set status='temporary_error' where status='searching' and not exists(select 1 from jobs where jobs.request_id=requests.id and jobs.status in ('running','queued'))`,
  );
  let busy = false;
  const timer = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      await runOne();
    } catch (e) {
      console.error('Worker:', (e as Error).message);
    } finally {
      busy = false;
    }
  }, 2500);
  return timer;
}
