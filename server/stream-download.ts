import type { Response } from 'express';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
// Validation finishes before any bytes are sent; streaming avoids buffered payload limits.
export async function streamDownload(res: Response, body: Buffer) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.flushHeaders();
  async function* chunks() {
    for (let offset = 0; offset < body.length; offset += 64 * 1024)
      yield body.subarray(offset, offset + 64 * 1024);
  }
  await pipeline(Readable.from(chunks()), res);
}
