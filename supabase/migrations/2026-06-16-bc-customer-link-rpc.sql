-- BC customer <-> Telegram link RPC + audit — 2026-06-16
-- Spec: GET /link-telegram on ultimate-peptides.com (portal handler).
--
-- Mirrors link_telegram_to_trainer (2026-05-14-telegram-link-audit.sql):
--   - append-only audit table
--   - atomic RPC with SELECT FOR UPDATE (no silent overwrite)
--   - block both conflict directions
--
-- Live bc_customer_links has NO linked_via column — INSERT only
-- (telegram_user_id, bc_customer_id). linked_via is stored in audit only.
--
-- Does NOT drop any existing index (bc_customer_links_reengage_idx kept).
-- Idempotent: CREATE OR REPLACE FUNCTION, CREATE TABLE IF NOT EXISTS.

-- 1. Audit table
CREATE TABLE IF NOT EXISTS public.bc_customer_link_audit (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_user_id   BIGINT NOT NULL,
  old_bc_customer_id BIGINT,
  new_bc_customer_id BIGINT,
  action             TEXT NOT NULL
    CHECK (action IN ('create', 'noop', 'conflict_blocked')),
  linked_via         TEXT,
  changed_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address         INET,
  user_agent         TEXT
);

CREATE INDEX IF NOT EXISTS idx_bc_customer_link_audit_tg_user
  ON public.bc_customer_link_audit (telegram_user_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_bc_customer_link_audit_bc_customer
  ON public.bc_customer_link_audit (new_bc_customer_id, changed_at DESC)
  WHERE new_bc_customer_id IS NOT NULL;

ALTER TABLE public.bc_customer_link_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bc_customer_link_audit_service_all ON public.bc_customer_link_audit;
CREATE POLICY bc_customer_link_audit_service_all
  ON public.bc_customer_link_audit
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 2. One Telegram account per BC customer (telegram_user_id already PK)
CREATE UNIQUE INDEX IF NOT EXISTS bc_customer_links_bc_customer_id_unique
  ON public.bc_customer_links (bc_customer_id);

-- 3. Atomic link function
CREATE OR REPLACE FUNCTION public.link_telegram_to_bc_customer(
  p_telegram_user_id BIGINT,
  p_bc_customer_id   BIGINT,
  p_linked_via       TEXT,
  p_ip_address       INET DEFAULT NULL,
  p_user_agent       TEXT DEFAULT NULL
)
RETURNS TABLE (
  ok     BOOLEAN,
  reason TEXT,
  action TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tg_row_bc BIGINT;
  v_bc_row_tg BIGINT;
BEGIN
  IF p_telegram_user_id IS NULL OR p_bc_customer_id IS NULL THEN
    RETURN QUERY SELECT false, 'invalid_input'::text, NULL::text;
    RETURN;
  END IF;

  IF p_linked_via IS NULL OR p_linked_via NOT IN ('widget', 'login_url', 'manual_admin') THEN
    RETURN QUERY SELECT false, 'invalid_input'::text, NULL::text;
    RETURN;
  END IF;

  SELECT bc_customer_id
    INTO v_tg_row_bc
    FROM public.bc_customer_links
   WHERE telegram_user_id = p_telegram_user_id
   FOR UPDATE;

  SELECT telegram_user_id
    INTO v_bc_row_tg
    FROM public.bc_customer_links
   WHERE bc_customer_id = p_bc_customer_id
   FOR UPDATE;

  IF v_tg_row_bc IS NULL AND v_bc_row_tg IS NULL THEN
    INSERT INTO public.bc_customer_links (telegram_user_id, bc_customer_id)
    VALUES (p_telegram_user_id, p_bc_customer_id);

    INSERT INTO public.bc_customer_link_audit
      (telegram_user_id, old_bc_customer_id, new_bc_customer_id, action, linked_via, ip_address, user_agent)
    VALUES
      (p_telegram_user_id, NULL, p_bc_customer_id, 'create', p_linked_via, p_ip_address, p_user_agent);

    RETURN QUERY SELECT true, NULL::text, 'create'::text;
    RETURN;
  END IF;

  IF v_tg_row_bc IS NOT NULL AND v_tg_row_bc = p_bc_customer_id
     AND v_bc_row_tg IS NOT NULL AND v_bc_row_tg = p_telegram_user_id THEN
    UPDATE public.bc_customer_links
       SET linked_at = now()
     WHERE telegram_user_id = p_telegram_user_id;

    RETURN QUERY SELECT true, NULL::text, 'noop'::text;
    RETURN;
  END IF;

  IF v_tg_row_bc IS NOT NULL AND v_tg_row_bc <> p_bc_customer_id THEN
    INSERT INTO public.bc_customer_link_audit
      (telegram_user_id, old_bc_customer_id, new_bc_customer_id, action, linked_via, ip_address, user_agent)
    VALUES
      (p_telegram_user_id, v_tg_row_bc, p_bc_customer_id, 'conflict_blocked', p_linked_via, p_ip_address, p_user_agent);

    RETURN QUERY SELECT
      false,
      'telegram_account_linked_to_another_customer'::text,
      'conflict_blocked'::text;
    RETURN;
  END IF;

  IF v_bc_row_tg IS NOT NULL AND v_bc_row_tg <> p_telegram_user_id THEN
    INSERT INTO public.bc_customer_link_audit
      (telegram_user_id, old_bc_customer_id, new_bc_customer_id, action, linked_via, ip_address, user_agent)
    VALUES
      (p_telegram_user_id, p_bc_customer_id, p_bc_customer_id, 'conflict_blocked', p_linked_via, p_ip_address, p_user_agent);

    RETURN QUERY SELECT
      false,
      'bc_customer_linked_to_another_telegram'::text,
      'conflict_blocked'::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT false, 'server_error'::text, NULL::text;
  RETURN;

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'link_telegram_to_bc_customer(%, %) failed: % / %',
      p_telegram_user_id, p_bc_customer_id, SQLSTATE, SQLERRM;
    RETURN QUERY SELECT false, 'server_error'::text, NULL::text;
    RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.link_telegram_to_bc_customer(BIGINT, BIGINT, TEXT, INET, TEXT)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_telegram_to_bc_customer(BIGINT, BIGINT, TEXT, INET, TEXT)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.link_telegram_to_bc_customer(BIGINT, BIGINT, TEXT, INET, TEXT)
  FROM anon, authenticated;
