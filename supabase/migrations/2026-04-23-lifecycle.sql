-- Lifecycle Removal migration — 2026-04-23
-- Adds reversible Suspend/Remove verbs for customers and trainers,
-- plus an audit ledger and a standalone bot blocklist.
-- Idempotent — safe to re-run.

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
