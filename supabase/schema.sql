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
create or replace function match_chunks(
  query_embedding vector(768),
  match_count int default 6,
  mode_filter text default 'customer'  -- 'customer' | 'partner'
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
language plpgsql
as $$
begin
  return query
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
end;
$$;
