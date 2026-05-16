-- DB hygiene — Wave 7 (2026-05-16)
--
-- Cleanup pass against `mcp__Supabase__get_advisors` warnings flagged this
-- evening. All changes are purely defensive / additive — no policy rewrites,
-- no table shape changes, no breaking semantics.
--
-- 1. REVOKE EXECUTE from anon/authenticated on SECURITY DEFINER RPCs that
--    are only ever meant to be called via the service role (server-side
--    routes / cron / webhook handlers). The functions still work; anon and
--    authenticated just can't reach them via /rest/v1/rpc anymore.
--    KEPT public: `validate_and_consume_code` — intentionally anon-callable
--    from the bc-paste.js gate submit.
--
-- 2. ALTER FUNCTION ... SET search_path on `match_chunks` and
--    `match_chunks_biased` — closes the WARN about mutable search_path
--    enabling potential function-hijacking via search_path manipulation.
--
-- 3. CREATE INDEX on the 6 unindexed FKs flagged by performance advisor.
--    `fk_consumed_by` on access_codes is the hottest one (touched by every
--    gate consume). All idempotent (IF NOT EXISTS).
--
-- Idempotent. Safe to re-run. Reversible via the inverse GRANT/DROP commands.

-- =============================================================
-- 1. RPC EXECUTE permission tightening
-- =============================================================

-- Server-side only (called via service role from /api/...):
REVOKE EXECUTE ON FUNCTION public.link_telegram_to_trainer(bigint, uuid, text, inet, text)              FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.forget_telegram_user(bigint)                                          FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ingest_bc_order_and_commission(text, uuid, uuid, numeric, text, text, text, text, timestamptz, timestamptz, text, numeric, numeric) FROM anon, authenticated;

-- Internal RLS helpers (called by policy expressions, never by clients):
REVOKE EXECUTE ON FUNCTION public.is_admin()                                                            FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.current_trainer_id()                                                  FROM anon, authenticated;

-- `validate_and_consume_code` stays anon-callable. Documented intent:
COMMENT ON FUNCTION public.validate_and_consume_code(text, text, text, text, text, text[]) IS
  'Anon-callable by design: the BC bc-paste.js gate submits to /api/codes/validate which proxies here. Only path that may consume an access_code.';

-- =============================================================
-- 2. Mutable search_path hardening (T4.22)
-- =============================================================

ALTER FUNCTION public.match_chunks        SET search_path = public, pg_temp;
ALTER FUNCTION public.match_chunks_biased SET search_path = public, pg_temp;

-- =============================================================
-- 3. Covering indexes for unindexed FKs (T4.18)
-- =============================================================

CREATE INDEX IF NOT EXISTS idx_access_codes_consumed_by
  ON public.access_codes (consumed_by)
  WHERE consumed_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bot_blocklist_blocked_by
  ON public.bot_blocklist (blocked_by)
  WHERE blocked_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_code_attempts_access_code_id
  ON public.code_attempts (access_code_id)
  WHERE access_code_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customers_access_code_id
  ON public.customers (access_code_id)
  WHERE access_code_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_forum_threads_crawl_run_id
  ON public.forum_threads (crawl_run_id)
  WHERE crawl_run_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_telegram_link_audit_old_trainer_id
  ON public.telegram_link_audit (old_trainer_id)
  WHERE old_trainer_id IS NOT NULL;
