-- TrainerSource Database Schema
-- Platform: Supabase (PostgreSQL)
-- Last updated: 2026-04-13 (includes KJ review additions)

-- Custom types
CREATE TYPE admin_role AS ENUM ('superadmin', 'admin');
CREATE TYPE trainer_tier AS ENUM ('trainer', 'lead', 'network_partner');
CREATE TYPE trainer_status AS ENUM ('applied', 'onboarding', 'active', 'suspended');
CREATE TYPE code_type AS ENUM ('trainer', 'founder', 'organic');
CREATE TYPE code_status AS ENUM ('active', 'consumed', 'expired');
CREATE TYPE order_status AS ENUM ('pending', 'paid', 'shipped', 'delivered');
CREATE TYPE payout_status AS ENUM ('pending', 'sent', 'confirmed');
CREATE TYPE commission_status AS ENUM ('pending', 'approved', 'paid');
CREATE TYPE commission_type AS ENUM ('first_sale', 'reorder');

-- Admins (separate from trainers — Tim & Matt are superadmins)
CREATE TABLE admins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    role admin_role NOT NULL DEFAULT 'admin',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trainers
CREATE TABLE trainers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT,
    country TEXT NOT NULL,
    city TEXT NOT NULL,
    niche TEXT,
    social_media TEXT,
    slug TEXT UNIQUE, -- persistent referral URL segment
    tier trainer_tier NOT NULL DEFAULT 'trainer',
    status trainer_status NOT NULL DEFAULT 'applied',
    commission_rate DECIMAL NOT NULL DEFAULT 0, -- base rate e.g. 0.20
    reorder_commission_rate DECIMAL NOT NULL DEFAULT 0, -- repeat purchase rate e.g. 0.10
    max_clients INT NOT NULL DEFAULT 100, -- cap per trainer
    wise_account TEXT,
    onboarding_completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Access Codes (one-time, 7-day expiry, attributes customers to trainers)
CREATE TABLE access_codes (
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

-- Customers (created when access code is consumed)
CREATE TABLE customers (
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

-- Add FK back-reference for access_codes.consumed_by
ALTER TABLE access_codes ADD CONSTRAINT fk_consumed_by FOREIGN KEY (consumed_by) REFERENCES customers(id);

-- Orders (from BigCommerce webhooks)
CREATE TABLE orders (
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

-- Payouts (batch Wise transfers to trainers)
CREATE TABLE payouts (
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
CREATE TABLE commissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trainer_id UUID NOT NULL REFERENCES trainers(id),
    order_id UUID NOT NULL REFERENCES orders(id),
    payout_id UUID REFERENCES payouts(id),
    commission_type commission_type NOT NULL DEFAULT 'first_sale',
    rate_snapshot DECIMAL NOT NULL,
    amount DECIMAL NOT NULL,
    status commission_status NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX idx_trainers_slug ON trainers(slug);
CREATE INDEX idx_trainers_status ON trainers(status);
CREATE INDEX idx_trainers_country_city ON trainers(country, city);
CREATE INDEX idx_access_codes_trainer ON access_codes(trainer_id);
CREATE INDEX idx_access_codes_status ON access_codes(status);
CREATE INDEX idx_customers_trainer ON customers(trainer_id);
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_trainer ON orders(trainer_id);
CREATE INDEX idx_orders_country_city ON orders(country, city);
CREATE INDEX idx_commissions_trainer ON commissions(trainer_id);
CREATE INDEX idx_commissions_payout ON commissions(payout_id);
CREATE INDEX idx_commissions_status ON commissions(status);
CREATE INDEX idx_payouts_trainer ON payouts(trainer_id);
