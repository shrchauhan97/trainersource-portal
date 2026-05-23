-- Onboarding v2 RLS hardening.
-- 0002 created six trainer-scoped detail tables but did not enable RLS on
-- them. Anyone holding the anon key (i.e. anyone who loads the public site)
-- could read/write across trainers — including bank, crypto wallet, and
-- signed agreement references. This migration enables RLS and adds policies
-- mirroring the storage-bucket pattern: a trainer manages their own row,
-- admins can read all rows.
--
-- NOTE: auth.jwt() calls are wrapped in `(select auth.jwt() ->> 'email')` so
-- Postgres treats them as initplan subqueries (evaluated once per statement)
-- instead of per-row. Supabase advisor flags the unwrapped form as
-- `auth_rls_initplan`. See migration 2026-05-21-rls-initplan-wrap.sql.

alter table trainer_application_details enable row level security;
alter table trainer_qualifications        enable row level security;
alter table trainer_training_progress     enable row level security;
alter table trainer_quiz_attempts         enable row level security;
alter table trainer_payout_details        enable row level security;
alter table trainer_agreement             enable row level security;

-- trainer_application_details
drop policy if exists "trainer manages own application" on trainer_application_details;
create policy "trainer manages own application"
  on trainer_application_details for all to authenticated
  using (trainer_id in (select id from trainers where email = (select auth.jwt() ->> 'email')))
  with check (trainer_id in (select id from trainers where email = (select auth.jwt() ->> 'email')));

drop policy if exists "admin reads all applications" on trainer_application_details;
create policy "admin reads all applications"
  on trainer_application_details for select to authenticated
  using (exists (select 1 from admins where email = (select auth.jwt() ->> 'email')));

-- trainer_qualifications
drop policy if exists "trainer manages own qualifications" on trainer_qualifications;
create policy "trainer manages own qualifications"
  on trainer_qualifications for all to authenticated
  using (trainer_id in (select id from trainers where email = (select auth.jwt() ->> 'email')))
  with check (trainer_id in (select id from trainers where email = (select auth.jwt() ->> 'email')));

drop policy if exists "admin reads all qualifications" on trainer_qualifications;
create policy "admin reads all qualifications"
  on trainer_qualifications for select to authenticated
  using (exists (select 1 from admins where email = (select auth.jwt() ->> 'email')));

-- trainer_training_progress
drop policy if exists "trainer manages own training" on trainer_training_progress;
create policy "trainer manages own training"
  on trainer_training_progress for all to authenticated
  using (trainer_id in (select id from trainers where email = (select auth.jwt() ->> 'email')))
  with check (trainer_id in (select id from trainers where email = (select auth.jwt() ->> 'email')));

drop policy if exists "admin reads all training" on trainer_training_progress;
create policy "admin reads all training"
  on trainer_training_progress for select to authenticated
  using (exists (select 1 from admins where email = (select auth.jwt() ->> 'email')));

-- trainer_quiz_attempts
drop policy if exists "trainer manages own quiz attempts" on trainer_quiz_attempts;
create policy "trainer manages own quiz attempts"
  on trainer_quiz_attempts for all to authenticated
  using (trainer_id in (select id from trainers where email = (select auth.jwt() ->> 'email')))
  with check (trainer_id in (select id from trainers where email = (select auth.jwt() ->> 'email')));

drop policy if exists "admin reads all quiz attempts" on trainer_quiz_attempts;
create policy "admin reads all quiz attempts"
  on trainer_quiz_attempts for select to authenticated
  using (exists (select 1 from admins where email = (select auth.jwt() ->> 'email')));

-- trainer_payout_details (most sensitive — bank + crypto)
drop policy if exists "trainer manages own payout" on trainer_payout_details;
create policy "trainer manages own payout"
  on trainer_payout_details for all to authenticated
  using (trainer_id in (select id from trainers where email = (select auth.jwt() ->> 'email')))
  with check (trainer_id in (select id from trainers where email = (select auth.jwt() ->> 'email')));

drop policy if exists "admin reads all payouts" on trainer_payout_details;
create policy "admin reads all payouts"
  on trainer_payout_details for select to authenticated
  using (exists (select 1 from admins where email = (select auth.jwt() ->> 'email')));

-- trainer_agreement
drop policy if exists "trainer manages own agreement" on trainer_agreement;
create policy "trainer manages own agreement"
  on trainer_agreement for all to authenticated
  using (trainer_id in (select id from trainers where email = (select auth.jwt() ->> 'email')))
  with check (trainer_id in (select id from trainers where email = (select auth.jwt() ->> 'email')));

drop policy if exists "admin reads all agreements" on trainer_agreement;
create policy "admin reads all agreements"
  on trainer_agreement for select to authenticated
  using (exists (select 1 from admins where email = (select auth.jwt() ->> 'email')));
