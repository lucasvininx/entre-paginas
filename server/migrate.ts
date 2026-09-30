import { readFile, readdir } from 'node:fs/promises';
import { pool } from './db.ts';
const folder = new URL('../supabase/migrations/', import.meta.url);
for (const file of (await readdir(folder)).filter((f) => f.endsWith('.sql')).sort()) {
  await pool.query(await readFile(new URL(file, folder), 'utf8'));
  console.log('Migration aplicada:', file);
}
await pool.end();
