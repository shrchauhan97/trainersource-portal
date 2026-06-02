-- 2026-06-02 — enforce lowercase + trimmed emails on `trainers` and `admins`.
--
-- Motivation. PR #47 (T2.13 — `normalizeSessionEmail`) closed the READ side
-- of the case-sensitivity landmine: every session-derived email is now
-- `.trim().toLowerCase()`'d before being passed to `.eq('email', …)`. That
-- relies on a parallel invariant on the WRITE side: every persisted row in
-- `trainers.email` / `admins.email` is itself already lowercase + trimmed.
-- Audit `bugs/A4-ts-app-code-audit.md` (A5) flagged that the apply form
-- (`src/app/apply/actions.ts`) inserted `formData.get('email')` raw — no
-- normalization. The companion app-side fix in this nightly closes that
-- one site, and these CHECK constraints make the invariant unforgeable: any
-- future code path that tries to write `Alice@Example.COM` will be rejected
-- by Postgres before the row lands.
--
-- Live state confirmed prior to this migration:
--   SELECT COUNT(*) FROM public.trainers WHERE email <> lower(trim(email)) → 0
--   SELECT COUNT(*) FROM public.admins   WHERE email <> lower(trim(email)) → 0
-- So adding the constraint NOT VALID would be needlessly weaker; we add it
-- without NOT VALID and Postgres validates the existing rows synchronously.
-- Both tables are tiny (≤ 30 rows in prod) so the lock is sub-millisecond.
--
-- Idempotent. The DO-block pattern is the standard "ADD CONSTRAINT IF NOT
-- EXISTS" workaround — Postgres doesn't support that syntax directly on
-- CHECK constraints, so we look it up in pg_constraint first.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'trainers_email_lowercase_check'
      AND conrelid = 'public.trainers'::regclass
  ) THEN
    ALTER TABLE public.trainers
      ADD CONSTRAINT trainers_email_lowercase_check
        CHECK (email = lower(trim(email)));
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'admins_email_lowercase_check'
      AND conrelid = 'public.admins'::regclass
  ) THEN
    ALTER TABLE public.admins
      ADD CONSTRAINT admins_email_lowercase_check
        CHECK (email = lower(trim(email)));
  END IF;
END
$$;
