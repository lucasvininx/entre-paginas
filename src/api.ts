export async function api<T = any>(path: string, body?: unknown, method?: string): Promise<T> {
  const r = await fetch('/api' + path, {
    method: method || (body ? 'POST' : 'GET'),
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || 'Não foi possível conectar.');
  return data;
}
export const safeUrl = (url?: string) => (url && /^https:\/\//i.test(url) ? url : undefined);
