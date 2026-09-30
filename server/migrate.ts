import { readFile } from 'node:fs/promises';
import { pool } from './db.ts';
await pool.query(
  await readFile(
    new URL('../supabase/migrations/202609300001_initial.sql', import.meta.url),
    'utf8',
  ),
);
console.log('Migration aplicada.');
await pool.end();
