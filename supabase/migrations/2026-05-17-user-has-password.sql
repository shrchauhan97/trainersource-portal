-- user_has_password(uid) — RLS-safe wrapper to check whether a Supabase
-- auth user has a password set (vs. magic-link only).
--
-- Used by the post-magic-link callback (and any "do I need to set a
-- password?" check) to decide whether to route the user to
-- /account/set-password before /dashboard or /admin.
--
-- auth.users is not directly readable by anon/authenticated, so we wrap
-- the lookup in a SECURITY DEFINER function and grant EXECUTE to
-- authenticated only. The function only reveals a boolean about the
-- caller's own row in practice — but is intentionally not constrained to
-- self only, because the post-callback code runs with a session for the
-- user being checked anyway.

CREATE OR REPLACE FUNCTION public.user_has_password(uid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth, pg_temp
AS $$
  SELECT encrypted_password IS NOT NULL FROM auth.users WHERE id = uid
$$;

REVOKE EXECUTE ON FUNCTION public.user_has_password(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.user_has_password(uuid) TO authenticated;

-- Email-keyed variant for pre-login pre-check (no session yet, so no
-- JWT uid available). Returns:
--   true  → auth user exists AND has a password set
--   false → auth user exists AND has no password set (magic-link only)
--   NULL  → no auth user with that email (treat as no password)
-- Service-role only — never exposed to anon/authenticated.

CREATE OR REPLACE FUNCTION public.user_has_password_by_email(addr text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth, pg_temp
AS $$
  SELECT encrypted_password IS NOT NULL
  FROM auth.users
  WHERE lower(email) = lower(trim(addr))
  LIMIT 1
$$;

REVOKE EXECUTE ON FUNCTION public.user_has_password_by_email(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.user_has_password_by_email(text) TO service_role;
