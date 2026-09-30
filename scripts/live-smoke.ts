import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const credentials = JSON.parse(
  await readFile(new URL('../.local/admin-access.json', import.meta.url), 'utf8'),
);
const base = 'http://localhost:3001/api';
let cookie = '';
async function call(path: string, body?: unknown) {
  const r = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      Origin: 'http://localhost:5173',
      'Content-Type': 'application/json',
      Cookie: cookie,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(data));
  if (r.headers.get('set-cookie')) cookie = r.headers.get('set-cookie')!.split(';')[0];
  return data;
}
await call('/login', credentials);
const search = await call('/search', { query: 'Dom Casmurro' });
console.log('Busca real:', {
  books: search.books.length,
  providers: search.providers,
  request: !!search.request,
});
assert.ok(search.books.some((b: any) => b.title.toLowerCase().includes('casmurro')));
const demand = await call('/requests', {
  query: 'Urban Water Demand Management',
  title: 'Urban Water Demand Management',
  author: 'Corinne Ong; Cecilia Tortajada; Ojasvee Arora',
  language: 'en',
});
const source = await call('/admin/sources', {
  requestId: demand.id,
  title: 'Urban Water Demand Management',
  authors: 'Corinne Ong; Cecilia Tortajada; Ojasvee Arora',
  language: 'en',
  edition: 'Springer, 2023 · ISBN 9789811986772',
  origin: 'OAPEN / Springer',
  url: 'https://library.oapen.org/rest/bitstreams/1cd27c2e-6e92-43b1-9de1-576039ebf57f/retrieve',
  evidence_url:
    'https://library.oapen.org/rest/items/38db59b3-3027-4d41-8f10-da562e100671?expand=metadata',
  license:
    'Creative Commons Attribution 4.0 International — licença conferida na página 5 do PDF original',
  region: 'WORLD',
});
assert.equal(source.validation.ok, true);
await call('/admin/sources/' + source.id + '/approve', { confirmed: true, requestId: demand.id });
await call('/admin/sources/' + source.id + '/validate', {});
const book = await call('/books/' + source.book_id);
assert.equal(book.available, true);
const r = await fetch(base + '/download/' + source.id, { headers: { Cookie: cookie } });
assert.equal(r.status, 200);
assert.match(r.headers.get('content-type') || '', /application\/pdf/);
const bytes = Buffer.from(await r.arrayBuffer());
assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
assert.ok(bytes.length > 1000000);
const requests = await call('/requests');
assert.equal(requests.find((v: any) => v.id === demand.id).status, 'available');
const notifications = await call('/notifications');
assert.ok(notifications.some((n: any) => n.message.includes('Urban Water')));
const result = {
  at: new Date().toISOString(),
  search: { query: 'Dom Casmurro', count: search.books.length, providers: search.providers },
  pdf: { title: source.title, bytes: bytes.length, sourceId: source.id },
  request: 'available',
  notification: true,
};
await writeFile(
  new URL('../.local/live-smoke.json', import.meta.url),
  JSON.stringify(result, null, 2),
);
console.log('Fluxo real aprovado:', result.pdf, result.request);
