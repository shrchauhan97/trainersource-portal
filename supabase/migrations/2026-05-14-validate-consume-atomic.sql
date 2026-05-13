-- Atomic gate validation + consume — 2026-05-14
-- Spec: bugs/fixes/F-B.md (Tier-1 fix T1.1)
-- Bug: validate/route.ts:254-290 marked access_codes.status='consumed' BEFORE
--      inserting the customer row. If the customers insert OR the consumed_by
--      backfill threw, the code was dead with no attribution. Real production
--      casualty: code KF7EHXDY consumed in prod with no matching customer for
--      nafri129@gmail.com.
--
-- Fix: single PL/pgSQL function does the whole gate transaction. Row lock on
--      access_codes prevents the consume-race. On ANY internal error the
--      whole transaction rolls back so the code stays 'active'.
--
-- Idempotent: CREATE OR REPLACE FUNCTION. Safe to re-run.

CREATE OR REPLACE FUNCTION public.validate_and_consume_code(
  p_code              text,
  p_name              text,
  p_email             text,
  p_country           text,
  p_city              text,
  p_allowed_countries text[] DEFAULT ARRAY['Singapore','UAE','Japan','United States']
)
RETURNS TABLE (
  ok               boolean,
  reason           text,
  access_code_id   uuid,
  customer_id      uuid,
  trainer_id       uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_code          text := upper(trim(coalesce(p_code, '')));
  v_email         text := lower(trim(coalesce(p_email, '')));
  v_name          text := trim(coalesce(p_name, ''));
  v_country       text := trim(coalesce(p_country, ''));
  v_city          text := trim(coalesce(p_city, ''));
  v_country_lower text;
  v_allow_lower   text[];
  v_access_code   public.access_codes%ROWTYPE;
  v_existing      public.customers%ROWTYPE;
  v_customer_id   uuid;
  v_trainer_id    uuid;
BEGIN
  -- 1. Input validation (cheap, do before any locking)
  IF v_code = '' OR v_code !~ '^[A-Z0-9-]{4,40}$' THEN
    RETURN QUERY SELECT false, 'invalid_format'::text, NULL::uuid, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  IF v_name = '' OR v_email = '' OR v_country = '' OR v_city = '' THEN
    RETURN QUERY SELECT false, 'invalid_input'::text, NULL::uuid, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  -- Simple RFC-ish email regex (matches the spirit of the JS check in
  -- bc-paste.js — server-side is the authority, but we don't need a perfect
  -- RFC 5322 parser here).
  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RETURN QUERY SELECT false, 'invalid_input'::text, NULL::uuid, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  -- Country allowlist (case-insensitive). Default matches the storefront's
  -- COUNTRIES array; callers override via the p_allowed_countries argument.
  v_country_lower := lower(v_country);
  SELECT array_agg(lower(c)) INTO v_allow_lower
    FROM unnest(p_allowed_countries) AS c;

  IF v_allow_lower IS NULL OR NOT (v_country_lower = ANY(v_allow_lower)) THEN
    RETURN QUERY SELECT false, 'country_blocked'::text, NULL::uuid, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  -- 2. Lock the access_codes row. FOR UPDATE serialises concurrent submits
  --    of the same code — the second one waits for the first to commit/rollback
  --    then re-reads, at which point status='consumed' kicks them out cleanly.
  SELECT * INTO v_access_code
    FROM public.access_codes
   WHERE code = v_code
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'not_found'::text, NULL::uuid, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  v_trainer_id := v_access_code.trainer_id;

  -- 3. Status / lifecycle checks
  IF v_access_code.status::text = 'revoked' THEN
    RETURN QUERY SELECT false, 'revoked'::text, v_access_code.id, NULL::uuid, v_trainer_id;
    RETURN;
  END IF;

  IF v_access_code.status::text = 'consumed' OR v_access_code.consumed_at IS NOT NULL THEN
    RETURN QUERY SELECT false, 'consumed'::text, v_access_code.id, NULL::uuid, v_trainer_id;
    RETURN;
  END IF;

  IF v_access_code.expires_at <= now() THEN
    RETURN QUERY SELECT false, 'expired'::text, v_access_code.id, NULL::uuid, v_trainer_id;
    RETURN;
  END IF;

  IF v_access_code.status::text <> 'active' THEN
    -- Any state we don't recognise — treat as expired (defensive default).
    RETURN QUERY SELECT false, 'expired'::text, v_access_code.id, NULL::uuid, v_trainer_id;
    RETURN;
  END IF;

  -- 4. Find or create the customer row.
  --    customers.email is UNIQUE — if the same email signs up again with a
  --    fresh code, we attribute the new code to the existing row (matches the
  --    legacy route behaviour at validate/route.ts:192-247).
  SELECT * INTO v_existing
    FROM public.customers
   WHERE email = v_email
   LIMIT 1;

  IF FOUND THEN
    v_customer_id := v_existing.id;
  ELSE
    BEGIN
      INSERT INTO public.customers (email, name, country, city, trainer_id, access_code_id)
      VALUES (v_email, v_name, v_country, v_city, v_trainer_id, v_access_code.id)
      RETURNING id INTO v_customer_id;
    EXCEPTION
      WHEN unique_violation THEN
        -- Race: another request inserted the same email between the SELECT
        -- and the INSERT. Re-read.
        SELECT id INTO v_customer_id
          FROM public.customers
         WHERE email = v_email
         LIMIT 1;
        IF v_customer_id IS NULL THEN
          RAISE EXCEPTION 'unique_violation but customer row not findable for %', v_email;
        END IF;
    END;
  END IF;

  -- 5. Mark code consumed. Single UPDATE in the same txn → either everything
  --    above committed or none of it did.
  UPDATE public.access_codes
     SET status      = 'consumed',
         consumed_at = now(),
         consumed_by = v_customer_id
   WHERE id = v_access_code.id;

  RETURN QUERY SELECT true, NULL::text, v_access_code.id, v_customer_id, v_trainer_id;
  RETURN;

EXCEPTION
  WHEN OTHERS THEN
    -- Log to Postgres logs (visible via supabase get_logs). We swallow the
    -- exception so the caller sees a graceful failure instead of a thrown
    -- error → unprotected 500 to the gate UI.
    RAISE WARNING 'validate_and_consume_code(%) failed: % / %', p_code, SQLSTATE, SQLERRM;
    RETURN QUERY SELECT false, 'server_error'::text, NULL::uuid, NULL::uuid, NULL::uuid;
    RETURN;
END;
$$;

-- Lock down execution. The validate route uses createServiceClient() which
-- runs as service_role; service_role bypasses RLS but RPC EXECUTE still
-- requires explicit grant.
REVOKE ALL ON FUNCTION public.validate_and_consume_code(
  text, text, text, text, text, text[]
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.validate_and_consume_code(
  text, text, text, text, text, text[]
) TO service_role;
