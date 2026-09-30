import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createHash } from 'node:crypto';
import { streamDownload } from '../server/stream-download.ts';
test('Download streaming preserva bytes acima de 4,5 MB sem Content-Length', async () => {
  const body = Buffer.alloc(6_000_000, 42);
  const app = express();
  app.get('/pdf', async (_req, res) => {
    res.type('application/pdf');
    await streamDownload(res, body);
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((r) => server.once('listening', r));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const response = await fetch(`http://127.0.0.1:${address.port}/pdf`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-length'), null);
    assert.match(response.headers.get('cache-control') || '', /no-store/);
    const received = Buffer.from(await response.arrayBuffer());
    assert.equal(received.length, body.length);
    assert.equal(
      createHash('sha256').update(received).digest('hex'),
      createHash('sha256').update(body).digest('hex'),
    );
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});
