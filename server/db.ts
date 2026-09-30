import 'dotenv/config';
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { attachDatabasePool } from '@vercel/functions';
const schema = process.env.DB_SCHEMA || 'entre_paginas';
if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error('Schema inválido');
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  options: `-c search_path=${schema},public`,
  max: process.env.VERCEL ? 3 : 8,
  idleTimeoutMillis: 5000,
  connectionTimeoutMillis: 10000,
  ssl: process.env.DATABASE_URL?.includes('supabase')
    ? {
        rejectUnauthorized: true,
        ca: readFileSync(new URL('../certs/supabase-ca.crt', import.meta.url), 'utf8'),
      }
    : undefined,
});
if (process.env.VERCEL) attachDatabasePool(pool);
export async function sql<T = any>(text: string, params: unknown[] = []): Promise<T[]> {
  return (await pool.query(text, params)).rows;
}
export async function transaction<T>(fn: (q: typeof sql) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const value = await fn(async (text, params = []) => (await c.query(text, params)).rows);
    await c.query('COMMIT');
    return value;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}
