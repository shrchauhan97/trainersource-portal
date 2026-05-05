-- Allow forum_excelmale, forum_thinksteroids, forum_longecity in kb_chunks.source_type.
-- Required by the community-pulse forum-ingest pipeline; the SourceType TS union
-- was extended to match. Idempotent (drop-if-exists then add).
-- Spec: docs/superpowers/specs/2026-04-26-community-pulse-forum-ingest-design.md

alter table public.kb_chunks
  drop constraint if exists kb_chunks_source_type_check;

alter table public.kb_chunks
  add constraint kb_chunks_source_type_check check (
    source_type in (
      'matt_kb', 'yt_huberman', 'yt_smashrx', 'yt_creator',
      'yt_howto', 'pubmed', 'l30d', 'ts_manual',
      'forum_excelmale', 'forum_thinksteroids', 'forum_longecity'
    )
  );
