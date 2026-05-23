-- T4.21 — Add explicit anon+authenticated DENY policies to RLS-enabled tables
-- that currently have RLS on but zero policies.
--
-- Why bother? When RLS is enabled and a table has no policies, Postgres
-- defaults to "deny all" for non-superuser roles — which is the secure
-- outcome, but Supabase's `rls_enabled_no_policy` advisor flags it as a
-- hygiene smell because it's indistinguishable from "RLS was enabled and
-- the author forgot to add policies." Making the deny explicit silences
-- the advisor and documents intent in-place.
--
-- All 15 tables below are SERVICE-ROLE-ONLY by design: the bot/cron/server
-- writes via the service role key (which bypasses RLS entirely), and no
-- anon-keyed or user-scoped Supabase client ever reads or writes them.
-- Confirmed via grep across src/ in this repo — every non-service-role
-- caller that touches these tables uses createServiceClient() (which uses
-- SUPABASE_SERVICE_ROLE_KEY → bypasses RLS).
--
-- The deny policy itself is a no-op against service role traffic
-- (service_role bypasses RLS regardless of policies), so this is
-- pure documentation/advisor-silencing — zero runtime behavior change.

BEGIN;

-- bot_blocklist
DROP POLICY IF EXISTS deny_anon_auth ON public.bot_blocklist;
CREATE POLICY deny_anon_auth ON public.bot_blocklist
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

-- bot_user_acknowledgments
DROP POLICY IF EXISTS deny_anon_auth ON public.bot_user_acknowledgments;
CREATE POLICY deny_anon_auth ON public.bot_user_acknowledgments
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

-- bot_user_facts
DROP POLICY IF EXISTS deny_anon_auth ON public.bot_user_facts;
CREATE POLICY deny_anon_auth ON public.bot_user_facts
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

-- coa_cache
DROP POLICY IF EXISTS deny_anon_auth ON public.coa_cache;
CREATE POLICY deny_anon_auth ON public.coa_cache
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

-- coa_missing_events
DROP POLICY IF EXISTS deny_anon_auth ON public.coa_missing_events;
CREATE POLICY deny_anon_auth ON public.coa_missing_events
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

-- crawl_runs
DROP POLICY IF EXISTS deny_anon_auth ON public.crawl_runs;
CREATE POLICY deny_anon_auth ON public.crawl_runs
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

-- forum_classifications
DROP POLICY IF EXISTS deny_anon_auth ON public.forum_classifications;
CREATE POLICY deny_anon_auth ON public.forum_classifications
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

-- forum_posts
DROP POLICY IF EXISTS deny_anon_auth ON public.forum_posts;
CREATE POLICY deny_anon_auth ON public.forum_posts
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

-- forum_threads
DROP POLICY IF EXISTS deny_anon_auth ON public.forum_threads;
CREATE POLICY deny_anon_auth ON public.forum_threads
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

-- goal_intakes
DROP POLICY IF EXISTS deny_anon_auth ON public.goal_intakes;
CREATE POLICY deny_anon_auth ON public.goal_intakes
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

-- lifecycle_events
DROP POLICY IF EXISTS deny_anon_auth ON public.lifecycle_events;
CREATE POLICY deny_anon_auth ON public.lifecycle_events
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

-- partner_application_answers
DROP POLICY IF EXISTS deny_anon_auth ON public.partner_application_answers;
CREATE POLICY deny_anon_auth ON public.partner_application_answers
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

-- partner_applications
DROP POLICY IF EXISTS deny_anon_auth ON public.partner_applications;
CREATE POLICY deny_anon_auth ON public.partner_applications
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

-- partner_scorecard
DROP POLICY IF EXISTS deny_anon_auth ON public.partner_scorecard;
CREATE POLICY deny_anon_auth ON public.partner_scorecard
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

-- trainer_telegram_links
DROP POLICY IF EXISTS deny_anon_auth ON public.trainer_telegram_links;
CREATE POLICY deny_anon_auth ON public.trainer_telegram_links
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

COMMIT;
