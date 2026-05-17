-- Restore EXECUTE on RLS helper functions for `authenticated`.
--
-- Wave 7 (2026-05-16) revoked EXECUTE on `is_admin()` and
-- `current_trainer_id()` from anon/authenticated on the reasoning that
-- these were "only called via service role". That was wrong: both
-- functions are referenced inside RLS policy USING/WITH CHECK
-- expressions (e.g. admins_admin_read, trainers_admin_read,
-- access_codes_*). RLS policy expressions run in the *caller's*
-- security context, so the caller needs EXECUTE — SECURITY DEFINER
-- only controls who runs the function body, not who can invoke it.
--
-- Symptom before fix: any authenticated user selecting from `admins`
-- or `trainers` (e.g. /auth/callback → getUserRole) gets:
--   ERROR  42501  permission denied for function is_admin
-- which throws out of the route handler as a 500.
--
-- anon is intentionally still denied (no anon SELECT on admins/trainers
-- in any policy, so anon never triggers the helper).

GRANT EXECUTE ON FUNCTION public.is_admin()            TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_trainer_id()  TO authenticated;
