-- Row Level Security policies for trainersource-app.
-- Idempotent — safe to re-run. Paste into Supabase SQL Editor after schema.sql.
--
-- Closes review finding H3: with RLS off, anyone holding the anon key
-- (e.g., from a compromised env file or a supply-chain leak) can read and
-- modify any row via the anon-keyed REST API. These policies deny all
-- anon access (default deny), grant authenticated users scoped access
-- based on their identity, and let the service role bypass everything
-- (service-role traffic is used by server-side endpoints that have
-- already authenticated via other means: webhook HMAC/bearer, access
-- code validation, or server-only cron jobs).

--------------------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER bypasses RLS during the lookup,
-- which is required to avoid policy recursion when a policy on a table
-- needs to read from the same table).
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_admin() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admins
    WHERE email = lower(trim(coalesce((auth.jwt()->>'email')::text, '')))
  );
$$;

CREATE OR REPLACE FUNCTION public.current_trainer_id() RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id FROM public.trainers
  WHERE email = lower(trim(coalesce((auth.jwt()->>'email')::text, '')))
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.current_trainer_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_trainer_id() TO authenticated, service_role;

--------------------------------------------------------------------------------
-- Enable RLS on every operational table.
--------------------------------------------------------------------------------

ALTER TABLE public.admins          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trainers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_codes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payouts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commissions     ENABLE ROW LEVEL SECURITY;

--------------------------------------------------------------------------------
-- admins
--   SELECT: authenticated users can read their own admin row (so
--           requireAdmin() lookups by email succeed); admins can read all.
--   INSERT/UPDATE/DELETE: admins only.
--   anon: nothing.
--------------------------------------------------------------------------------

DROP POLICY IF EXISTS "admins_self_read"  ON public.admins;
CREATE POLICY "admins_self_read" ON public.admins FOR SELECT TO authenticated
  USING (email = lower(trim(coalesce((auth.jwt()->>'email')::text, ''))));

DROP POLICY IF EXISTS "admins_admin_read" ON public.admins;
CREATE POLICY "admins_admin_read" ON public.admins FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "admins_admin_write" ON public.admins;
CREATE POLICY "admins_admin_write" ON public.admins FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

--------------------------------------------------------------------------------
-- trainers
--   SELECT: trainers read their own row; admins read all.
--   UPDATE: trainers update their own row (settings page); admins update any.
--   INSERT/DELETE: admins only. The public apply flow inserts via the
--                  service-role client (see apply/actions.ts), bypassing RLS.
--------------------------------------------------------------------------------

DROP POLICY IF EXISTS "trainers_self_read"  ON public.trainers;
CREATE POLICY "trainers_self_read" ON public.trainers FOR SELECT TO authenticated
  USING (email = lower(trim(coalesce((auth.jwt()->>'email')::text, ''))));

DROP POLICY IF EXISTS "trainers_admin_read" ON public.trainers;
CREATE POLICY "trainers_admin_read" ON public.trainers FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "trainers_self_update" ON public.trainers;
CREATE POLICY "trainers_self_update" ON public.trainers FOR UPDATE TO authenticated
  USING (email = lower(trim(coalesce((auth.jwt()->>'email')::text, ''))))
  WITH CHECK (email = lower(trim(coalesce((auth.jwt()->>'email')::text, ''))));

DROP POLICY IF EXISTS "trainers_admin_write" ON public.trainers;
CREATE POLICY "trainers_admin_write" ON public.trainers FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

--------------------------------------------------------------------------------
-- access_codes, customers, orders, commissions, payouts
--   Shared pattern: admins do anything; trainers see their own rows
--   (identified by trainer_id = current_trainer_id()). Writes on these are
--   overwhelmingly admin-only — trainer code generation goes through the
--   server action which uses service-role or admin-scope via requireTrainer.
--------------------------------------------------------------------------------

DROP POLICY IF EXISTS "access_codes_trainer_own" ON public.access_codes;
CREATE POLICY "access_codes_trainer_own" ON public.access_codes FOR ALL TO authenticated
  USING (trainer_id = public.current_trainer_id() AND public.current_trainer_id() IS NOT NULL)
  WITH CHECK (trainer_id = public.current_trainer_id() AND public.current_trainer_id() IS NOT NULL);

DROP POLICY IF EXISTS "access_codes_admin_all" ON public.access_codes;
CREATE POLICY "access_codes_admin_all" ON public.access_codes FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "customers_trainer_read" ON public.customers;
CREATE POLICY "customers_trainer_read" ON public.customers FOR SELECT TO authenticated
  USING (trainer_id = public.current_trainer_id() AND public.current_trainer_id() IS NOT NULL);

DROP POLICY IF EXISTS "customers_admin_all" ON public.customers;
CREATE POLICY "customers_admin_all" ON public.customers FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "orders_trainer_read" ON public.orders;
CREATE POLICY "orders_trainer_read" ON public.orders FOR SELECT TO authenticated
  USING (trainer_id = public.current_trainer_id() AND public.current_trainer_id() IS NOT NULL);

DROP POLICY IF EXISTS "orders_admin_all" ON public.orders;
CREATE POLICY "orders_admin_all" ON public.orders FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "commissions_trainer_read" ON public.commissions;
CREATE POLICY "commissions_trainer_read" ON public.commissions FOR SELECT TO authenticated
  USING (trainer_id = public.current_trainer_id() AND public.current_trainer_id() IS NOT NULL);

DROP POLICY IF EXISTS "commissions_admin_all" ON public.commissions;
CREATE POLICY "commissions_admin_all" ON public.commissions FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "payouts_trainer_read" ON public.payouts;
CREATE POLICY "payouts_trainer_read" ON public.payouts FOR SELECT TO authenticated
  USING (trainer_id = public.current_trainer_id() AND public.current_trainer_id() IS NOT NULL);

DROP POLICY IF EXISTS "payouts_admin_all" ON public.payouts;
CREATE POLICY "payouts_admin_all" ON public.payouts FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

--------------------------------------------------------------------------------
-- Post-conditions to verify after applying:
--   SET ROLE anon;
--     SELECT * FROM admins;            -- expect 0 rows / permission denied
--     SELECT * FROM trainers;          -- expect 0 rows / permission denied
--   RESET ROLE;
--------------------------------------------------------------------------------
