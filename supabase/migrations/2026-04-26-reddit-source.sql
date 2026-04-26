-- Add 'reddit' as a valid forum source.
-- Adds 'forum_reddit' to the kb_chunks source_type CHECK constraint.
-- Adds 'reddit' to the forum_threads.source CHECK constraint.
-- Idempotent (drop-if-exists then re-add).

alter table public.forum_threads
  drop constraint if exists forum_threads_source_check;

alter table public.forum_threads
  add constraint forum_threads_source_check check (
    source in ('excelmale','thinksteroids','longecity','reddit')
  );

alter table public.kb_chunks
  drop constraint if exists kb_chunks_source_type_check;

alter table public.kb_chunks
  add constraint kb_chunks_source_type_check check (
    source_type in (
      'matt_kb', 'yt_huberman', 'yt_smashrx', 'yt_creator',
      'yt_howto', 'pubmed', 'l30d', 'ts_manual',
      'forum_excelmale', 'forum_thinksteroids', 'forum_longecity', 'forum_reddit'
    )
  );
