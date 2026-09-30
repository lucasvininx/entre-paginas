set search_path to entre_paginas;
create table if not exists uploaded_files (
 id uuid primary key default gen_random_uuid(),
 book_id uuid not null references books on delete cascade,
 filename text not null,
 sha256 text not null,
 content bytea not null check(octet_length(content) between 1 and 35000000),
 pages integer not null check(pages>0),
 created_at timestamptz not null default now(),
 unique(book_id,sha256)
);
alter table uploaded_files enable row level security;
revoke all on uploaded_files from anon,authenticated;
