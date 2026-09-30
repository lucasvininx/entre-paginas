import { createHash } from 'node:crypto';
import { rateLimit, type Options, type Store } from 'express-rate-limit';
import { sql } from './db.ts';
export class PostgresRateStore implements Store {
  windowMs = 60000;
  constructor(readonly prefix: string) {}
  init(options: Options) {
    this.windowMs = options.windowMs;
  }
  key(key: string) {
    return this.prefix + ':' + createHash('sha256').update(key).digest('hex');
  }
  async increment(key: string) {
    const [row] = await sql(
      `insert into rate_limits(key,hits,reset_at) values($1,1,now()+($2*interval '1 millisecond')) on conflict(key) do update set hits=case when rate_limits.reset_at<=now() then 1 else rate_limits.hits+1 end,reset_at=case when rate_limits.reset_at<=now() then excluded.reset_at else rate_limits.reset_at end returning hits,reset_at`,
      [this.key(key), this.windowMs],
    );
    return { totalHits: row.hits, resetTime: new Date(row.reset_at) };
  }
  async decrement(key: string) {
    await sql('update rate_limits set hits=greatest(0,hits-1) where key=$1', [this.key(key)]);
  }
  async resetKey(key: string) {
    await sql('delete from rate_limits where key=$1', [this.key(key)]);
  }
}
export const limiter = (name: string, windowMs: number, limit: number) =>
  rateLimit({
    windowMs,
    limit,
    store: new PostgresRateStore(name),
    standardHeaders: 'draft-8',
    legacyHeaders: false,
  });
