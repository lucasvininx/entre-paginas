import https from 'node:https';
import { lookup } from 'node:dns/promises';
import ipaddr from 'ipaddr.js';
import { PDFDocument } from 'pdf-lib';
export function publicAddress(address: string) {
  try {
    let ip = ipaddr.parse(address);
    if (ip.kind() === 'ipv6' && (ip as ipaddr.IPv6).isIPv4MappedAddress())
      ip = (ip as ipaddr.IPv6).toIPv4Address();
    return ip.range() === 'unicast';
  } catch {
    return false;
  }
}
export async function safeFetch(
  raw: string,
  limit = 2_000_000,
  redirects = 0,
  deadline = Date.now() + 20000,
): Promise<{ body: Buffer; type: string; url: string }> {
  const u = new URL(raw);
  if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443'))
    throw new Error('Somente HTTPS público na porta 443.');
  if (redirects > 4 || Date.now() > deadline) throw new Error('Limite de redirecionamentos/tempo.');
  const addresses = await Promise.race([
    lookup(u.hostname.replace(/^\[|\]$/g, ''), { all: true }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('DNS timeout')), 3000).unref(),
    ),
  ]);
  if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
    throw new Error('Destino privado ou reservado bloqueado.');
  return new Promise((resolve, reject) => {
    const a = addresses[0];
    const request = https.get(
      u,
      {
        headers: {
          'User-Agent': 'EntrePaginas/1.0 (personal book discovery)',
          Accept: 'application/json, application/pdf, */*',
        },
        lookup: ((_host: any, _opts: any, cb: any) =>
          _opts?.all ? cb(null, [a]) : cb(null, a.address, a.family)) as any,
      },
      (res) => {
        if (res.statusCode && [301, 302, 303, 307, 308].includes(res.statusCode)) {
          res.resume();
          if (!res.headers.location) return reject(new Error('Redirect inválido'));
          safeFetch(new URL(res.headers.location, u).href, limit, redirects + 1, deadline).then(
            resolve,
            reject,
          );
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        if (Number(res.headers['content-length'] || 0) > limit) {
          res.destroy();
          return reject(new Error('Arquivo excede o limite'));
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (chunk) => {
          size += chunk.length;
          if (size > limit) {
            res.destroy();
            reject(new Error('Resposta excede o limite'));
          } else chunks.push(chunk);
        });
        res.on('error', reject);
        res.on('end', () =>
          resolve({
            body: Buffer.concat(chunks),
            type: res.headers['content-type'] || '',
            url: u.href,
          }),
        );
      },
    );
    const timer = setTimeout(
      () => request.destroy(new Error('Timeout da fonte')),
      Math.max(1, deadline - Date.now()),
    );
    request.on('close', () => clearTimeout(timer));
    request.on('error', reject);
  });
}
export function assertPdf(body: Buffer, type: string) {
  if (
    !type.toLowerCase().includes('application/pdf') ||
    body.subarray(0, 5).toString() !== '%PDF-' ||
    !body.subarray(-2048).includes(Buffer.from('%%EOF'))
  )
    throw new Error('Não é um PDF completo válido (tipo, assinatura ou EOF).');
}
export async function validatePdf(url: string) {
  const r = await safeFetch(url, 35_000_000);
  assertPdf(r.body, r.type);
  const document = await PDFDocument.load(r.body, {
    ignoreEncryption: false,
    throwOnInvalidObject: true,
  });
  if (document.getPageCount() < 1) throw new Error('PDF sem páginas');
  return { ...r, pages: document.getPageCount() };
}
