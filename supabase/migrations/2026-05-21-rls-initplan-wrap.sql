-- T4.17 — Wrap auth.jwt()/is_admin()/current_trainer_id() calls in RLS
-- policy bodies with `(select ...)` so Postgres treats them as initplan
-- subqueries (evaluated once per query) instead of inlined volatile-looking
-- calls (re-evaluated per row).
--
-- Why: Supabase's `auth_rls_initplan` advisor flags every policy that uses
-- `auth.<fn>()` directly. On large tables this can multiply read cost by 10–100x
-- because the JWT lookup runs once per scanned row. Wrapping in
-- `(select auth.jwt() ->> 'email')` (or `(select public.is_admin())`) lets the
-- planner hoist the call to an initplan node that executes once per statement.
--
-- This migration DROPs and re-CREATEs every affected policy in a single
-- transaction so the swap is atomic. DROP POLICY IF EXISTS is used for safety
-- (re-runnable). The new policy bodies are functionally identical — only the
-- evaluation strategy changes.
--
-- Mirrors:
--   supabase/rls.sql                         (canonical, already updated in source)
--   migrations/0003_onboarding_rls.sql       (canonical, already updated in source)
--   supabase/schema.sql                      (no policy bodies — only enables RLS)
--
-- Verification after apply:
--   In Supabase Studio → Advisors → Performance, the `auth_rls_initplan` count
--   should drop from ~24 to 0.

BEGIN;

--------------------------------------------------------------------------------
-- admins
--------------------------------------------------------------------------------

DROP POLICY IF EXISTS "admins_self_read"  ON public.admins;
CREATE POLICY "admins_self_read" ON public.admins FOR SELECT TO authenticated
  USING (email = lower(trim(coalesce(((select auth.jwt()) ->> 'email')::text, ''))));

DROP POLICY IF EXISTS "admins_admin_read" ON public.admins;
CREATE POLICY "admins_admin_read" ON public.admins FOR SELECT TO authenticated
  USING ((select public.is_admin()));

DROP POLICY IF EXISTS "admins_admin_write" ON public.admins;
CREATE POLICY "admins_admin_write" ON public.admins FOR ALL TO authenticated
  USING ((select public.is_admin())) WITH CHECK ((select public.is_admin()));

--------------------------------------------------------------------------------
-- trainers
--------------------------------------------------------------------------------

DROP POLICY IF EXISTS "trainers_self_read"  ON public.trainers;
CREATE POLICY "trainers_self_read" ON public.trainers FOR SELECT TO authenticated
  USING (email = lower(trim(coalesce(((select auth.jwt()) ->> 'email')::text, ''))));

DROP POLICY IF EXISTS "trainers_admin_read" ON public.trainers;
CREATE POLICY "trainers_admin_read" ON public.trainers FOR SELECT TO authenticated
  USING ((select public.is_admin()));

DROP POLICY IF EXISTS "trainers_self_update" ON public.trainers;
CREATE POLICY "trainers_self_update" ON public.trainers FOR UPDATE TO authenticated
  USING (email = lower(trim(coalesce(((select auth.jwt()) ->> 'email')::text, ''))))
  WITH CHECK (email = lower(trim(coalesce(((select auth.jwt()) ->> 'email')::text, ''))));

DROP POLICY IF EXISTS "trainers_admin_write" ON public.trainers;
CREATE POLICY "trainers_admin_write" ON public.trainers FOR ALL TO authenticated
  USING ((select public.is_admin())) WITH CHECK ((select public.is_admin()));

--------------------------------------------------------------------------------
-- access_codes, customers, orders, commissions, payouts
--------------------------------------------------------------------------------

DROP POLICY IF EXISTS "access_codes_trainer_own" ON public.access_codes;
CREATE POLICY "access_codes_trainer_own" ON public.access_codes FOR ALL TO authenticated
  USING (trainer_id IS NOT NULL AND trainer_id = (select public.current_trainer_id()))
  WITH CHECK (trainer_id IS NOT NULL AND trainer_id = (select public.current_trainer_id()));

DROP POLICY IF EXISTS "access_codes_admin_all" ON public.access_codes;
CREATE POLICY "access_codes_admin_all" ON public.access_codes FOR ALL TO authenticated
  USING ((select public.is_admin())) WITH CHECK ((select public.is_admin()));

DROP POLICY IF EXISTS "customers_trainer_read" ON public.customers;
CREATE POLICY "customers_trainer_read" ON public.customers FOR SELECT TO authenticated
  USING (trainer_id IS NOT NULL AND trainer_id = (select public.current_trainer_id()));

DROP POLICY IF EXISTS "customers_admin_all" ON public.customers;
CREATE POLICY "customers_admin_all" ON public.customers FOR ALL TO authenticated
  USING ((select public.is_admin())) WITH CHECK ((select public.is_admin()));

DROP POLICY IF EXISTS "orders_trainer_read" ON public.orders;
CREATE POLICY "orders_trainer_read" ON public.orders FOR SELECT TO authenticated
  USING (trainer_id IS NOT NULL AND trainer_id = (select public.current_trainer_id()));

DROP POLICY IF EXISTS "orders_admin_all" ON public.orders;
CREATE POLICY "orders_admin_all" ON public.orders FOR ALL TO authenticated
  USING ((select public.is_admin())) WITH CHECK ((select public.is_admin()));

DROP POLICY IF EXISTS "commissions_trainer_read" ON public.commissions;
CREATE POLICY "commissions_trainer_read" ON public.commissions FOR SELECT TO authenticated
  USING (trainer_id IS NOT NULL AND trainer_id = (select public.current_trainer_id()));

DROP POLICY IF EXISTS "commissions_admin_all" ON public.commissions;
CREATE POLICY "commissions_admin_all" ON public.commissions FOR ALL TO authenticated
  USING ((select public.is_admin())) WITH CHECK ((select public.is_admin()));

DROP POLICY IF EXISTS "payouts_trainer_read" ON public.payouts;
CREATE POLICY "payouts_trainer_read" ON public.payouts FOR SELECT TO authenticated
  USING (trainer_id IS NOT NULL AND trainer_id = (select public.current_trainer_id()));

DROP POLICY IF EXISTS "payouts_admin_all" ON public.payouts;
CREATE POLICY "payouts_admin_all" ON public.payouts FOR ALL TO authenticated
  USING ((select public.is_admin())) WITH CHECK ((select public.is_admin()));

--------------------------------------------------------------------------------
-- Onboarding v2 detail tables (mirrors migrations/0003_onboarding_rls.sql)
--   trainer_application_details, trainer_qualifications, trainer_training_progress,
--   trainer_quiz_attempts, trainer_payout_details, trainer_agreement
--   — each has a "trainer manages own" (ALL) policy and an "admin reads all"
--   (SELECT) policy. Both reference `auth.jwt() ->> 'email'`.
--------------------------------------------------------------------------------

-- trainer_application_details
DROP POLICY IF EXISTS "trainer manages own application" ON trainer_application_details;
CREATE POLICY "trainer manages own application"
  ON trainer_application_details FOR ALL TO authenticated
  USING (trainer_id IN (SELECT id FROM trainers WHERE email = (SELECT auth.jwt() ->> 'email')))
  WITH CHECK (trainer_id IN (SELECT id FROM trainers WHERE email = (SELECT auth.jwt() ->> 'email')));

DROP POLICY IF EXISTS "admin reads all applications" ON trainer_application_details;
CREATE POLICY "admin reads all applications"
  ON trainer_application_details FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM admins WHERE email = (SELECT auth.jwt() ->> 'email')));

-- trainer_qualifications
DROP POLICY IF EXISTS "trainer manages own qualifications" ON trainer_qualifications;
CREATE POLICY "trainer manages own qualifications"
  ON trainer_qualifications FOR ALL TO authenticated
  USING (trainer_id IN (SELECT id FROM trainers WHERE email = (SELECT auth.jwt() ->> 'email')))
  WITH CHECK (trainer_id IN (SELECT id FROM trainers WHERE email = (SELECT auth.jwt() ->> 'email')));

DROP POLICY IF EXISTS "admin reads all qualifications" ON trainer_qualifications;
CREATE POLICY "admin reads all qualifications"
  ON trainer_qualifications FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM admins WHERE email = (SELECT auth.jwt() ->> 'email')));

-- trainer_training_progress
DROP POLICY IF EXISTS "trainer manages own training" ON trainer_training_progress;
CREATE POLICY "trainer manages own training"
  ON trainer_training_progress FOR ALL TO authenticated
  USING (trainer_id IN (SELECT id FROM trainers WHERE email = (SELECT auth.jwt() ->> 'email')))
  WITH CHECK (trainer_id IN (SELECT id FROM trainers WHERE email = (SELECT auth.jwt() ->> 'email')));

DROP POLICY IF EXISTS "admin reads all training" ON trainer_training_progress;
CREATE POLICY "admin reads all training"
  ON trainer_training_progress FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM admins WHERE email = (SELECT auth.jwt() ->> 'email')));

-- trainer_quiz_attempts
DROP POLICY IF EXISTS "trainer manages own quiz attempts" ON trainer_quiz_attempts;
CREATE POLICY "trainer manages own quiz attempts"
  ON trainer_quiz_attempts FOR ALL TO authenticated
  USING (trainer_id IN (SELECT id FROM trainers WHERE email = (SELECT auth.jwt() ->> 'email')))
  WITH CHECK (trainer_id IN (SELECT id FROM trainers WHERE email = (SELECT auth.jwt() ->> 'email')));

DROP POLICY IF EXISTS "admin reads all quiz attempts" ON trainer_quiz_attempts;
CREATE POLICY "admin reads all quiz attempts"
  ON trainer_quiz_attempts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM admins WHERE email = (SELECT auth.jwt() ->> 'email')));

-- trainer_payout_details (most sensitive — bank + crypto)
DROP POLICY IF EXISTS "trainer manages own payout" ON trainer_payout_details;
CREATE POLICY "trainer manages own payout"
  ON trainer_payout_details FOR ALL TO authenticated
  USING (trainer_id IN (SELECT id FROM trainers WHERE email = (SELECT auth.jwt() ->> 'email')))
  WITH CHECK (trainer_id IN (SELECT id FROM trainers WHERE email = (SELECT auth.jwt() ->> 'email')));

DROP POLICY IF EXISTS "admin reads all payouts" ON trainer_payout_details;
CREATE POLICY "admin reads all payouts"
  ON trainer_payout_details FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM admins WHERE email = (SELECT auth.jwt() ->> 'email')));

-- trainer_agreement
DROP POLICY IF EXISTS "trainer manages own agreement" ON trainer_agreement;
CREATE POLICY "trainer manages own agreement"
  ON trainer_agreement FOR ALL TO authenticated
  USING (trainer_id IN (SELECT id FROM trainers WHERE email = (SELECT auth.jwt() ->> 'email')))
  WITH CHECK (trainer_id IN (SELECT id FROM trainers WHERE email = (SELECT auth.jwt() ->> 'email')));

DROP POLICY IF EXISTS "admin reads all agreements" ON trainer_agreement;
CREATE POLICY "admin reads all agreements"
  ON trainer_agreement FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM admins WHERE email = (SELECT auth.jwt() ->> 'email')));

COMMIT;
