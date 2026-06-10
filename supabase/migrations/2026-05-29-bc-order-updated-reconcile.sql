-- BC order status reconcile (ACH / Paychron settle-after-create)
-- Wave 2026-05-29: orders are frequently CREATED in a `pending` state (ACH /
-- Paychron) and only SETTLE later. BigCommerce signals that transition with
-- order/updated | order/statusUpdated webhooks, NOT a second order/created.
-- Until now the webhook route ignored those scopes, so a pending order that
-- later settled never produced a commission row — the trainer was silently
-- never paid for ACH orders. (Documented as a known TODO in
-- ultimate-peptides/docs/integration-points.md: "ACH orders may be created in
-- a pending state and settle later. A reconcile/poll ... is a known TODO.")
--
-- The webhook route now handles those scopes by calling this function. It
-- upserts the order (insert if missing, else refresh mutable fields) and
-- creates the commission once the order has settled AND no commission exists
-- yet. Idempotent on bigcommerce_order_id and on commissions(order_id).
--
-- Returns one row: (ok, was_new, reason, order_id, commission_id) — the SAME
-- shape as ingest_bc_order_and_commission. was_new=true means a commission row
-- was NEWLY created on this call, so the route fires the first-sale email.
--
-- Mirrors ingest_bc_order_and_commission's hardening: SECURITY DEFINER, pinned
-- search_path, EXECUTE revoked from anon/authenticated, granted to service_role
-- only (the webhook route calls it as service_role).

create or replace function public.reconcile_bc_order_and_commission(
  p_bigcommerce_order_id text,
  p_customer_id uuid,
  p_trainer_id uuid,
  p_total numeric,
  p_status text,
  p_payment_method text,
  p_country text,
  p_city text,
  p_placed_at timestamptz,
  p_updated_at timestamptz,
  p_commission_type text,
  p_commission_rate numeric,
  p_commission_amount numeric
) returns table (
  ok boolean,
  was_new boolean,
  reason text,
  order_id uuid,
  commission_id uuid
) language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_order_id uuid;
  v_commission_id uuid;
  v_existing_commission_id uuid;
begin
  -- Upsert the order row.
  select id into v_order_id
    from public.orders
    where bigcommerce_order_id = p_bigcommerce_order_id;

  if v_order_id is null then
    -- order/updated arrived without us ever having seen order/created.
    insert into public.orders (
      bigcommerce_order_id, customer_id, trainer_id, total, status,
      payment_method, country, city, placed_at, updated_at
    ) values (
      p_bigcommerce_order_id, p_customer_id, p_trainer_id, p_total, p_status::order_status,
      p_payment_method, p_country, p_city, p_placed_at, p_updated_at
    )
    returning id into v_order_id;
  else
    update public.orders
      set status = p_status::order_status,
          total = p_total,
          country = coalesce(p_country, country),
          city = coalesce(p_city, city),
          updated_at = p_updated_at
      where id = v_order_id;
  end if;

  -- Attach a commission only when the caller computed one (order has settled +
  -- there is trainer attribution) AND this order does not already have a
  -- commission. This is what makes the reconcile safe to call repeatedly.
  if p_commission_type is not null and p_commission_amount is not null and p_trainer_id is not null then
    select id into v_existing_commission_id
      from public.commissions
      where order_id = v_order_id
      limit 1;

    if v_existing_commission_id is null then
      insert into public.commissions (
        trainer_id, order_id, commission_type, rate_snapshot, amount, status
      ) values (
        p_trainer_id, v_order_id, p_commission_type::commission_type, p_commission_rate, p_commission_amount, 'pending'
      )
      returning id into v_commission_id;

      return query select true, true, null::text, v_order_id, v_commission_id;
      return;
    end if;

    -- Commission already booked for this order — idempotent no-op.
    return query select true, false, 'commission_exists'::text, v_order_id, v_existing_commission_id;
    return;
  end if;

  -- No commission payload (order still pending, or no trainer attribution).
  -- The order row was still upserted so its status stays in sync.
  return query select true, false, 'no_commission'::text, v_order_id, null::uuid;
exception
  when others then
    return query select false, false, SQLERRM::text, null::uuid, null::uuid;
end;
$$;

revoke execute on function public.reconcile_bc_order_and_commission(
  text, uuid, uuid, numeric, text, text, text, text, timestamptz, timestamptz, text, numeric, numeric
) from anon, authenticated;

grant execute on function public.reconcile_bc_order_and_commission(
  text, uuid, uuid, numeric, text, text, text, text, timestamptz, timestamptz, text, numeric, numeric
) to service_role;
