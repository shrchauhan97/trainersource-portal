-- 2026-05-30 — kb_chunks.published_at: schema-of-record + corpus backfill.
--
-- Live state at the start of this wave:
--   * column `published_at timestamptz NULL` already exists in production
--     (drift — present in DB but missing from supabase/schema.sql)
--   * 3503 chunks in kb_chunks, 0 with a date populated, last ingest 2026-04-26
--     to 2026-05-07. T3.4 in bugs/AGGREGATE.md flagged the bot is replying off
--     ~24-day-old corpus with zero recency framing because every row's
--     published_at is null even though the bot's RetrievedChunk shape and
--     formatChunksForPrompt() are wired to surface it.
--
-- The companion fix in the bot repo threads `published_at` through the
-- Chunk type → chunker → upsert path so NEW chunks land with a date. This
-- migration covers the back-half:
--
--   1. `ADD COLUMN IF NOT EXISTS` reasserts the column in the schema-of-record
--      so anyone rebuilding from supabase/schema.sql (or a fresh Supabase
--      project) gets the same shape as prod.
--   2. Backfill the two sources where a date is recoverable from existing
--      data WITHOUT a re-ingest:
--        - pubmed (~148 rows): source_title is canonical
--          "Author et al. (YYYY) — …", so regex out the year.
--        - forum (~1744 rows): parent_doc_id is forum_threads.id;
--          forum_threads.first_post_at is the closest analogue to a
--          publication timestamp on a forum thread.
--   3. The remaining source types (yt_*, matt_kb, ts_manual, l30d ≈ 1611
--      rows) have no in-DB date to backfill from. They will pick up dates as
--      they are re-ingested on the next refresh cycle.
--
-- Idempotency:
--   * ADD COLUMN IF NOT EXISTS — no-op if the column is present.
--   * Both UPDATEs are gated on `published_at IS NULL`, so re-running this
--     migration after some rows have been re-ingested with newer dates will
--     not stomp them.

-- 1. Schema-of-record (no-op in prod; matters for clean rebuilds).
ALTER TABLE public.kb_chunks
  ADD COLUMN IF NOT EXISTS published_at timestamptz;

-- 2. Backfill pubmed from the citation year baked into source_title.
--    `Author et al. (YYYY) — Title.` → YYYY-01-01.
WITH parsed AS (
  SELECT
    id,
    substring(source_title FROM '\((\d{4})\)') AS yr
  FROM public.kb_chunks
  WHERE source_type = 'pubmed' AND published_at IS NULL
)
UPDATE public.kb_chunks AS k
SET published_at = make_timestamptz(parsed.yr::int, 1, 1, 0, 0, 0, 'UTC')
FROM parsed
WHERE k.id = parsed.id
  AND parsed.yr ~ '^(19|20)\d{2}$';

-- 3. Cascade-backfill forum_threads from forum_posts.posted_at. The crawler
--    (scripts/ingest/sources/forum/db.ts:upsertThread) currently does not
--    populate first_post_at / last_post_at even though it has all the
--    posted_at values in `input.posts[].postedAt` — a companion fix in the
--    bot repo wires those columns into the upsert payload for new crawls;
--    this UPDATE retroactively fixes the ~107 existing rows so step 4 can
--    use them. Gated on NULL so re-running is a no-op once the values are
--    in place.
WITH thread_times AS (
  SELECT thread_id,
         min(posted_at) AS first_post,
         max(posted_at) AS last_post
  FROM public.forum_posts
  WHERE posted_at IS NOT NULL
  GROUP BY thread_id
)
UPDATE public.forum_threads AS ft
SET
  first_post_at = COALESCE(ft.first_post_at, tt.first_post),
  last_post_at  = COALESCE(ft.last_post_at,  tt.last_post)
FROM thread_times AS tt
WHERE ft.id = tt.thread_id
  AND (ft.first_post_at IS NULL OR ft.last_post_at IS NULL);

-- 4. Backfill kb_chunks for forum sources from forum_threads.first_post_at.
--    `parent_doc_id` for forum chunks is the forum_threads.id uuid as text.
UPDATE public.kb_chunks AS k
SET published_at = ft.first_post_at
FROM public.forum_threads AS ft
WHERE k.source_type LIKE 'forum_%'
  AND k.published_at IS NULL
  AND ft.first_post_at IS NOT NULL
  AND k.parent_doc_id = ft.id::text;
