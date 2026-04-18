'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { CODE_EXPIRY_DAYS, CODE_LENGTH } from '@/lib/constants';
import { createClient } from '@/lib/supabase/server';
import type { AccessCode, Commission, Customer, Trainer } from '@/lib/types';

export type GenerateCodeActionState = {
  success: boolean;
  message: string | null;
  code: string | null;
};

export type DashboardStats = {
  trainer: Trainer;
  totalClients: number;
  activeCodes: number;
  pendingCommission: number;
  totalEarned: number;
};

export type DashboardCodeRow = AccessCode & {
  consumedByName: string | null;
  displayStatus: 'active' | 'consumed' | 'expired';
};

export type DashboardClientRow = Customer & {
  orderCount: number;
};

export type DashboardCommissionRow = Commission & {
  customerName: string;
  bigcommerceOrderId: string;
};

export type DashboardCommissionSummary = {
  pending: number;
  approved: number;
  paid: number;
};

const initialGenerateCodeState: GenerateCodeActionState = {
  success: false,
  message: null,
  code: null,
};

function randomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));

  return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join('');
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function resolveCodeStatus(code: Pick<AccessCode, 'status' | 'expires_at'>): DashboardCodeRow['displayStatus'] {
  if (code.status === 'consumed') {
    return 'consumed';
  }

  if (new Date(code.expires_at).getTime() < Date.now()) {
    return 'expired';
  }

  return 'active';
}

async function getTrainerBySession() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    redirect('/login');
  }

  const { data: trainer, error } = await supabase
    .from('trainers')
    .select('*')
    .eq('email', user.email)
    .single();

  if (error || !trainer) {
    redirect('/apply');
  }

  return { supabase, trainer: trainer as Trainer };
}

export async function requireActiveTrainer() {
  const { supabase, trainer } = await getTrainerBySession();

  if (trainer.status !== 'active') {
    redirect('/onboarding');
  }

  return { supabase, trainer };
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}

export async function generateAccessCode(
  _previousState: GenerateCodeActionState = initialGenerateCodeState
) {
  const { supabase, trainer } = await requireActiveTrainer();
  let generatedCode = '';

  for (let attempt = 0; attempt < 10; attempt += 1) {
    generatedCode = randomCode();

    const { data: existingCode } = await supabase
      .from('access_codes')
      .select('id')
      .eq('code', generatedCode)
      .maybeSingle();

    if (!existingCode) {
      break;
    }
  }

  if (!generatedCode) {
    return {
      success: false,
      message: 'Unable to generate a unique code right now.',
      code: null,
    } satisfies GenerateCodeActionState;
  }

  const expiresAt = addDays(new Date(), CODE_EXPIRY_DAYS).toISOString();

  const { error } = await supabase.from('access_codes').insert({
    code: generatedCode,
    type: 'trainer',
    trainer_id: trainer.id,
    expires_at: expiresAt,
    status: 'active',
  });

  if (error) {
    return {
      success: false,
      message: error.message,
      code: null,
    } satisfies GenerateCodeActionState;
  }

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/codes');

  return {
    success: true,
    message: `Code ${generatedCode} is live for ${CODE_EXPIRY_DAYS} days.`,
    code: generatedCode,
  } satisfies GenerateCodeActionState;
}

export async function getTrainerStats(): Promise<DashboardStats> {
  const { supabase, trainer } = await requireActiveTrainer();
  const nowIso = new Date().toISOString();

  const [{ count: totalClients }, { count: activeCodesCount }, { data: commissions, error: commissionsError }] =
    await Promise.all([
      supabase
        .from('customers')
        .select('id', { count: 'exact', head: true })
        .eq('trainer_id', trainer.id),
      supabase
        .from('access_codes')
        .select('id', { count: 'exact', head: true })
        .eq('trainer_id', trainer.id)
        .eq('status', 'active')
        .gt('expires_at', nowIso),
      supabase.from('commissions').select('amount, status').eq('trainer_id', trainer.id),
    ]);

  if (commissionsError) {
    throw new Error(commissionsError.message);
  }

  const pendingCommission = (commissions ?? []).reduce((total, commission) => {
    return commission.status === 'pending' ? total + Number(commission.amount) : total;
  }, 0);

  const totalEarned = (commissions ?? []).reduce((total, commission) => {
    return total + Number(commission.amount);
  }, 0);

  return {
    trainer,
    totalClients: totalClients ?? 0,
    activeCodes: activeCodesCount ?? 0,
    pendingCommission,
    totalEarned,
  };
}

export async function getTrainerCodes(): Promise<DashboardCodeRow[]> {
  const { supabase, trainer } = await requireActiveTrainer();
  const { data: codes, error } = await supabase
    .from('access_codes')
    .select('*')
    .eq('trainer_id', trainer.id)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const consumedByIds = Array.from(
    new Set((codes ?? []).map((code) => code.consumed_by).filter((value): value is string => Boolean(value)))
  );

  const customerNames = new Map<string, string>();

  if (consumedByIds.length > 0) {
    const { data: customers, error: customersError } = await supabase
      .from('customers')
      .select('id, name')
      .in('id', consumedByIds);

    if (customersError) {
      throw new Error(customersError.message);
    }

    for (const customer of customers ?? []) {
      customerNames.set(customer.id, customer.name);
    }
  }

  return (codes ?? []).map((code) => ({
    ...(code as AccessCode),
    consumedByName: code.consumed_by ? customerNames.get(code.consumed_by) ?? null : null,
    displayStatus: resolveCodeStatus(code as AccessCode),
  }));
}

export async function getTrainerClients(): Promise<DashboardClientRow[]> {
  const { supabase, trainer } = await requireActiveTrainer();
  const [{ data: customers, error: customersError }, { data: orders, error: ordersError }] = await Promise.all([
    supabase.from('customers').select('*').eq('trainer_id', trainer.id).order('created_at', { ascending: false }),
    supabase.from('orders').select('customer_id').eq('trainer_id', trainer.id),
  ]);

  if (customersError) {
    throw new Error(customersError.message);
  }

  if (ordersError) {
    throw new Error(ordersError.message);
  }

  const orderCounts = new Map<string, number>();

  for (const order of orders ?? []) {
    orderCounts.set(order.customer_id, (orderCounts.get(order.customer_id) ?? 0) + 1);
  }

  return (customers ?? []).map((customer) => ({
    ...(customer as Customer),
    orderCount: orderCounts.get(customer.id) ?? 0,
  }));
}

export async function getTrainerCommissions(): Promise<{
  commissions: DashboardCommissionRow[];
  summary: DashboardCommissionSummary;
}> {
  const { supabase, trainer } = await requireActiveTrainer();
  const { data: commissions, error } = await supabase
    .from('commissions')
    .select('*')
    .eq('trainer_id', trainer.id)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const orderIds = Array.from(new Set((commissions ?? []).map((commission) => commission.order_id)));
  const orderMap = new Map<string, { customer_id: string; bigcommerce_order_id: string }>();
  const customerMap = new Map<string, string>();

  if (orderIds.length > 0) {
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('id, customer_id, bigcommerce_order_id')
      .in('id', orderIds);

    if (ordersError) {
      throw new Error(ordersError.message);
    }

    const customerIds = Array.from(new Set((orders ?? []).map((order) => order.customer_id)));

    for (const order of orders ?? []) {
      orderMap.set(order.id, {
        customer_id: order.customer_id,
        bigcommerce_order_id: order.bigcommerce_order_id,
      });
    }

    if (customerIds.length > 0) {
      const { data: customers, error: customersError } = await supabase
        .from('customers')
        .select('id, name')
        .in('id', customerIds);

      if (customersError) {
        throw new Error(customersError.message);
      }

      for (const customer of customers ?? []) {
        customerMap.set(customer.id, customer.name);
      }
    }
  }

  const summary = (commissions ?? []).reduce<DashboardCommissionSummary>(
    (totals, commission) => {
      const amount = Number(commission.amount);

      if (commission.status === 'pending') {
        totals.pending += amount;
      }

      if (commission.status === 'approved') {
        totals.approved += amount;
      }

      if (commission.status === 'paid') {
        totals.paid += amount;
      }

      return totals;
    },
    {
      pending: 0,
      approved: 0,
      paid: 0,
    }
  );

  return {
    commissions: (commissions ?? []).map((commission) => {
      const order = orderMap.get(commission.order_id);

      return {
        ...(commission as Commission),
        customerName: order ? customerMap.get(order.customer_id) ?? 'Unknown customer' : 'Unknown customer',
        bigcommerceOrderId: order?.bigcommerce_order_id ?? commission.order_id,
      };
    }),
    summary,
  };
}
