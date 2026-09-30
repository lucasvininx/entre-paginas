import { readFile } from 'node:fs/promises';
const credentials = JSON.parse(
  await readFile(new URL('../.local/admin-access.json', import.meta.url), 'utf8'),
);
const base = 'http://localhost:3001/api';
const login = await fetch(base + '/login', {
  method: 'POST',
  headers: { Origin: 'http://localhost:5173', 'Content-Type': 'application/json' },
  body: JSON.stringify(credentials),
});
const cookie = login.headers.get('set-cookie')!.split(';')[0];
const requests = (await (
  await fetch(base + '/requests', { headers: { Cookie: cookie } })
).json()) as any[];
const request = requests.find((r) => r.query === 'Dom Casmurro');
const r = await fetch(base + '/admin/requests/' + request.id + '/search', {
  method: 'POST',
  headers: { Origin: 'http://localhost:5173', 'Content-Type': 'application/json', Cookie: cookie },
  body: '{}',
});
console.log('Tarefa real HTTP', r.status, await r.json());
