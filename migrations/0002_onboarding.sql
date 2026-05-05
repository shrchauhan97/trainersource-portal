-- Onboarding v2: 4-step Application → Training → Agreement → Go Live.
-- Adds detail tables hanging off trainers + a Storage bucket for uploads
-- (selfie video, qualification certs, signed agreement PDF).

create extension if not exists "pgcrypto";

-- Tracks the trainer's progress through the 4-step stepper. The current_step
-- column drives which screen they land on when they hit /onboarding.
-- Wrapped in DO block since CREATE TYPE has no IF NOT EXISTS clause.
do $$ begin
  create type onboarding_step as enum ('application','training','agreement','go_live');
exception
  when duplicate_object then null;
end $$;

alter table trainers
  add column if not exists onboarding_step onboarding_step not null default 'application',
  add column if not exists onboarding_started_at timestamptz;

-- Step 1: Application — Contact + Sales Goals tabs (qualifications in own table).
create table if not exists trainer_application_details (
  trainer_id uuid primary key references trainers(id) on delete cascade,
  -- Contact tab
  first_name text,
  last_name text,
  zip text,
  profession text,
  experience_years int check (experience_years is null or experience_years >= 0),
  specialty text,
  years_in_current_city int check (years_in_current_city is null or years_in_current_city >= 0),
  instagram text,
  facebook_or_other text,
  tiktok text,
  linkedin text,
  -- Sales Goals tab
  client_base_per_month int check (client_base_per_month is null or client_base_per_month >= 0),
  sales_goal_per_month int check (sales_goal_per_month is null or sales_goal_per_month >= 0),
  heard_about_source text,
  selfie_video_path text, -- Storage object path in onboarding-uploads bucket
  application_submitted_at timestamptz,
  updated_at timestamptz not null default now()
);

-- Step 1 cont.: Qualifications tab — N rows per trainer.
create table if not exists trainer_qualifications (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references trainers(id) on delete cascade,
  certificate_name text not null,
  issuing_body text,
  date_of_issue date,
  is_current boolean not null default true,
  upload_path text, -- Storage object path
  created_at timestamptz not null default now()
);
create index if not exists trainer_qualifications_trainer_idx on trainer_qualifications (trainer_id);

-- Step 2: Training — per-module watch + per-question quiz attempts.
create table if not exists trainer_training_progress (
  trainer_id uuid not null references trainers(id) on delete cascade,
  module_id text not null, -- 'peptides_intro' | 'retatrutide' | 'copper' | 'purity' | 'never_selling'
  watched_at timestamptz,
  primary key (trainer_id, module_id)
);

create table if not exists trainer_quiz_attempts (
  id bigserial primary key,
  trainer_id uuid not null references trainers(id) on delete cascade,
  question_key text not null,
  answer text not null,
  is_correct boolean not null,
  created_at timestamptz not null default now()
);
create index if not exists trainer_quiz_attempts_trainer_idx
  on trainer_quiz_attempts (trainer_id, created_at desc);

-- Step 3: Agreement — payout details + signed agreement.
create table if not exists trainer_payout_details (
  trainer_id uuid primary key references trainers(id) on delete cascade,
  legal_first_name text,
  legal_last_name text,
  street1 text,
  street2 text,
  city text,
  country text,
  zip text,
  bank_name text,
  branch_code text,
  account_number text,
  swift_code text,
  crypto_wallet_address text,
  updated_at timestamptz not null default now()
);

create table if not exists trainer_agreement (
  trainer_id uuid primary key references trainers(id) on delete cascade,
  welcome_video_watched_at timestamptz,
  signed_agreement_path text, -- Storage object path
  signed_at timestamptz,
  updated_at timestamptz not null default now()
);

-- Storage bucket for onboarding uploads. Bucket-level RLS is the default
-- restrictive posture; we add policies that let trainers read/write their
-- own folder (objects keyed under <trainer_id>/...).
insert into storage.buckets (id, name, public)
  values ('onboarding-uploads', 'onboarding-uploads', false)
  on conflict (id) do nothing;

-- Trainers can upload to their own folder. The folder name is the trainers.id
-- UUID; we resolve the auth.uid()->trainers.id mapping via email match.
-- CREATE POLICY has no IF NOT EXISTS, so we drop-then-create for idempotency.
drop policy if exists "trainer upload own folder" on storage.objects;
create policy "trainer upload own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'onboarding-uploads'
    and (storage.foldername(name))[1] in (
      select id::text from trainers where email = (auth.jwt() ->> 'email')
    )
  );

drop policy if exists "trainer read own folder" on storage.objects;
create policy "trainer read own folder"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'onboarding-uploads'
    and (storage.foldername(name))[1] in (
      select id::text from trainers where email = (auth.jwt() ->> 'email')
    )
  );

drop policy if exists "admins read all onboarding uploads" on storage.objects;
create policy "admins read all onboarding uploads"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'onboarding-uploads'
    and exists (
      select 1 from admins where email = (auth.jwt() ->> 'email')
    )
  );
