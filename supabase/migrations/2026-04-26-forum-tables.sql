-- Community Pulse forum-ingest tables.
-- Spec: docs/superpowers/specs/2026-04-26-community-pulse-forum-ingest-design.md

create table if not exists public.crawl_runs (
  id              uuid primary key default gen_random_uuid(),
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  source          text not null,
  threads_seen    int default 0,
  threads_new     int default 0,
  threads_updated int default 0,
  posts_ingested  int default 0,
  errors          jsonb,
  notes           text
);

create table if not exists public.forum_threads (
  id              uuid primary key default gen_random_uuid(),
  source          text not null check (source in ('excelmale','thinksteroids','longecity')),
  thread_url      text not null,
  thread_title    text not null,
  subforum        text,
  first_post_at   timestamptz,
  last_post_at    timestamptz,
  post_count      int not null,
  crawled_at      timestamptz not null default now(),
  crawl_run_id    uuid references public.crawl_runs(id),
  raw_html_hash   text,
  partial         boolean not null default false,
  unique (source, thread_url)
);
create index if not exists forum_threads_source_lastpost_idx
  on public.forum_threads (source, last_post_at desc);

create table if not exists public.forum_posts (
  id               uuid primary key default gen_random_uuid(),
  thread_id        uuid not null references public.forum_threads(id) on delete cascade,
  position         int not null,
  author_pseudonym text not null,
  posted_at        timestamptz,
  body_text        text not null,
  body_token_count int,
  unique (thread_id, position)
);
create index if not exists forum_posts_thread_position_idx
  on public.forum_posts (thread_id, position);

create table if not exists public.forum_classifications (
  id                   uuid primary key default gen_random_uuid(),
  thread_id            uuid not null references public.forum_threads(id) on delete cascade,
  prompt_version       text not null,
  classified_at        timestamptz not null default now(),
  enthusiasm           int not null check (enthusiasm between 0 and 10),
  credibility          int not null check (credibility between 0 and 10),
  red_flags            text[] not null default '{}',
  summary              text not null,
  representative_quote text not null,
  peptide_tags         text[] not null default '{}',
  include_in_widget    boolean not null,
  raw_haiku_response   jsonb,
  manual_override      text not null default 'none'
                       check (manual_override in ('none','force_exclude','force_include')),
  override_reason      text,
  override_set_by      text,
  override_set_at      timestamptz,
  featured_until       timestamptz,
  unique (thread_id, prompt_version)
);
create index if not exists forum_classifications_widget_idx
  on public.forum_classifications (peptide_tags, enthusiasm desc)
  where include_in_widget = true and manual_override != 'force_exclude';

-- RLS: deny-all by default; service-role bypasses RLS.
alter table public.crawl_runs            enable row level security;
alter table public.forum_threads         enable row level security;
alter table public.forum_posts           enable row level security;
alter table public.forum_classifications enable row level security;
