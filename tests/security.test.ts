import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publicAddress, safeFetch, assertPdf } from '../server/safe-fetch.ts';
import { identity, normalize, isbn } from '../server/normalize.ts';
test('SSRF: endereços locais, privados, IPv6 mapeado e metadata são bloqueados', () => {
  for (const ip of [
    '127.0.0.1',
    '10.0.0.1',
    '192.168.0.1',
    '172.16.1.2',
    '169.254.169.254',
    '0.0.0.0',
    '::1',
    'fc00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
    '100.64.0.1',
  ])
    assert.equal(publicAddress(ip), false, ip);
  assert.equal(publicAddress('8.8.8.8'), true);
});
test('SSRF: HTTPS público obrigatório e DNS local bloqueado', async () => {
  for (const u of [
    'http://example.com/a.pdf',
    'https://127.0.0.1/a.pdf',
    'https://[::1]/a.pdf',
    'https://user:pass@example.com/a.pdf',
    'https://example.com:8443/a.pdf',
  ])
    await assert.rejects(() => safeFetch(u));
});
test('HTML, EPUB e PDF truncado não passam na validação', () => {
  assert.throws(() => assertPdf(Buffer.from('<html/>'), 'application/pdf'));
  assert.throws(() => assertPdf(Buffer.from('PK epub'), 'application/epub+zip'));
  assert.throws(() => assertPdf(Buffer.from('%PDF-1.7 data'), 'application/pdf'));
  assert.throws(() => assertPdf(Buffer.from('%PDF-1.7\n%%EOF'), 'text/html'));
  assert.doesNotThrow(() => assertPdf(Buffer.from('%PDF-1.7\n%%EOF'), 'application/pdf'));
});
test('Normaliza acentos e ISBN sem juntar idiomas ou edições diferentes', () => {
  assert.equal(normalize('  DOM Cásmurro! '), 'dom casmurro');
  assert.equal(normalize('文学'), '文学');
  assert.equal(isbn('978-12 3-x'), '978123X');
  const b = {
    isbn: '978123',
    title: 'Livro',
    authors: 'Autora',
    origin: 'A',
    language: 'pt',
    edition: '2020',
  };
  assert.notEqual(identity(b), identity({ ...b, language: 'en' }));
  assert.notEqual(identity(b), identity({ ...b, edition: '2021' }));
});
