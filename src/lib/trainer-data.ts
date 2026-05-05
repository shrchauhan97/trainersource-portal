import type { SupabaseClient } from '@supabase/supabase-js';
import type { AccessCode, Commission, Customer } from '@/lib/types';

// ────────────────────────────────────────────────────────────────────────────
// Return shapes — match the existing DashboardCodeRow / DashboardCommissionRow
// contracts from src/app/dashboard/actions.ts. Keep names stable so extracting
// does not force a UI rewrite.
// ────────────────────────────────────────────────────────────────────────────

export type TrainerCodeRow = AccessCode & {
  consumedByName: string | null;
  displayStatus: 'active' | 'consumed' | 'expired';
};

export type TrainerClientRow = Customer & {
  orderCount: number;
};

export type TrainerCommissionRow = Commission & {
  customerName: string;
  bigcommerceOrderId: string;
};

export type TrainerCommissionSummary = {
  pending: number;
  approved: number;
  paid: number;
};

export type TrainerCommissionsPayload = {
  commissions: TrainerCommissionRow[];
  summary: TrainerCommissionSummary;
};

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function resolveCodeStatus(
  code: Pick<AccessCode, 'status' | 'expires_at'>,
): TrainerCodeRow['displayStatus'] {
  if (code.status === 'consumed') return 'consumed';
  if (new Date(code.expires_at).getTime() < Date.now()) return 'expired';
  return 'active';
}

// ────────────────────────────────────────────────────────────────────────────
// Queries — every function takes an already-resolved supabase client and a
// trainer_id. Zero auth logic here; callers (server action OR REST route OR
// Mini App aggregator) handle auth separately.
// ────────────────────────────────────────────────────────────────────────────

export async function fetchTrainerCodes(
  supabase: SupabaseClient,
  trainerId: string,
): Promise<TrainerCodeRow[]> {
  const { data: codes, error } = await supabase
    .from('access_codes')
    .select('*')
    .eq('trainer_id', trainerId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);

  const consumedByIds = Array.from(
    new Set(
      (codes ?? [])
        .map((c: { consumed_by: string | null }) => c.consumed_by)
        .filter((v: string | null): v is string => Boolean(v)),
    ),
  );

  const customerNames = new Map<string, string>();
  if (consumedByIds.length > 0) {
    const { data: customers, error: cErr } = await supabase
      .from('customers')
      .select('id, name')
      .in('id', consumedByIds);
    if (cErr) throw new Error(cErr.message);
    for (const c of (customers ?? []) as Array<{ id: string; name: string }>) {
      customerNames.set(c.id, c.name);
    }
  }

  return ((codes ?? []) as AccessCode[]).map((code) => ({
    ...code,
    consumedByName: code.consumed_by ? customerNames.get(code.consumed_by) ?? null : null,
    displayStatus: resolveCodeStatus(code),
  }));
}

export async function fetchTrainerClients(
  supabase: SupabaseClient,
  trainerId: string,
): Promise<TrainerClientRow[]> {
  const [{ data: customers, error: cErr }, { data: orders, error: oErr }] = await Promise.all([
    supabase
      .from('customers')
      .select('*')
      .eq('trainer_id', trainerId)
      .order('created_at', { ascending: false }),
    supabase.from('orders').select('customer_id').eq('trainer_id', trainerId),
  ]);
  if (cErr) throw new Error(cErr.message);
  if (oErr) throw new Error(oErr.message);

  const orderCounts = new Map<string, number>();
  for (const o of (orders ?? []) as Array<{ customer_id: string }>) {
    orderCounts.set(o.customer_id, (orderCounts.get(o.customer_id) ?? 0) + 1);
  }

  return ((customers ?? []) as Customer[]).map((c) => ({
    ...c,
    orderCount: orderCounts.get(c.id) ?? 0,
  }));
}

export async function fetchTrainerCommissions(
  supabase: SupabaseClient,
  trainerId: string,
): Promise<TrainerCommissionsPayload> {
  const { data: commissions, error } = await supabase
    .from('commissions')
    .select('*')
    .eq('trainer_id', trainerId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);

  const rows = (commissions ?? []) as Commission[];
  const orderIds = Array.from(new Set(rows.map((c) => c.order_id)));
  const orderMap = new Map<string, { customer_id: string; bigcommerce_order_id: string }>();
  const customerMap = new Map<string, string>();

  if (orderIds.length > 0) {
    const { data: orders, error: oErr } = await supabase
      .from('orders')
      .select('id, customer_id, bigcommerce_order_id')
      .in('id', orderIds);
    if (oErr) throw new Error(oErr.message);

    const orderRows = (orders ?? []) as Array<{
      id: string;
      customer_id: string;
      bigcommerce_order_id: string;
    }>;

    for (const o of orderRows) {
      orderMap.set(o.id, {
        customer_id: o.customer_id,
        bigcommerce_order_id: o.bigcommerce_order_id,
      });
    }

    const customerIds = Array.from(new Set(orderRows.map((o) => o.customer_id)));

    if (customerIds.length > 0) {
      const { data: customers, error: cErr } = await supabase
        .from('customers')
        .select('id, name')
        .in('id', customerIds);
      if (cErr) throw new Error(cErr.message);
      for (const c of (customers ?? []) as Array<{ id: string; name: string }>) {
        customerMap.set(c.id, c.name);
      }
    }
  }

  const summary = rows.reduce<TrainerCommissionSummary>(
    (totals, c) => {
      const amount = Number(c.amount);
      if (c.status === 'pending') totals.pending += amount;
      if (c.status === 'approved') totals.approved += amount;
      if (c.status === 'paid') totals.paid += amount;
      return totals;
    },
    { pending: 0, approved: 0, paid: 0 },
  );

  return {
    commissions: rows.map((c) => {
      const order = orderMap.get(c.order_id);
      return {
        ...c,
        customerName: order ? customerMap.get(order.customer_id) ?? 'Unknown customer' : 'Unknown customer',
        bigcommerceOrderId: order?.bigcommerce_order_id ?? c.order_id,
      };
    }),
    summary,
  };
}
