-- T4.18b — Drop ~9 indexes flagged "unused" by the Supabase advisor.
--
-- Audit basis: bugs/A6-db-integrity.md. Each index below was flagged by the
-- `unused_index` advisor (zero scans, non-trivial maintenance cost on writes).
-- For each drop, the original CREATE statement is preserved as a comment so
-- recovery is a one-liner if a future query plan needs the index back.
--
-- This migration does NOT drop:
--   - idx_customers_status — currently unfiltered in app code, but kept by
--     explicit decision (low-cost btree on a 3-value enum; admin tooling
--     for the lifecycle dashboard is the obvious future caller).
--   - idx_trainers_status  — VERIFIED IN USE by the admin trainer-filter
--     query in src/components/admin/data.ts:206 (`.eq('status', ...)` on
--     a `from('trainers')` chain).
--
-- Apply via Supabase SQL Editor. Idempotent — DROP INDEX IF EXISTS.

BEGIN;

DROP INDEX IF EXISTS public.kb_chunks_creator_idx;
-- ROLLBACK (run outside txn — CONCURRENTLY): CREATE INDEX CONCURRENTLY IF NOT EXISTS kb_chunks_creator_idx ON public.kb_chunks (source_creator) WHERE source_creator IS NOT NULL;

DROP INDEX IF EXISTS public.kb_chunks_sku_hints_idx;
-- ROLLBACK (run outside txn — CONCURRENTLY): CREATE INDEX CONCURRENTLY IF NOT EXISTS kb_chunks_sku_hints_idx ON public.kb_chunks USING gin (sku_hints);

DROP INDEX IF EXISTS public.bc_customer_links_reengage_idx;
-- ROLLBACK (run outside txn — CONCURRENTLY): CREATE INDEX CONCURRENTLY IF NOT EXISTS bc_customer_links_reengage_idx ON public.bc_customer_links (last_reminder_at) WHERE quiet_mode = false;

DROP INDEX IF EXISTS public.coa_cache_lot_idx;
-- ROLLBACK (run outside txn — CONCURRENTLY): CREATE INDEX CONCURRENTLY IF NOT EXISTS coa_cache_lot_idx ON public.coa_cache (lot_number);

DROP INDEX IF EXISTS public.coa_missing_events_sku_idx;
-- ROLLBACK (run outside txn — CONCURRENTLY): CREATE INDEX CONCURRENTLY IF NOT EXISTS coa_missing_events_sku_idx ON public.coa_missing_events (sku);

DROP INDEX IF EXISTS public.coa_missing_events_requested_at_idx;
-- ROLLBACK (run outside txn — CONCURRENTLY): CREATE INDEX CONCURRENTLY IF NOT EXISTS coa_missing_events_requested_at_idx ON public.coa_missing_events (requested_at DESC);

DROP INDEX IF EXISTS public.bot_feedback_user_idx;
-- ROLLBACK (run outside txn — CONCURRENTLY): CREATE INDEX CONCURRENTLY IF NOT EXISTS bot_feedback_user_idx ON public.bot_feedback (telegram_user_id);

DROP INDEX IF EXISTS public.bot_feedback_rating_idx;
-- ROLLBACK (run outside txn — CONCURRENTLY): CREATE INDEX CONCURRENTLY IF NOT EXISTS bot_feedback_rating_idx ON public.bot_feedback (rating);

DROP INDEX IF EXISTS public.forum_threads_source_lastpost_idx;
-- ROLLBACK (run outside txn — CONCURRENTLY): CREATE INDEX CONCURRENTLY IF NOT EXISTS forum_threads_source_lastpost_idx ON public.forum_threads (source, last_post_at DESC);

COMMIT;
