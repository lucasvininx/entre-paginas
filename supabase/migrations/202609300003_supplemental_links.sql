set search_path to entre_paginas;
alter table books add column if not exists supplemental_links jsonb not null default '[]'::jsonb
  check (jsonb_typeof(supplemental_links) = 'array');
