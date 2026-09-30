set search_path to entre_paginas;
alter table jobs add column if not exists lease_until timestamptz;
alter table jobs add column if not exists lease_token uuid;
create table if not exists rate_limits(key text primary key, hits int not null, reset_at timestamptz not null);
create index if not exists rate_limits_expiry on rate_limits(reset_at);
alter table rate_limits enable row level security;
revoke all on rate_limits from anon,authenticated;
