-- code_attempts audit log — 2026-05-14
-- Spec: bugs/fixes/F-B.md (Tier-1 fix T1.6)
-- One row per POST /api/codes/validate, success or failure. Without this,
-- every "client couldn't get in" support ticket is a guessing game (the A9
-- root-cause for the KF7EHXDY incident took 30 min of cross-referencing
-- precisely because there was no per-attempt log).
--
-- Idempotent: IF NOT EXISTS / CREATE OR REPLACE everywhere.

CREATE TABLE IF NOT EXISTS public.code_attempts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempted_at    timestamptz NOT NULL DEFAULT now(),
  code            text NOT NULL,
  access_code_id  uuid REFERENCES public.access_codes(id) ON DELETE SET NULL,
  trainer_id      uuid REFERENCES public.trainers(id) ON DELETE SET NULL,
  email           text,
  name            text,
  country         text,
  city            text,
  ip_address      inet,
  user_agent      text,
  outcome         text NOT NULL,   -- 'success' | reason code (see route.ts contract)
  reason_detail   text,            -- free-form detail for 'server_error' rows
  duration_ms     integer
);

CREATE INDEX IF NOT EXISTS idx_code_attempts_code
  ON public.code_attempts (code, attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_code_attempts_trainer
  ON public.code_attempts (trainer_id, attempted_at DESC)
  WHERE trainer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_code_attempts_outcome
  ON public.code_attempts (outcome, attempted_at DESC);

ALTER TABLE public.code_attempts ENABLE ROW LEVEL SECURITY;

-- service_role bypasses RLS automatically, but we add an explicit policy so
-- the intent is documented in the schema.
DROP POLICY IF EXISTS code_attempts_service_all ON public.code_attempts;
CREATE POLICY code_attempts_service_all
  ON public.code_attempts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated trainers can SELECT only their own attempts. current_trainer_id()
-- is defined in the existing schema (see migrations/2026-04-23-lifecycle.sql
-- predecessors / A6 audit). Returns the trainer.id bound to the current
-- authenticated user, or NULL.
DROP POLICY IF EXISTS code_attempts_trainer_select ON public.code_attempts;
CREATE POLICY code_attempts_trainer_select
  ON public.code_attempts
  FOR SELECT
  TO authenticated
  USING (
    trainer_id IS NOT NULL
    AND trainer_id = public.current_trainer_id()
  );

-- anon: explicitly no policy → no access. (RLS default-deny.)
