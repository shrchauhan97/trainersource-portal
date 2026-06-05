-- 2026-06-05 — case-fold the cross-table email comparison in the onboarding
-- detail-table RLS policies so the database layer matches the now
-- case-insensitive application layer (PR #47, T2.13 — `normalizeSessionEmail`).
--
-- THE SPLIT-BRAIN BUG
-- -------------------
-- PR #47 made every session-derived email lookup in the app case-insensitive:
-- a session carrying `Sarah@Example.COM` is `.trim().toLowerCase()`'d to
-- `sarah@example.com` before any `.eq('email', …)`. The persisted rows are
-- themselves guaranteed lower-case + trimmed by the
-- `trainers_email_lowercase_check` / `admins_email_lowercase_check` CHECK
-- constraints (migration 2026-06-02). So at the app layer, a mixed-case
-- session now authorizes correctly.
--
-- But RLS runs a SECOND, independent authorization on top of the query. Six
-- onboarding detail tables gate via cross-table subqueries that compare the
-- RAW (un-lowered, un-trimmed) JWT email against the stored email:
--
--     trainer_id IN (SELECT id FROM trainers WHERE email = (SELECT auth.jwt() ->> 'email'))
--     EXISTS (SELECT 1 FROM admins WHERE email = (SELECT auth.jwt() ->> 'email'))
--
-- Because the JWT email preserves the case the user typed at sign-in, a
-- mixed-case session (`Sarah@Example.COM`) passes the app check but the RLS
-- subquery's `email = 'Sarah@Example.COM'` matches NO stored row (rows are
-- canonical `sarah@example.com`). The query is then silently filtered to the
-- empty set: the trainer sees none of their own application / qualifications /
-- training / quiz / payout / agreement data, and an admin reading those tables
-- gets nothing back. A silent, confusing data-disappears-on-mixed-case bug —
-- and a correctness hazard on the most sensitive table (trainer_payout_details
-- holds bank + crypto references).
--
-- THE FIX
-- -------
-- Wrap BOTH sides of every such email comparison in `lower(trim(...))`:
--
--     lower(trim(email)) = lower(trim((SELECT auth.jwt() ->> 'email')))
--
-- This is the exact case-fold the `trainers`/`admins` own policies and the
-- `is_admin()` / `current_trainer_id()` helper functions (supabase/rls.sql)
-- already apply. Nothing else changes: same policy names, same USING /
-- WITH CHECK structure, same tables, same commands, same initplan
-- `(SELECT auth.jwt() ->> 'email')` wrapping introduced by
-- 2026-05-21-rls-initplan-wrap.sql. This is a minimal, security-PRESERVING
-- alignment — it only makes the existing match case-insensitive, it does NOT
-- broaden who can see what. A row that matched before still matches; the only
-- new matches are the mixed-case sessions that SHOULD have matched all along.
--
-- SCOPE NOTE (which policies are actually affected)
-- -------------------------------------------------
-- The `commissions`, `payouts`, `access_codes`, and `customers` policies do
-- NOT compare email inline — they gate via `public.current_trainer_id()` and
-- `public.is_admin()`, which ALREADY normalize with
-- `lower(trim(coalesce((auth.jwt()->>'email')::text, '')))` (supabase/rls.sql
-- lines 19–32). So those four tables are NOT split-brain and need no change.
-- The only policies in the schema that compare a raw, un-lowered JWT email are
-- the twelve below, on the six onboarding detail tables defined in
-- migrations/0003_onboarding_rls.sql and re-created by
-- 2026-05-21-rls-initplan-wrap.sql. Those are exactly the affected policies.
--
-- Idempotent: DROP POLICY IF EXISTS before each CREATE; wrapped in a single
-- transaction so the swap is atomic. Mirrors (and should be kept in sync with)
-- the canonical migrations/0003_onboarding_rls.sql.
--
-- Verification after apply (run as a trainer whose stored email is lower-case
-- but whose session email is mixed-case):
--   SELECT count(*) FROM trainer_application_details;  -- > 0, not silently 0

BEGIN;

-- trainer_application_details
DROP POLICY IF EXISTS "trainer manages own application" ON trainer_application_details;
CREATE POLICY "trainer manages own application"
  ON trainer_application_details FOR ALL TO authenticated
  USING (trainer_id IN (SELECT id FROM trainers WHERE lower(trim(email)) = lower(trim((SELECT auth.jwt() ->> 'email')))))
  WITH CHECK (trainer_id IN (SELECT id FROM trainers WHERE lower(trim(email)) = lower(trim((SELECT auth.jwt() ->> 'email')))));

DROP POLICY IF EXISTS "admin reads all applications" ON trainer_application_details;
CREATE POLICY "admin reads all applications"
  ON trainer_application_details FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM admins WHERE lower(trim(email)) = lower(trim((SELECT auth.jwt() ->> 'email')))));

-- trainer_qualifications
DROP POLICY IF EXISTS "trainer manages own qualifications" ON trainer_qualifications;
CREATE POLICY "trainer manages own qualifications"
  ON trainer_qualifications FOR ALL TO authenticated
  USING (trainer_id IN (SELECT id FROM trainers WHERE lower(trim(email)) = lower(trim((SELECT auth.jwt() ->> 'email')))))
  WITH CHECK (trainer_id IN (SELECT id FROM trainers WHERE lower(trim(email)) = lower(trim((SELECT auth.jwt() ->> 'email')))));

DROP POLICY IF EXISTS "admin reads all qualifications" ON trainer_qualifications;
CREATE POLICY "admin reads all qualifications"
  ON trainer_qualifications FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM admins WHERE lower(trim(email)) = lower(trim((SELECT auth.jwt() ->> 'email')))));

-- trainer_training_progress
DROP POLICY IF EXISTS "trainer manages own training" ON trainer_training_progress;
CREATE POLICY "trainer manages own training"
  ON trainer_training_progress FOR ALL TO authenticated
  USING (trainer_id IN (SELECT id FROM trainers WHERE lower(trim(email)) = lower(trim((SELECT auth.jwt() ->> 'email')))))
  WITH CHECK (trainer_id IN (SELECT id FROM trainers WHERE lower(trim(email)) = lower(trim((SELECT auth.jwt() ->> 'email')))));

DROP POLICY IF EXISTS "admin reads all training" ON trainer_training_progress;
CREATE POLICY "admin reads all training"
  ON trainer_training_progress FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM admins WHERE lower(trim(email)) = lower(trim((SELECT auth.jwt() ->> 'email')))));

-- trainer_quiz_attempts
DROP POLICY IF EXISTS "trainer manages own quiz attempts" ON trainer_quiz_attempts;
CREATE POLICY "trainer manages own quiz attempts"
  ON trainer_quiz_attempts FOR ALL TO authenticated
  USING (trainer_id IN (SELECT id FROM trainers WHERE lower(trim(email)) = lower(trim((SELECT auth.jwt() ->> 'email')))))
  WITH CHECK (trainer_id IN (SELECT id FROM trainers WHERE lower(trim(email)) = lower(trim((SELECT auth.jwt() ->> 'email')))));

DROP POLICY IF EXISTS "admin reads all quiz attempts" ON trainer_quiz_attempts;
CREATE POLICY "admin reads all quiz attempts"
  ON trainer_quiz_attempts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM admins WHERE lower(trim(email)) = lower(trim((SELECT auth.jwt() ->> 'email')))));

-- trainer_payout_details (most sensitive — bank + crypto)
DROP POLICY IF EXISTS "trainer manages own payout" ON trainer_payout_details;
CREATE POLICY "trainer manages own payout"
  ON trainer_payout_details FOR ALL TO authenticated
  USING (trainer_id IN (SELECT id FROM trainers WHERE lower(trim(email)) = lower(trim((SELECT auth.jwt() ->> 'email')))))
  WITH CHECK (trainer_id IN (SELECT id FROM trainers WHERE lower(trim(email)) = lower(trim((SELECT auth.jwt() ->> 'email')))));

DROP POLICY IF EXISTS "admin reads all payouts" ON trainer_payout_details;
CREATE POLICY "admin reads all payouts"
  ON trainer_payout_details FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM admins WHERE lower(trim(email)) = lower(trim((SELECT auth.jwt() ->> 'email')))));

-- trainer_agreement
DROP POLICY IF EXISTS "trainer manages own agreement" ON trainer_agreement;
CREATE POLICY "trainer manages own agreement"
  ON trainer_agreement FOR ALL TO authenticated
  USING (trainer_id IN (SELECT id FROM trainers WHERE lower(trim(email)) = lower(trim((SELECT auth.jwt() ->> 'email')))))
  WITH CHECK (trainer_id IN (SELECT id FROM trainers WHERE lower(trim(email)) = lower(trim((SELECT auth.jwt() ->> 'email')))));

DROP POLICY IF EXISTS "admin reads all agreements" ON trainer_agreement;
CREATE POLICY "admin reads all agreements"
  ON trainer_agreement FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM admins WHERE lower(trim(email)) = lower(trim((SELECT auth.jwt() ->> 'email')))));

COMMIT;
