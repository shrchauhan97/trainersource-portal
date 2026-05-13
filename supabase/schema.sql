-- TrainerSource Database Schema
-- Target: Supabase (PostgreSQL)
-- Apply via Supabase Dashboard -> SQL Editor -> paste -> Run.
-- Includes all columns Fred's portal code expects:
--   - trainers.slug / reorder_commission_rate / max_clients
--   - commissions.commission_type
-- Safe to re-run: each CREATE uses IF NOT EXISTS where possible.

-- Custom types
DO $$ BEGIN CREATE TYPE admin_role AS ENUM ('superadmin', 'admin'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE trainer_tier AS ENUM ('trainer', 'lead', 'network_partner'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE trainer_status AS ENUM ('applied', 'onboarding', 'active', 'suspended'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE code_type AS ENUM ('trainer', 'founder', 'organic'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE code_status AS ENUM ('active', 'consumed', 'expired'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE order_status AS ENUM ('pending', 'paid', 'shipped', 'delivered'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE payout_status AS ENUM ('pending', 'sent', 'confirmed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE commission_status AS ENUM ('pending', 'approved', 'paid'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE commission_type AS ENUM ('first_sale', 'reorder'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Admins (Tim & Matt are superadmins in prod; demo seeds one admin)
CREATE TABLE IF NOT EXISTS admins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    role admin_role NOT NULL DEFAULT 'admin',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trainers
CREATE TABLE IF NOT EXISTS trainers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT,
    country TEXT NOT NULL,
    city TEXT NOT NULL,
    niche TEXT,
    social_media TEXT,
    slug TEXT UNIQUE,
    tier trainer_tier NOT NULL DEFAULT 'trainer',
    status trainer_status NOT NULL DEFAULT 'applied',
    commission_rate DECIMAL NOT NULL DEFAULT 0.20,
    reorder_commission_rate DECIMAL NOT NULL DEFAULT 0.10,
    max_clients INT NOT NULL DEFAULT 100,
    wise_account TEXT,
    onboarding_completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Access codes (one-time, 7-day expiry by default, attribute customers to trainers)
CREATE TABLE IF NOT EXISTS access_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    type code_type NOT NULL DEFAULT 'trainer',
    trainer_id UUID REFERENCES trainers(id),
    status code_status NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_by UUID,
    consumed_at TIMESTAMPTZ
);

-- Customers (created on successful access code redemption)
CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bigcommerce_customer_id TEXT UNIQUE,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    phone TEXT,
    country TEXT NOT NULL,
    city TEXT NOT NULL,
    trainer_id UUID REFERENCES trainers(id),
    access_code_id UUID REFERENCES access_codes(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- FK on access_codes.consumed_by (added after customers table exists)
DO $$ BEGIN
    ALTER TABLE access_codes ADD CONSTRAINT fk_consumed_by FOREIGN KEY (consumed_by) REFERENCES customers(id);
EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN invalid_foreign_key THEN NULL;
END $$;

-- Orders (created by the BigCommerce webhook handler)
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bigcommerce_order_id TEXT UNIQUE NOT NULL,
    customer_id UUID NOT NULL REFERENCES customers(id),
    trainer_id UUID REFERENCES trainers(id),
    total DECIMAL NOT NULL,
    status order_status NOT NULL DEFAULT 'pending',
    payment_method TEXT DEFAULT 'ACH via Paychron',
    shipstation_id TEXT,
    country TEXT,
    city TEXT,
    placed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Payouts (batched Wise transfers to trainers)
CREATE TABLE IF NOT EXISTS payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trainer_id UUID NOT NULL REFERENCES trainers(id),
    total DECIMAL NOT NULL,
    wise_transfer_id TEXT,
    status payout_status NOT NULL DEFAULT 'pending',
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Commissions (per order, grouped into payouts)
CREATE TABLE IF NOT EXISTS commissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trainer_id UUID NOT NULL REFERENCES trainers(id),
    order_id UUID NOT NULL REFERENCES orders(id),
    payout_id UUID REFERENCES payouts(id),
    commission_type commission_type NOT NULL,
    rate_snapshot DECIMAL NOT NULL,
    amount DECIMAL NOT NULL,
    status commission_status NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_trainers_status ON trainers(status);
CREATE INDEX IF NOT EXISTS idx_trainers_country_city ON trainers(country, city);
CREATE INDEX IF NOT EXISTS idx_trainers_slug ON trainers(slug);
CREATE INDEX IF NOT EXISTS idx_access_codes_trainer ON access_codes(trainer_id);
CREATE INDEX IF NOT EXISTS idx_access_codes_status ON access_codes(status);
CREATE INDEX IF NOT EXISTS idx_customers_trainer ON customers(trainer_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_trainer ON orders(trainer_id);
CREATE INDEX IF NOT EXISTS idx_orders_country_city ON orders(country, city);
CREATE INDEX IF NOT EXISTS idx_commissions_trainer ON commissions(trainer_id);
CREATE INDEX IF NOT EXISTS idx_commissions_payout ON commissions(payout_id);
CREATE INDEX IF NOT EXISTS idx_commissions_status ON commissions(status);
CREATE INDEX IF NOT EXISTS idx_payouts_trainer ON payouts(trainer_id);

-- Bot acknowledgment ledger — records each Telegram user's one-time
-- acknowledgment of the research-use disclaimer gate in @peptidebutlerbot.
-- Version column exists so a material disclaimer change (e.g. new hard-block
-- category) can re-gate every user by bumping ACKNOWLEDGMENT_VERSION in the
-- bot's env. Bot writes via the service role key (bypasses RLS).
create table if not exists public.bot_user_acknowledgments (
  telegram_user_id       bigint      primary key,
  acknowledgment_version text        not null,
  acknowledged_at        timestamptz not null default now()
);

-- === kb_chunks (Peptide Concierge v2 RAG) ===

create extension if not exists vector;

create table if not exists public.kb_chunks (
  id               uuid primary key default gen_random_uuid(),
  source_type      text not null,
  source_creator   text,
  source_url       text,
  source_title     text not null,
  show_attribution boolean not null default true,
  mode             text not null default 'all',
  parent_doc_id    text not null,
  chunk_position   int not null,
  text             text not null,
  tags             text[] not null default '{}',
  sku_hints        text[] not null default '{}',
  embedding        vector(768) not null,
  ingested_at      timestamptz not null default now(),
  content_hash     text not null unique,
  constraint kb_chunks_mode_check check (mode in ('all', 'partner_only', 'customer_only')),
  constraint kb_chunks_source_type_check check (
    source_type in ('matt_kb', 'yt_huberman', 'yt_smashrx', 'yt_creator',
                    'yt_howto', 'pubmed', 'l30d', 'ts_manual')
  )
);

create index if not exists kb_chunks_embedding_idx
  on public.kb_chunks using hnsw (embedding vector_cosine_ops);
create index if not exists kb_chunks_source_mode_idx
  on public.kb_chunks (source_type, mode);
create index if not exists kb_chunks_creator_idx
  on public.kb_chunks (source_creator) where source_creator is not null;
create index if not exists kb_chunks_sku_hints_idx
  on public.kb_chunks using gin (sku_hints);

-- mode-filtered top-K nearest-neighbor search
-- mode_filter must be 'customer' or 'partner'; any other value falls through to customer
-- scope (the safer default — customer scope excludes partner_only content). Callers
-- from bot code pass typed 'customer' | 'partner' values.
create or replace function match_chunks(
  query_embedding vector(768),
  match_count int default 6,
  mode_filter text default 'customer'
)
returns table (
  id uuid,
  source_type text,
  source_creator text,
  source_url text,
  source_title text,
  show_attribution boolean,
  text text,
  tags text[],
  sku_hints text[],
  similarity float
)
language sql stable parallel safe
as $$
  select
    c.id, c.source_type, c.source_creator, c.source_url, c.source_title,
    c.show_attribution, c.text, c.tags, c.sku_hints,
    1 - (c.embedding <=> query_embedding) as similarity
  from public.kb_chunks c
  where
    case when mode_filter = 'partner'
      then c.mode in ('all', 'partner_only')
      else c.mode in ('all', 'customer_only')
    end
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

-- source-type-filtered top-K with creator boost for ranking
-- source_types: array of source_type values to restrict the query (intent-biased retrieval)
-- creator_boost: jsonb map from source_creator → boost multiplier (e.g. '{"smashrx": 1.15}')
-- similarity is clamped to >= 0 before applying boost to avoid sign-flipping on near-orthogonal
-- vectors (cosine similarity can go slightly negative for unrelated content)
-- mode_filter: must be 'customer' or 'partner' — unknown values fall through to customer scope
create or replace function match_chunks_biased(
  query_embedding vector(768),
  source_types text[],
  creator_boost jsonb default '{}',
  match_count int default 4,
  mode_filter text default 'customer'
)
returns table (
  id uuid,
  source_type text,
  source_creator text,
  source_url text,
  source_title text,
  show_attribution boolean,
  text text,
  tags text[],
  sku_hints text[],
  similarity float
)
language sql stable parallel safe
as $$
  select
    c.id, c.source_type, c.source_creator, c.source_url, c.source_title,
    c.show_attribution, c.text, c.tags, c.sku_hints,
    greatest(1 - (c.embedding <=> query_embedding), 0) *
      coalesce((creator_boost ->> c.source_creator)::float, 1.0)
      as similarity
  from public.kb_chunks c
  where
    c.source_type = any(source_types)
    and case when mode_filter = 'partner'
      then c.mode in ('all', 'partner_only')
      else c.mode in ('all', 'customer_only')
    end
  order by
    greatest(1 - (c.embedding <=> query_embedding), 0) *
      coalesce((creator_boost ->> c.source_creator)::float, 1.0)
    desc
  limit match_count;
$$;

-- === coa_cache (Peptide Concierge v2 — P3 COA delivery) ===
-- v1: single lot per SKU. PK = sku, so re-ingest overwrites previous lot.
-- To support multi-lot history, promote PK to (sku, lot_number) and
-- return the most recent by default with an inline "view older" button.

CREATE TABLE IF NOT EXISTS coa_cache (
  sku              text PRIMARY KEY,
  drive_file_id    text NOT NULL,
  filename         text NOT NULL,
  lot_number       text,
  issued_date      date,
  purity_pct       numeric,
  telegram_file_id text,
  cached_at        timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS coa_cache_lot_idx ON coa_cache (lot_number);

-- Logs every time a user asks for a COA we don't have on file.
-- Ops reviews weekly; lets Tim know which SKUs to prioritize.
CREATE TABLE IF NOT EXISTS coa_missing_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku               text NOT NULL,
  telegram_user_id  bigint NOT NULL,
  telegram_username text,
  requested_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS coa_missing_events_sku_idx ON coa_missing_events (sku);
CREATE INDEX IF NOT EXISTS coa_missing_events_requested_at_idx ON coa_missing_events (requested_at DESC);

-- === Partner Mode (Peptide Concierge v2 P4) ===

-- Telegram <-> trainer identity link, populated by the Login Widget callback
-- or by the bot-initiated Login URL flow. One row per Telegram user.
CREATE TABLE IF NOT EXISTS trainer_telegram_links (
    telegram_user_id BIGINT PRIMARY KEY,
    trainer_id       UUID NOT NULL REFERENCES trainers(id),
    linked_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    linked_via       TEXT NOT NULL,
    CONSTRAINT trainer_telegram_links_linked_via_check
        CHECK (linked_via IN ('widget', 'login_url', 'manual_admin'))
);

CREATE INDEX IF NOT EXISTS idx_trainer_telegram_links_trainer
    ON trainer_telegram_links (trainer_id);

-- Distinguish portal-issued vs bot-issued access codes, and carry a label
-- for the /mycodes readout. Additive, backward-compatible — existing rows
-- default to issued_via='portal' and NULL label.
ALTER TABLE access_codes
    ADD COLUMN IF NOT EXISTS issued_via TEXT NOT NULL DEFAULT 'portal'
        CHECK (issued_via IN ('portal', 'bot', 'manual_admin'));

ALTER TABLE access_codes
    ADD COLUMN IF NOT EXISTS label TEXT;

CREATE INDEX IF NOT EXISTS idx_access_codes_trainer_issued
    ON access_codes (trainer_id, issued_via);

-- === bc_customer_links (Peptide Concierge v2 P5 — reorder concierge) ===
-- Telegram <-> BigCommerce customer link, used by the reorder-concierge cron
-- to nudge customers who haven't reordered in a while. Bot writes via the
-- service role key (bypasses RLS).
--
-- Column semantics:
--   last_reminder_at   — timestamp of most recent re-engagement DM; NULL = never reminded.
--   reminders_ignored  — incremented when a reminder is sent but the user doesn't
--                        engage within the cooldown window. When it hits 2, the cron
--                        auto-sets quiet_mode = true.
--   last_order_id /    — cached from BC so the nightly cron doesn't hit the BC API
--   last_order_date      for every customer on every run.

CREATE TABLE IF NOT EXISTS bc_customer_links (
  telegram_user_id    bigint PRIMARY KEY,
  bc_customer_id      bigint NOT NULL,
  linked_at           timestamptz NOT NULL DEFAULT now(),
  quiet_mode          boolean NOT NULL DEFAULT false,
  last_reminder_at    timestamptz,
  reminders_ignored   int NOT NULL DEFAULT 0,
  last_order_id       bigint,
  last_order_date     date
);

CREATE INDEX IF NOT EXISTS bc_customer_links_bc_customer_idx
  ON bc_customer_links (bc_customer_id);

CREATE INDEX IF NOT EXISTS bc_customer_links_reengage_idx
  ON bc_customer_links (last_reminder_at)
  WHERE quiet_mode = false;

-- === Lifecycle Removal (2026-04-23) ===
-- Mirrors supabase/migrations/2026-04-23-lifecycle.sql — kept in sync so a fresh
-- dev project can be stood up from schema.sql alone.

-- 1. Customer status enum + column
DO $$ BEGIN
  CREATE TYPE customer_status AS ENUM ('active', 'suspended', 'removed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS status customer_status NOT NULL DEFAULT 'active';

CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status);

-- 2. Widen access_codes.status to include 'revoked'
DO $$ BEGIN
  ALTER TYPE code_status ADD VALUE IF NOT EXISTS 'revoked';
EXCEPTION WHEN invalid_text_representation THEN NULL; END $$;

-- 3. Lifecycle events audit ledger
DO $$ BEGIN
  CREATE TYPE lifecycle_entity AS ENUM ('customer', 'trainer', 'access_code');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS lifecycle_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type      lifecycle_entity NOT NULL,
  entity_id        UUID NOT NULL,
  from_status      TEXT,
  to_status        TEXT NOT NULL,
  actor_admin_id   UUID NOT NULL REFERENCES admins(id),
  reason_category  TEXT NOT NULL
    CHECK (reason_category IN ('abuse', 'fraud', 'compliance', 'churn', 'test-data', 'other')),
  reason_note      TEXT,
  metadata         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lifecycle_events_entity
  ON lifecycle_events(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lifecycle_events_actor
  ON lifecycle_events(actor_admin_id, created_at DESC);

-- 4. Bot blocklist — for cold Telegram users who were never customers
CREATE TABLE IF NOT EXISTS bot_blocklist (
  telegram_user_id BIGINT PRIMARY KEY,
  blocked_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  blocked_by       UUID NOT NULL REFERENCES admins(id),
  reason_category  TEXT NOT NULL
    CHECK (reason_category IN ('abuse', 'spam', 'fraud', 'other')),
  reason_note      TEXT
);

-- === BC webhook idempotency (2026-05-14) ===
-- Mirrors supabase/migrations/2026-05-14-bc-webhook-idempotency.sql — kept in
-- sync so a fresh dev project can be stood up from schema.sql alone.

-- 1. UNIQUE on commissions(order_id) — one commission per order. Defense-in-
-- depth alongside the RPC ON CONFLICT path.
DO $$ BEGIN
  ALTER TABLE public.commissions
    ADD CONSTRAINT commissions_order_id_key UNIQUE (order_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN duplicate_table THEN NULL;
END $$;

-- 2. Atomic order+commission ingest RPC. The BC webhook (src/app/api/webhooks/
-- bigcommerce/route.ts) calls this so both writes commit together or roll
-- back together. ON CONFLICT (bigcommerce_order_id) DO NOTHING makes the
-- whole call idempotent against BC's retry-on-timeout behaviour.
CREATE OR REPLACE FUNCTION public.ingest_bc_order_and_commission(
  p_bigcommerce_order_id text,
  p_customer_id          uuid,
  p_trainer_id           uuid,
  p_total                numeric,
  p_status               text,
  p_payment_method       text,
  p_country              text,
  p_city                 text,
  p_placed_at            timestamptz,
  p_updated_at           timestamptz,
  p_commission_type      text    DEFAULT NULL,
  p_commission_rate      numeric DEFAULT NULL,
  p_commission_amount    numeric DEFAULT NULL
)
RETURNS TABLE (
  ok            boolean,
  was_new       boolean,
  reason        text,
  order_id      uuid,
  commission_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order_id      uuid;
  v_xmax          xid;
  v_commission_id uuid;
  v_was_new       boolean;
BEGIN
  INSERT INTO public.orders (
    bigcommerce_order_id, customer_id, trainer_id, total, status,
    payment_method, country, city, placed_at, updated_at
  )
  VALUES (
    p_bigcommerce_order_id, p_customer_id, p_trainer_id, p_total,
    p_status::order_status, p_payment_method, p_country, p_city,
    p_placed_at, p_updated_at
  )
  ON CONFLICT (bigcommerce_order_id) DO NOTHING
  RETURNING id, xmax INTO v_order_id, v_xmax;

  v_was_new := v_order_id IS NOT NULL;

  IF NOT v_was_new THEN
    SELECT id INTO v_order_id
      FROM public.orders
     WHERE bigcommerce_order_id = p_bigcommerce_order_id
     LIMIT 1;
    SELECT id INTO v_commission_id
      FROM public.commissions
     WHERE order_id = v_order_id
     LIMIT 1;
    RETURN QUERY SELECT true, false, 'duplicate_delivery'::text, v_order_id, v_commission_id;
    RETURN;
  END IF;

  IF p_trainer_id IS NOT NULL
     AND p_commission_amount IS NOT NULL
     AND p_commission_type IS NOT NULL
     AND p_commission_rate IS NOT NULL
  THEN
    INSERT INTO public.commissions (
      trainer_id, order_id, commission_type, rate_snapshot, amount, status
    )
    VALUES (
      p_trainer_id, v_order_id, p_commission_type::commission_type,
      p_commission_rate, p_commission_amount, 'pending'
    )
    RETURNING id INTO v_commission_id;
  END IF;

  RETURN QUERY SELECT true, true, NULL::text, v_order_id, v_commission_id;
  RETURN;

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'ingest_bc_order_and_commission(%) failed: % / %',
      p_bigcommerce_order_id, SQLSTATE, SQLERRM;
    RETURN QUERY SELECT false, false, 'server_error'::text, NULL::uuid, NULL::uuid;
    RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.ingest_bc_order_and_commission(
  text, uuid, uuid, numeric, text, text, text, text, timestamptz, timestamptz,
  text, numeric, numeric
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.ingest_bc_order_and_commission(
  text, uuid, uuid, numeric, text, text, text, text, timestamptz, timestamptz,
  text, numeric, numeric
) TO service_role;
