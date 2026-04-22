-- ============================================================================
-- Peptide Concierge v2 — kb_chunks schema + RLS (Plan 1 RAG foundation)
-- ============================================================================
-- Paste this entire file into Supabase SQL Editor for project:
--   odfgxeqmqmreqrbmnamm (trainersource-dev)
-- Or apply via: psql "$SUPABASE_DB_URL" -f supabase/apply-kb-chunks.sql
--
-- Safe to run multiple times: all DDL uses IF NOT EXISTS / OR REPLACE.
-- ============================================================================

-- === extension ===
create extension if not exists vector;

-- === kb_chunks table ===
create table if not exists public.kb_chunks (
  id               uuid primary key default gen_random_uuid(),
  source_type      text not null,
  source_creator   text,
  source_url       text,
  source_title     text not null,
  show_attribution boolean not null default true,
  mode             text not null default 'all',
  parent_doc_id    text not null,
  chunk_position   int not null,
  text             text not null,
  tags             text[] not null default '{}',
  sku_hints        text[] not null default '{}',
  embedding        vector(768) not null,
  ingested_at      timestamptz not null default now(),
  content_hash     text not null unique,
  constraint kb_chunks_mode_check check (mode in ('all', 'partner_only', 'customer_only')),
  constraint kb_chunks_source_type_check check (
    source_type in ('matt_kb', 'yt_huberman', 'yt_smashrx', 'yt_creator',
                    'yt_howto', 'pubmed', 'l30d', 'ts_manual')
  )
);

-- === indexes ===
create index if not exists kb_chunks_embedding_idx
  on public.kb_chunks using hnsw (embedding vector_cosine_ops);
create index if not exists kb_chunks_source_mode_idx
  on public.kb_chunks (source_type, mode);
create index if not exists kb_chunks_creator_idx
  on public.kb_chunks (source_creator) where source_creator is not null;
create index if not exists kb_chunks_sku_hints_idx
  on public.kb_chunks using gin (sku_hints);

-- === match_chunks RPC (mode-filtered top-K) ===
create or replace function match_chunks(
  query_embedding vector(768),
  match_count int default 6,
  mode_filter text default 'customer'
)
returns table (
  id uuid,
  source_type text,
  source_creator text,
  source_url text,
  source_title text,
  show_attribution boolean,
  text text,
  tags text[],
  sku_hints text[],
  similarity float
)
language sql stable parallel safe
as $$
  select
    c.id, c.source_type, c.source_creator, c.source_url, c.source_title,
    c.show_attribution, c.text, c.tags, c.sku_hints,
    1 - (c.embedding <=> query_embedding) as similarity
  from public.kb_chunks c
  where
    case when mode_filter = 'partner'
      then c.mode in ('all', 'partner_only')
      else c.mode in ('all', 'customer_only')
    end
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

-- === match_chunks_biased RPC (source-biased with creator boost) ===
create or replace function match_chunks_biased(
  query_embedding vector(768),
  source_types text[],
  creator_boost jsonb default '{}',
  match_count int default 4,
  mode_filter text default 'customer'
)
returns table (
  id uuid,
  source_type text,
  source_creator text,
  source_url text,
  source_title text,
  show_attribution boolean,
  text text,
  tags text[],
  sku_hints text[],
  similarity float
)
language sql stable parallel safe
as $$
  select
    c.id, c.source_type, c.source_creator, c.source_url, c.source_title,
    c.show_attribution, c.text, c.tags, c.sku_hints,
    greatest(1 - (c.embedding <=> query_embedding), 0) *
      coalesce((creator_boost ->> c.source_creator)::float, 1.0)
      as similarity
  from public.kb_chunks c
  where
    c.source_type = any(source_types)
    and case when mode_filter = 'partner'
      then c.mode in ('all', 'partner_only')
      else c.mode in ('all', 'customer_only')
    end
  order by
    greatest(1 - (c.embedding <=> query_embedding), 0) *
      coalesce((creator_boost ->> c.source_creator)::float, 1.0)
    desc
  limit match_count;
$$;

-- === RLS ===
alter table public.kb_chunks enable row level security;

-- Service role bypass only — no anon/authenticated access
-- (bot uses service role key; portal does not query this table)
drop policy if exists kb_chunks_service_role on public.kb_chunks;
create policy kb_chunks_service_role on public.kb_chunks
  for all to service_role using (true) with check (true);

-- === smoke check — prints row count so you know it worked ===
select 'kb_chunks ready; current row count:' as status, count(*) as rows from public.kb_chunks;
