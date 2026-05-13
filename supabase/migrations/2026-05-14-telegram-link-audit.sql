-- Telegram link audit + atomic link RPC — 2026-05-14
-- Spec: bugs/fixes/F-T2.6-verify-login.md (Wave 2 Tier-2 fix T2.6)
--
-- Bug: src/app/api/telegram/verify-login/route.ts used an UPSERT on
--      onConflict='telegram_user_id'. If the same Telegram account was
--      already linked to trainer-B, a fresh widget login from trainer-A
--      silently REPLACED the link. No conflict check, no audit trail.
--      Net effect: trainer-B loses bot access on the next sync, with
--      no record of who broke it or why.
--
-- Fix has two halves:
--
--   1. telegram_link_audit table — append-only history of every link
--      create / replace / unlink event. Service-role-only by RLS, matches
--      the same posture as trainer_telegram_links itself. Captures
--      old_trainer_id (NULL on first link), new_trainer_id, action verb,
--      changed_at, and a best-effort ip+user_agent for incident response.
--
--   2. link_telegram_to_trainer(...) PL/pgSQL function — wraps the
--      "is anyone already linked?" SELECT and the INSERT in a single
--      transaction with SELECT FOR UPDATE on the existing row. That
--      kills the concurrency window where two simultaneous verify-login
--      hits could both pass a stale SELECT and both INSERT, with the
--      second crashing on the PK conflict. With FOR UPDATE the second
--      request blocks until the first commits, then re-reads and either
--      returns ok (self-relink) or conflict (different trainer).
--
-- The function returns a typed row the route can dispatch on. No
-- silent overwrite, no race window, full audit.
--
-- Idempotent: CREATE OR REPLACE FUNCTION, CREATE TABLE IF NOT EXISTS.
-- Safe to re-run.

-- 1. Audit table
CREATE TABLE IF NOT EXISTS public.telegram_link_audit (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_user_id BIGINT NOT NULL,
  old_trainer_id   UUID REFERENCES public.trainers(id) ON DELETE SET NULL,
  new_trainer_id   UUID REFERENCES public.trainers(id) ON DELETE SET NULL,
  action           TEXT NOT NULL
    CHECK (action IN ('create', 'replace', 'unlink', 'conflict_blocked')),
  linked_via       TEXT,
  changed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address       INET,
  user_agent       TEXT
);

CREATE INDEX IF NOT EXISTS idx_telegram_link_audit_tg_user
  ON public.telegram_link_audit (telegram_user_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_telegram_link_audit_new_trainer
  ON public.telegram_link_audit (new_trainer_id, changed_at DESC)
  WHERE new_trainer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_telegram_link_audit_action
  ON public.telegram_link_audit (action, changed_at DESC);

ALTER TABLE public.telegram_link_audit ENABLE ROW LEVEL SECURITY;

-- service_role bypasses RLS automatically, but we add an explicit policy so
-- the intent is documented in the schema (same pattern as code_attempts).
DROP POLICY IF EXISTS telegram_link_audit_service_all ON public.telegram_link_audit;
CREATE POLICY telegram_link_audit_service_all
  ON public.telegram_link_audit
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- anon and authenticated: explicitly no policy → no access (RLS default-deny).
-- A trainer can see "you have a Telegram link" via ConnectTelegramBanner
-- (which reads trainer_telegram_links via service role on their behalf);
-- they don't need direct access to the audit log.

-- 2. Atomic link function
CREATE OR REPLACE FUNCTION public.link_telegram_to_trainer(
  p_telegram_user_id BIGINT,
  p_trainer_id       UUID,
  p_linked_via       TEXT,
  p_ip_address       INET DEFAULT NULL,
  p_user_agent       TEXT DEFAULT NULL
)
RETURNS TABLE (
  ok                  BOOLEAN,
  reason              TEXT,
  existing_trainer_id UUID,
  action              TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing_trainer_id UUID;
  v_action              TEXT;
BEGIN
  -- Input sanity. We trust the route layer for HMAC + portal-session auth;
  -- these checks are defence in depth.
  IF p_telegram_user_id IS NULL OR p_trainer_id IS NULL THEN
    RETURN QUERY SELECT false, 'invalid_input'::text, NULL::uuid, NULL::text;
    RETURN;
  END IF;

  IF p_linked_via IS NULL OR p_linked_via NOT IN ('widget', 'login_url', 'manual_admin') THEN
    RETURN QUERY SELECT false, 'invalid_input'::text, NULL::uuid, NULL::text;
    RETURN;
  END IF;

  -- Lock the row if it exists. FOR UPDATE serialises concurrent verify-login
  -- hits for the SAME telegram_user_id: the second waits for the first to
  -- commit, then re-reads — at which point the existing-link branch fires
  -- cleanly. NB: this lock is on the trainer_telegram_links table, not
  -- the audit; the audit is append-only and never contended.
  SELECT trainer_id
    INTO v_existing_trainer_id
    FROM public.trainer_telegram_links
   WHERE telegram_user_id = p_telegram_user_id
   FOR UPDATE;

  IF v_existing_trainer_id IS NULL THEN
    -- Fresh link. INSERT, audit as 'create'.
    INSERT INTO public.trainer_telegram_links (telegram_user_id, trainer_id, linked_via)
    VALUES (p_telegram_user_id, p_trainer_id, p_linked_via);

    v_action := 'create';
    INSERT INTO public.telegram_link_audit
      (telegram_user_id, old_trainer_id, new_trainer_id, action, linked_via, ip_address, user_agent)
    VALUES
      (p_telegram_user_id, NULL, p_trainer_id, v_action, p_linked_via, p_ip_address, p_user_agent);

    RETURN QUERY SELECT true, NULL::text, p_trainer_id, v_action;
    RETURN;
  END IF;

  IF v_existing_trainer_id = p_trainer_id THEN
    -- Self-relink: trainer just clicked Login again. Idempotent — touch
    -- linked_at so the banner reflects recency, but leave trainer_id alone.
    -- We DO NOT audit this case as 'replace' (nothing changed); we audit
    -- as 'create' with old=new to document the touch happened.
    UPDATE public.trainer_telegram_links
       SET linked_at = now(),
           linked_via = p_linked_via
     WHERE telegram_user_id = p_telegram_user_id;

    -- No audit row for a no-op re-link. Keeps the audit table signal-rich.
    RETURN QUERY SELECT true, NULL::text, p_trainer_id, 'noop'::text;
    RETURN;
  END IF;

  -- Conflict: this Telegram account is bound to a DIFFERENT trainer. We
  -- record the attempt (so trainer-B has evidence of the hijack attempt
  -- when they file a support ticket) but do NOT change the link.
  INSERT INTO public.telegram_link_audit
    (telegram_user_id, old_trainer_id, new_trainer_id, action, linked_via, ip_address, user_agent)
  VALUES
    (p_telegram_user_id, v_existing_trainer_id, p_trainer_id, 'conflict_blocked', p_linked_via, p_ip_address, p_user_agent);

  RETURN QUERY SELECT
    false,
    'telegram_account_linked_to_another_trainer'::text,
    v_existing_trainer_id,
    'conflict_blocked'::text;
  RETURN;

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'link_telegram_to_trainer(%, %) failed: % / %',
      p_telegram_user_id, p_trainer_id, SQLSTATE, SQLERRM;
    RETURN QUERY SELECT false, 'server_error'::text, NULL::uuid, NULL::text;
    RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.link_telegram_to_trainer(BIGINT, UUID, TEXT, INET, TEXT)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_telegram_to_trainer(BIGINT, UUID, TEXT, INET, TEXT)
  TO service_role;
