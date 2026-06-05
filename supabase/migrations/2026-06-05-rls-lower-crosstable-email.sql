-- 2026-06-05 — case-fold the cross-table email comparison in the onboarding
-- detail-table RLS policies so the database layer matches the now
-- case-insensitive application layer (PR #47, T2.13 — `normalizeSessionEmail`).
--
-- SPLIT-BRAIN: PR #47 made every session-derived email lookup in the app
-- case-insensitive (trim + lower before any `.eq('email', …)`); stored emails
-- are canonical lower/trimmed (CHECK constraints, migration 2026-06-02). But
-- RLS runs a second, independent authorization on the user's JWT. Six
-- onboarding detail tables gate via cross-table subqueries that compare the RAW
-- (un-lowered) JWT email — `trainers.email = (auth.jwt() ->> 'email')` /
-- `admins.email = (auth.jwt() ->> 'email')`. A mixed-case JWT (e.g.
-- `Sarah@Example.COM`) passes the app check but matches NO canonical row in the
-- RLS subquery, so the query is silently filtered to empty: the trainer sees
-- none of their own application / qualifications / training / quiz / payout /
-- agreement data; admins reading those tables get nothing. Worst on
-- `trainer_payout_details` (bank + crypto references).
--
-- FIX: wrap BOTH sides of every such comparison in `lower(trim(...))` — the
-- exact normalization the trainers/admins own policies and the `is_admin()` /
-- `current_trainer_id()` helpers (supabase/rls.sql) already apply. The
-- `(SELECT auth.jwt() AS jwt)` initplan wrapping from
-- 2026-05-21-rls-initplan-wrap.sql is preserved. Security-PRESERVING: a row
-- that matched before still matches; the only new matches are the mixed-case
-- sessions that should have matched all along.
--
-- SCOPE (verified against prod pg_policies 2026-06-05): commissions / payouts /
-- access_codes / customers are NOT affected — they gate via
-- `current_trainer_id()` / `is_admin()`, which already lower(trim()) the JWT
-- email. The only RAW comparisons are the 24 policies (4 per table) on the 6
-- tables below. Policy names + structure copied verbatim from prod: per table
--   _select          → SELECT, USING (admin OR own-trainer)
--   _trainer_insert  → INSERT, WITH CHECK (own-trainer)
--   _trainer_update  → UPDATE, USING + WITH CHECK (own-trainer)
--   _trainer_delete  → DELETE, USING (own-trainer)
-- Idempotent (DROP IF EXISTS before each CREATE), atomic (single transaction).
--
-- NOT YET APPLIED to prod — file-only; apply via the normal migration pipeline.
-- Verify after apply (mixed-case session, lower-case stored email):
--   SELECT count(*) FROM trainer_payout_details;  -- > 0, not silently 0

BEGIN;

-- ============================ trainer_application_details
DROP POLICY IF EXISTS "trainer_application_details_select" ON trainer_application_details;
CREATE POLICY "trainer_application_details_select" ON trainer_application_details FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1 FROM admins WHERE lower(trim(admins.email)) = lower(trim(((SELECT auth.jwt() AS jwt) ->> 'email'::text)))))
         OR (trainer_id IN ( SELECT trainers.id FROM trainers WHERE lower(trim(trainers.email)) = lower(trim(((SELECT auth.jwt() AS jwt) ->> 'email'::text))))));
DROP POLICY IF EXISTS "trainer_application_details_trainer_insert" ON trainer_application_details;
CREATE POLICY "trainer_application_details_trainer_insert" ON trainer_application_details FOR INSERT TO authenticated
  WITH CHECK (trainer_id IN ( SELECT trainers.id FROM trainers WHERE lower(trim(trainers.email)) = lower(trim(((SELECT auth.jwt() AS jwt) ->> 'email'::text)))));
DROP POLICY IF EXISTS "trainer_application_details_trainer_update" ON trainer_application_details;
CREATE POLICY "trainer_application_details_trainer_update" ON trainer_application_details FOR UPDATE TO authenticated
  USING (trainer_id IN ( SELECT trainers.id FROM trainers WHERE lower(trim(trainers.email)) = lower(trim(((SELECT auth.jwt() AS jwt) ->> 'email'::text)))))
  WITH CHECK (trainer_id IN ( SELECT trainers.id FROM trainers WHERE lower(trim(trainers.email)) = lower(trim(((SELECT auth.jwt() AS jwt) ->> 'email'::text)))));
DROP POLICY IF EXISTS "trainer_application_details_trainer_delete" ON trainer_application_details;
CREATE POLICY "trainer_application_details_trainer_delete" ON trainer_application_details FOR DELETE TO authenticated
  USING (trainer_id IN ( SELECT trainers.id FROM trainers WHERE lower(trim(trainers.email)) = lower(trim(((SELECT auth.jwt() AS jwt) ->> 'email'::text)))));

-- ============================ trainer_qualifications
DROP POLICY IF EXISTS "trainer_qualifications_select" ON trainer_qualifications;
CREATE POLICY "trainer_qualifications_select" ON trainer_qualifications FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1 FROM admins WHERE lower(trim(admins.email)) = lower(trim(((SELECT auth.jwt() AS jwt) ->> 'email'::text)))))
         OR (trainer_id IN ( SELECT trainers.id FROM trainers WHERE lower(trim(trainers.email)) = lower(trim(((SELECT auth.jwt() AS jwt) ->> 'email'::text))))));
DROP POLICY IF EXISTS "trainer_qualifications_trainer_insert" ON trainer_qualifications;
CREATE POLICY "trainer_qualifications_trainer_insert" ON trainer_qualifications FOR INSERT TO authenticated
  WITH CHECK (trainer_id IN ( SELECT trainers.id FROM trainers WHERE lower(trim(trainers.email)) = lower(trim(((SELECT auth.jwt() AS jwt) ->> 'email'::text)))));
DROP POLICY IF EXISTS "trainer_qualifications_trainer_update" ON trainer_qualifications;
CREATE POLICY "trainer_qualifications_trainer_update" ON trainer_qualifications FOR UPDATE TO authenticated
  USING (trainer_id IN ( SELECT trainers.id FROM trainers WHERE lower(trim(trainers.email)) = lower(trim(((SELECT auth.jwt() AS jwt) ->> 'email'::text)))))
  WITH CHECK (trainer_id IN ( SELECT trainers.id FROM trainers WHERE lower(trim(trainers.email)) = lower(trim(((SELECT auth.jwt() AS jwt) ->> 'email'::text)))));
DROP POLICY IF EXISTS "trainer_qualifications_trainer_delete" ON trainer_qualifications;
CREATE POLICY "trainer_qualifications_trainer_delete" ON trainer_qualifications FOR DELETE TO authenticated
  USING (trainer_id IN ( SELECT trainers.id FROM trainers WHERE lower(trim(trainers.email)) = lower(trim(((SELECT auth.jwt() AS jwt) ->> 'email'::text)))));

-- ============================ trainer_training_progress
DROP POLICY IF EXISTS "trainer_training_progress_select" ON trainer_training_progress;
CREATE POLICY "trainer_training_progress_select" ON trainer_training_progress FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1 FROM admins WHERE lower(trim(admins.email)) = lower(trim(((SELECT auth.jwt() AS jwt) ->> 'email'::text)))))
         OR (trainer_id IN ( SELECT trainers.id FROM trainers WHERE lower(trim(trainers.email)) = lower(trim(((SELECT auth.jwt() AS jwt) ->> 'email'::text))))));
DROP POLICY IF EXISTS "trainer_training_progress_trainer_insert" ON trainer_training_progress;
CREATE POLICY "trainer_training_progress_trainer_insert" ON trainer_training_progress FOR INSERT TO authenticated
  WITH CHECK (trainer_id IN ( SELECT trainers.id FROM trainers WHERE lower(trim(trainers.email)) = lower(trim(((SELECT auth.jwt() AS jwt) ->> 'email'::text)))));
DROP POLICY IF EXISTS "trainer_training_progress_trainer_update" ON trainer_training_progress;
CREATE POLICY "trainer_training_progress_trainer_update" ON trainer_training_progress FOR UPDATE TO authenticated
  USING (trainer_id IN ( SELECT trainers.id FROM trainers WHERE lower(trim(trainers.email)) = lower(trim(((SELECT auth.jwt() AS jwt) ->> 'email'::text)))))
  WITH CHECK (trainer_id IN ( SELECT trainers.id FROM trainers WHERE lower(trim(trainers.email)) = lower(trim(((SELECT auth.jwt() AS jwt) ->> 'email'::text)))));
DROP POLICY IF EXISTS "trainer_training_progress_trainer_delete" ON trainer_training_progress;
CREATE POLICY "trainer_training_progress_trainer_delete" ON trainer_training_progress FOR DELETE TO authenticated
  USING (trainer_id IN ( SELECT trainers.id FROM trainers WHERE lower(trim(trainers.email)) = lower(trim(((SELECT auth.jwt() AS jwt) ->> 'email'::text)))));

-- ============================ trainer_quiz_attempts
DROP POLICY IF EXISTS "trainer_quiz_attempts_select" ON trainer_quiz_attempts;
CREATE POLICY "trainer_quiz_attempts_select" ON trainer_quiz_attempts FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1 FROM admins WHERE lower(trim(admins.email)) = lower(trim(((SELECT auth.jwt() AS jwt) ->> 'email'::text)))))
         OR (trainer_id IN ( SELECT trainers.id FROM trainers WHERE lower(trim(trainers.email)) = lower(trim(((SELECT auth.jwt() AS jwt) ->> 'email'::text))))));
DROP POLICY IF EXISTS "trainer_quiz_attempts_trainer_insert" ON trainer_quiz_attempts;
CREATE POLICY "trainer_quiz_attempts_trainer_insert" ON trainer_quiz_attempts FOR INSERT TO authenticated
  WITH CHECK (trainer_id IN ( SELECT trainers.id FROM trainers WHERE lower(trim(trainers.email)) = lower(trim(((SELECT auth.jwt() AS jwt) ->> 'email'::text)))));
DROP POLICY IF EXISTS "trainer_quiz_attempts_trainer_update" ON trainer_quiz_attempts;
CREATE POLICY "trainer_quiz_attempts_trainer_update" ON trainer_quiz_attempts FOR UPDATE TO authenticated
  USING (trainer_id IN ( SELECT trainers.id FROM trainers WHERE lower(trim(trainers.email)) = lower(trim(((SELECT auth.jwt() AS jwt) ->> 'email'::text)))))
  WITH CHECK (trainer_id IN ( SELECT trainers.id FROM trainers WHERE lower(trim(trainers.email)) = lower(trim(((SELECT auth.jwt() AS jwt) ->> 'email'::text)))));
DROP POLICY IF EXISTS "trainer_quiz_attempts_trainer_delete" ON trainer_quiz_attempts;
CREATE POLICY "trainer_quiz_attempts_trainer_delete" ON trainer_quiz_attempts FOR DELETE TO authenticated
  USING (trainer_id IN ( SELECT trainers.id FROM trainers WHERE lower(trim(trainers.email)) = lower(trim(((SELECT auth.jwt() AS jwt) ->> 'email'::text)))));

-- ============================ trainer_payout_details (most sensitive — bank + crypto)
DROP POLICY IF EXISTS "trainer_payout_details_select" ON trainer_payout_details;
CREATE POLICY "trainer_payout_details_select" ON trainer_payout_details FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1 FROM admins WHERE lower(trim(admins.email)) = lower(trim(((SELECT auth.jwt() AS jwt) ->> 'email'::text)))))
         OR (trainer_id IN ( SELECT trainers.id FROM trainers WHERE lower(trim(trainers.email)) = lower(trim(((SELECT auth.jwt() AS jwt) ->> 'email'::text))))));
DROP POLICY IF EXISTS "trainer_payout_details_trainer_insert" ON trainer_payout_details;
CREATE POLICY "trainer_payout_details_trainer_insert" ON trainer_payout_details FOR INSERT TO authenticated
  WITH CHECK (trainer_id IN ( SELECT trainers.id FROM trainers WHERE lower(trim(trainers.email)) = lower(trim(((SELECT auth.jwt() AS jwt) ->> 'email'::text)))));
DROP POLICY IF EXISTS "trainer_payout_details_trainer_update" ON trainer_payout_details;
CREATE POLICY "trainer_payout_details_trainer_update" ON trainer_payout_details FOR UPDATE TO authenticated
  USING (trainer_id IN ( SELECT trainers.id FROM trainers WHERE lower(trim(trainers.email)) = lower(trim(((SELECT auth.jwt() AS jwt) ->> 'email'::text)))))
  WITH CHECK (trainer_id IN ( SELECT trainers.id FROM trainers WHERE lower(trim(trainers.email)) = lower(trim(((SELECT auth.jwt() AS jwt) ->> 'email'::text)))));
DROP POLICY IF EXISTS "trainer_payout_details_trainer_delete" ON trainer_payout_details;
CREATE POLICY "trainer_payout_details_trainer_delete" ON trainer_payout_details FOR DELETE TO authenticated
  USING (trainer_id IN ( SELECT trainers.id FROM trainers WHERE lower(trim(trainers.email)) = lower(trim(((SELECT auth.jwt() AS jwt) ->> 'email'::text)))));

-- ============================ trainer_agreement
DROP POLICY IF EXISTS "trainer_agreement_select" ON trainer_agreement;
CREATE POLICY "trainer_agreement_select" ON trainer_agreement FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1 FROM admins WHERE lower(trim(admins.email)) = lower(trim(((SELECT auth.jwt() AS jwt) ->> 'email'::text)))))
         OR (trainer_id IN ( SELECT trainers.id FROM trainers WHERE lower(trim(trainers.email)) = lower(trim(((SELECT auth.jwt() AS jwt) ->> 'email'::text))))));
DROP POLICY IF EXISTS "trainer_agreement_trainer_insert" ON trainer_agreement;
CREATE POLICY "trainer_agreement_trainer_insert" ON trainer_agreement FOR INSERT TO authenticated
  WITH CHECK (trainer_id IN ( SELECT trainers.id FROM trainers WHERE lower(trim(trainers.email)) = lower(trim(((SELECT auth.jwt() AS jwt) ->> 'email'::text)))));
DROP POLICY IF EXISTS "trainer_agreement_trainer_update" ON trainer_agreement;
CREATE POLICY "trainer_agreement_trainer_update" ON trainer_agreement FOR UPDATE TO authenticated
  USING (trainer_id IN ( SELECT trainers.id FROM trainers WHERE lower(trim(trainers.email)) = lower(trim(((SELECT auth.jwt() AS jwt) ->> 'email'::text)))))
  WITH CHECK (trainer_id IN ( SELECT trainers.id FROM trainers WHERE lower(trim(trainers.email)) = lower(trim(((SELECT auth.jwt() AS jwt) ->> 'email'::text)))));
DROP POLICY IF EXISTS "trainer_agreement_trainer_delete" ON trainer_agreement;
CREATE POLICY "trainer_agreement_trainer_delete" ON trainer_agreement FOR DELETE TO authenticated
  USING (trainer_id IN ( SELECT trainers.id FROM trainers WHERE lower(trim(trainers.email)) = lower(trim(((SELECT auth.jwt() AS jwt) ->> 'email'::text)))));

COMMIT;
