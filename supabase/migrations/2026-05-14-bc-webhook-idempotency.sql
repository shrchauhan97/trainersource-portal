-- BC webhook idempotency + atomic order/commission insert — 2026-05-14
-- Spec: bugs/fixes/F-T2.19-bc-webhook-transaction.md (Wave-3 T2.19)
--
-- Bug (per bugs/A4 P1, bugs/A7 R1):
--   src/app/api/webhooks/bigcommerce/route.ts performs orders.insert THEN
--   commissions.insert as two separate PostgREST calls. If the second throws
--   (FK violation, RLS, network blip), the order row stays but the commission
--   is silently lost. BC retries — the next attempt sees the existing order,
--   short-circuits, and the commission is never recorded.
--
--   Additionally the SELECT-then-INSERT idempotency check has a race window:
--   two concurrent BC deliveries for the same bigcommerce_order_id could both
--   pass the "not found" check before either INSERTs. UNIQUE on
--   orders.bigcommerce_order_id (already enforced at column level — verified
--   on prod) blocks the second insert, but the route surfaces it as a 500 →
--   BC keeps retrying with no progress.
--
-- Fix: single PL/pgSQL function does the whole webhook write in one txn.
--      INSERT ... ON CONFLICT DO NOTHING on the orders row turns the
--      check-then-insert race into a clean atomic claim; we detect "did this
--      INSERT actually insert?" via the RETURNING xmax trick (xmax = 0 for a
--      brand-new row, non-zero when ON CONFLICT triggered against an existing
--      row). If we won the claim AND a commission payload is supplied, we
--      insert the commission inside the same txn — either both land or both
--      roll back. The duplicate-delivery path returns ok=true, was_new=false
--      so the webhook route can respond 200 with {idempotent: true} instead
--      of 500-ing.
--
-- Also adds UNIQUE(commissions.order_id) — defense in depth so a stray
-- second commission insert (e.g. from a reconciliation script that bypassed
-- this RPC) hits a constraint instead of double-paying the trainer. This is
-- safe because the BC webhook is the ONLY path that writes commissions today
-- (verified by grep across trainersource-app + trainersource-bot).
--
-- Idempotent: CREATE OR REPLACE FUNCTION + IF NOT EXISTS on the UNIQUE.
-- Safe to re-run.

-- 1. Defense-in-depth UNIQUE on commissions(order_id). One commission per
-- order. The webhook is the only writer today, but a manual backfill or a
-- future reconciliation cron must not double-pay.
DO $$ BEGIN
  ALTER TABLE public.commissions
    ADD CONSTRAINT commissions_order_id_key UNIQUE (order_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN duplicate_table THEN NULL;
END $$;

-- 2. The atomic ingest RPC.
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
  -- Commission is optional: caller passes NULL for amount when the order is
  -- unattributed (no trainer) or in a non-settled status (pending/cancelled).
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
  -- 1. Atomic claim on the order row. ON CONFLICT DO NOTHING converts the
  --    check-then-insert race into a clean two-outcome operation:
  --      * brand-new row → RETURNING fires, xmax = 0
  --      * pre-existing row (duplicate webhook) → RETURNING does NOT fire
  --        (DO NOTHING swallows it), so the INSERT returns 0 rows.
  --    We use the standard "RETURNING xmax::text::bigint = 0" trick to
  --    distinguish, but since ON CONFLICT DO NOTHING already suppresses the
  --    RETURNING on conflict, the simpler check is: did we get a row back?
  INSERT INTO public.orders (
    bigcommerce_order_id,
    customer_id,
    trainer_id,
    total,
    status,
    payment_method,
    country,
    city,
    placed_at,
    updated_at
  )
  VALUES (
    p_bigcommerce_order_id,
    p_customer_id,
    p_trainer_id,
    p_total,
    p_status::order_status,
    p_payment_method,
    p_country,
    p_city,
    p_placed_at,
    p_updated_at
  )
  ON CONFLICT (bigcommerce_order_id) DO NOTHING
  RETURNING id, xmax INTO v_order_id, v_xmax;

  v_was_new := v_order_id IS NOT NULL;

  -- 2. Duplicate delivery path: re-read the order_id so the caller can log
  --    which order this webhook was retrying for.
  IF NOT v_was_new THEN
    SELECT id INTO v_order_id
      FROM public.orders
     WHERE bigcommerce_order_id = p_bigcommerce_order_id
     LIMIT 1;

    -- Whether the existing row has a commission row already is informational —
    -- we deliberately do NOT try to "heal" missing commissions here. That's a
    -- separate reconciliation job. The webhook's only job on a duplicate
    -- delivery is to ack idempotently.
    SELECT id INTO v_commission_id
      FROM public.commissions
     WHERE order_id = v_order_id
     LIMIT 1;

    RETURN QUERY SELECT
      true,                                -- ok
      false,                               -- was_new
      'duplicate_delivery'::text,          -- reason
      v_order_id,
      v_commission_id;
    RETURN;
  END IF;

  -- 3. Fresh order. Insert the commission if a payload was supplied. Both
  --    inserts run in the same implicit txn — any failure rolls back both.
  IF p_trainer_id IS NOT NULL
     AND p_commission_amount IS NOT NULL
     AND p_commission_type IS NOT NULL
     AND p_commission_rate IS NOT NULL
  THEN
    INSERT INTO public.commissions (
      trainer_id,
      order_id,
      commission_type,
      rate_snapshot,
      amount,
      status
    )
    VALUES (
      p_trainer_id,
      v_order_id,
      p_commission_type::commission_type,
      p_commission_rate,
      p_commission_amount,
      'pending'
    )
    RETURNING id INTO v_commission_id;
  END IF;

  RETURN QUERY SELECT
    true,                  -- ok
    true,                  -- was_new
    NULL::text,            -- reason
    v_order_id,
    v_commission_id;
  RETURN;

EXCEPTION
  WHEN OTHERS THEN
    -- Anything throws inside the function body → the implicit txn rolls back,
    -- so neither the order nor the commission lands. We log to Postgres logs
    -- (visible via supabase get_logs) and return a graceful failure so the
    -- route gets a 200-ish typed response instead of an unprotected 500.
    --
    -- Specific cases this catches:
    --   * Concurrent webhook hits AFTER our ON CONFLICT DO NOTHING claim but
    --     BEFORE our commit — Postgres serialises on the unique-index lock.
    --     The second caller would see DO NOTHING with v_order_id=NULL and
    --     hit the duplicate_delivery path naturally; this EXCEPTION block
    --     handles unexpected SQLSTATE only.
    --   * Commission FK violation (trainer_id no longer exists by the time
    --     we INSERT) — order row rolls back too, leaving the system in a
    --     consistent state. BC will retry; if the trainer was lifecycle-
    --     deleted, the customer.trainer_id should also be NULL by then so
    --     we won't try to write a commission on retry.
    RAISE WARNING 'ingest_bc_order_and_commission(%) failed: % / %',
      p_bigcommerce_order_id, SQLSTATE, SQLERRM;
    RETURN QUERY SELECT
      false,                  -- ok
      false,                  -- was_new
      'server_error'::text,   -- reason
      NULL::uuid,
      NULL::uuid;
    RETURN;
END;
$$;

-- Lock down execution. The webhook route uses service_role; service_role
-- bypasses RLS but RPC EXECUTE still requires an explicit grant.
REVOKE ALL ON FUNCTION public.ingest_bc_order_and_commission(
  text, uuid, uuid, numeric, text, text, text, text, timestamptz, timestamptz,
  text, numeric, numeric
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.ingest_bc_order_and_commission(
  text, uuid, uuid, numeric, text, text, text, text, timestamptz, timestamptz,
  text, numeric, numeric
) TO service_role;
