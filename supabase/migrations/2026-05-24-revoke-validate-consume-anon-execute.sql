-- Revoke anon/authenticated EXECUTE on validate_and_consume_code (2026-05-24)
--
-- BACKGROUND — this OVERTURNS a deliberate wave7 (2026-05-16) decision.
--
-- Wave 7's hygiene migration revoked anon/authenticated EXECUTE from five
-- SECURITY DEFINER RPCs but explicitly KEPT `validate_and_consume_code`
-- anon-callable, with this documented rationale:
--
--   "Anon-callable by design: the BC bc-paste.js gate submits to
--    /api/codes/validate which proxies here. Only path that may consume
--    an access_code."
--
-- That rationale conflates two different things: the *website visitor* is
-- anonymous, but the *Postgres `anon` role* is not the caller. The gate's
-- only network calls are to the TrainerSource app:
--   - up-bc-cdn/bc-paste.js          -> API_URL + /api/codes/validate
--   - ultimate-peptides/scripts/access-gate.js -> API_URL + /api/codes/validate
--   - ultimate-peptides/BC-PASTE-THIS.html      -> API_URL + /api/codes/validate
-- and that route (src/app/api/codes/validate/route.ts) calls the RPC with
-- `createServiceClient()` (SUPABASE_SERVICE_ROLE_KEY). No gate path, test,
-- bot, or client component ever calls /rest/v1/rpc/validate_and_consume_code
-- with the publishable anon key. So the anon/authenticated grant is dead
-- weight — and an attack surface.
--
-- WHY IT MATTERS — the publishable anon key ships in the public TrainerSource
-- portal bundle (Supabase Auth). Anyone holding it can call this RPC directly,
-- bypassing the app layer entirely, which means:
--   1. Code-enumeration oracle: the RPC returns the precise `reason`
--      (not_found / consumed / revoked / expired / ...). The app's
--      /api/gate/verify enumeration defence (wave3 A9) lives in the route,
--      not the function, so a direct RPC call leaks the exact status of any
--      guessed code.
--   2. Out-of-band code consumption: a valid code can be marked `consumed`
--      and a `customers` row created without going through the gate (no
--      BigCommerce account, no rate limit, no `code_attempts` audit row).
--   3. Country gate bypass: `p_allowed_countries` is a caller-supplied
--      argument, so calling directly lets the caller pass their own allowlist.
--
-- SAFETY — verified before applying:
--   - No RLS policy references this function (pg_policies scan empty), so the
--     wave7/2026-05-17 RLS-helper regression (EXECUTE needed for policy
--     evaluation in the caller's role) does NOT apply here.
--   - service_role retains EXECUTE; the gate flow is unaffected.
--   - Reversible: GRANT EXECUTE ... TO anon, authenticated;
--
-- Idempotent. Safe to re-run.

REVOKE EXECUTE ON FUNCTION
  public.validate_and_consume_code(text, text, text, text, text, text[])
  FROM anon, authenticated;

COMMENT ON FUNCTION public.validate_and_consume_code(text, text, text, text, text, text[]) IS
  'Service-role only. Consumes an access_code + finds/creates a customer in one atomic tx. Reached exclusively server-side via /api/codes/validate (createServiceClient). anon/authenticated EXECUTE revoked 2026-05-24 — the gate never calls /rest/v1/rpc directly, and a public-anon-key call path was a code-enumeration + out-of-band-consume vector. Reverse with GRANT EXECUTE TO anon, authenticated.';
