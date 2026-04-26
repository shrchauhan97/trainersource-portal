import { cache } from 'react';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import type { AccessCode, Admin, Commission, Order, Payout, Trainer, TrainerStatus } from '@/lib/types';

import {
  formatCurrency,
  type ActivityItem,
  type CodeRow,
  type CommissionRow,
  type DashboardData,
  type OrderRow,
  type PayoutRow,
  type TrainerDetailData,
  type TrainerRow,
} from '@/components/admin/shared';

export {
  adminNavigation,
  cn,
  codeStatusOptions,
  codeTypeOptions,
  commissionStatusOptions,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatPercent,
  getSearchValue,
  orderStatusOptions,
  payoutStatusOptions,
  trainerStatusOptions,
} from '@/components/admin/shared';

const getAdminSession = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user?.email) {
    redirect('/login');
  }

  const normalizedEmail = user.email.trim().toLowerCase();
  const { data: admin, error: adminError } = await supabase
    .from('admins')
    .select('id, email, name, role, created_at')
    .eq('email', normalizedEmail)
    .maybeSingle();

  if (adminError) {
    throw adminError;
  }

  if (!admin || (admin.role !== 'superadmin' && admin.role !== 'admin')) {
    redirect('/');
  }

  return {
    supabase,
    admin: admin as Admin,
  };
});

export async function getAdminPageContext() {
  return getAdminSession();
}

export async function getDashboardData(): Promise<DashboardData> {
  const { supabase, admin } = await getAdminSession();

  const [
    trainersResult,
    ordersResult,
    commissionsResult,
    payoutsResult,
  ] = await Promise.all([
    supabase
      .from('trainers')
      .select('id, name, status, created_at')
      .order('created_at', { ascending: false }),
    supabase
      .from('orders')
      .select('id, bigcommerce_order_id, total, placed_at, status')
      .order('placed_at', { ascending: false }),
    supabase
      .from('commissions')
      .select('id, amount, status, created_at, trainer_id')
      .order('created_at', { ascending: false }),
    supabase
      .from('payouts')
      .select('id, total, status, created_at, trainer_id')
      .order('created_at', { ascending: false }),
  ]);

  if (trainersResult.error) {
    throw trainersResult.error;
  }

  if (ordersResult.error) {
    throw ordersResult.error;
  }

  if (commissionsResult.error) {
    throw commissionsResult.error;
  }

  if (payoutsResult.error) {
    throw payoutsResult.error;
  }

  const trainers = (trainersResult.data ?? []) as Array<
    Pick<Trainer, 'id' | 'name' | 'status' | 'created_at'>
  >;
  const orders = (ordersResult.data ?? []) as Array<
    Pick<Order, 'id' | 'bigcommerce_order_id' | 'total' | 'placed_at' | 'status'>
  >;
  const commissions = (commissionsResult.data ?? []) as Array<
    Pick<Commission, 'id' | 'amount' | 'status' | 'created_at' | 'trainer_id'>
  >;
  const payouts = (payoutsResult.data ?? []) as Array<
    Pick<Payout, 'id' | 'total' | 'status' | 'created_at' | 'trainer_id'>
  >;

  const trainerNameById = new Map(trainers.map((trainer) => [trainer.id, trainer.name]));

  const trainerCounts: Record<TrainerStatus, number> = {
    applied: 0,
    onboarding: 0,
    active: 0,
    suspended: 0,
  };

  for (const trainer of trainers) {
    trainerCounts[trainer.status] += 1;
  }

  const totalRevenue = orders.reduce((sum, order) => sum + Number(order.total ?? 0), 0);
  const pendingCommissions = commissions
    .filter((commission) => commission.status === 'pending')
    .reduce((sum, commission) => sum + Number(commission.amount ?? 0), 0);

  const recentActivity = [
    ...trainers.slice(0, 6).map<ActivityItem>((trainer) => ({
      id: `trainer-${trainer.id}`,
      title: `${trainer.name} entered ${trainer.status}`,
      detail: 'Trainer profile updated in the partner pipeline.',
      occurredAt: trainer.created_at,
      tone: 'slate',
    })),
    ...orders.slice(0, 6).map<ActivityItem>((order) => ({
      id: `order-${order.id}`,
      title: `Order #${order.bigcommerce_order_id} is ${order.status}`,
      detail: `${formatCurrency(Number(order.total ?? 0))} recorded in platform revenue.`,
      occurredAt: order.placed_at,
      tone: 'orange',
    })),
    ...commissions.slice(0, 6).map<ActivityItem>((commission) => ({
      id: `commission-${commission.id}`,
      title: `Commission ${commission.status}`,
      detail: `${trainerNameById.get(commission.trainer_id) ?? 'Unknown trainer'} earned ${formatCurrency(Number(commission.amount ?? 0))}.`,
      occurredAt: commission.created_at,
      tone: commission.status === 'pending' ? 'orange' : 'slate',
    })),
    ...payouts.slice(0, 6).map<ActivityItem>((payout) => ({
      id: `payout-${payout.id}`,
      title: `Payout ${payout.status}`,
      detail: `${trainerNameById.get(payout.trainer_id) ?? 'Unknown trainer'} batch totals ${formatCurrency(Number(payout.total ?? 0))}.`,
      occurredAt: payout.created_at,
      tone: payout.status === 'confirmed' ? 'slate' : 'orange',
    })),
  ]
    .sort(
      (left, right) =>
        new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime(),
    )
    .slice(0, 10);

  return {
    admin,
    trainerCounts,
    totalOrders: orders.length,
    totalRevenue,
    pendingCommissions,
    recentActivity,
  };
}

export async function getTrainerDirectory(filters: {
  status?: string;
  country?: string;
}) {
  const { supabase, admin } = await getAdminSession();

  let trainerQuery = supabase
    .from('trainers')
    .select(
      'id, name, email, phone, country, city, niche, social_media, slug, tier, status, commission_rate, reorder_commission_rate, max_clients, wise_account, onboarding_completed_at, created_at',
    )
    .order('created_at', { ascending: false });

  if (filters.status) {
    trainerQuery = trainerQuery.eq('status', filters.status);
  }

  if (filters.country) {
    trainerQuery = trainerQuery.eq('country', filters.country);
  }

  const [trainersResult, allCountriesResult] = await Promise.all([
    trainerQuery,
    supabase.from('trainers').select('country').order('country'),
  ]);

  if (trainersResult.error) {
    throw trainersResult.error;
  }

  if (allCountriesResult.error) {
    throw allCountriesResult.error;
  }

  const trainers = (trainersResult.data ?? []) as Trainer[];
  const countries = Array.from(
    new Set((allCountriesResult.data ?? []).map((row) => String(row.country))),
  ).filter(Boolean);
  const trainerIds = trainers.map((trainer) => trainer.id);

  const [customersResult, commissionsResult] = trainerIds.length
    ? await Promise.all([
        supabase.from('customers').select('trainer_id').in('trainer_id', trainerIds),
        supabase
          .from('commissions')
          .select('trainer_id, amount')
          .in('trainer_id', trainerIds),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];

  if (customersResult.error) {
    throw customersResult.error;
  }

  if (commissionsResult.error) {
    throw commissionsResult.error;
  }

  const clientCountByTrainer = new Map<string, number>();

  for (const customer of customersResult.data ?? []) {
    const trainerId = String(customer.trainer_id ?? '');
    if (!trainerId) {
      continue;
    }

    clientCountByTrainer.set(trainerId, (clientCountByTrainer.get(trainerId) ?? 0) + 1);
  }

  const commissionByTrainer = new Map<string, number>();

  for (const commission of commissionsResult.data ?? []) {
    const trainerId = String(commission.trainer_id ?? '');
    if (!trainerId) {
      continue;
    }

    commissionByTrainer.set(
      trainerId,
      (commissionByTrainer.get(trainerId) ?? 0) + Number(commission.amount ?? 0),
    );
  }

  const rows: TrainerRow[] = trainers.map((trainer) => ({
    ...trainer,
    clientsCount: clientCountByTrainer.get(trainer.id) ?? 0,
    commissionEarned: commissionByTrainer.get(trainer.id) ?? 0,
  }));

  return {
    admin,
    rows,
    countries,
  };
}

export async function getTrainerDetail(trainerId: string): Promise<TrainerDetailData> {
  const { supabase, admin } = await getAdminSession();

  const { data: trainerData, error: trainerError } = await supabase
    .from('trainers')
    .select(
      'id, name, email, phone, country, city, niche, social_media, slug, tier, status, commission_rate, reorder_commission_rate, max_clients, wise_account, onboarding_completed_at, created_at',
    )
    .eq('id', trainerId)
    .maybeSingle();

  if (trainerError) {
    throw trainerError;
  }

  if (!trainerData) {
    redirect('/admin/trainers');
  }

  const trainer = trainerData as Trainer;

  const [customersResult, ordersResult, commissionsResult, codesResult, payoutsResult] =
    await Promise.all([
      supabase.from('customers').select('id').eq('trainer_id', trainerId),
      supabase
        .from('orders')
        .select(
          'id, bigcommerce_order_id, customer_id, trainer_id, total, status, payment_method, shipstation_id, country, city, placed_at, updated_at',
        )
        .eq('trainer_id', trainerId)
        .order('placed_at', { ascending: false })
        .limit(6),
      supabase
        .from('commissions')
        .select(
          'id, trainer_id, order_id, payout_id, commission_type, rate_snapshot, amount, status, created_at',
        )
        .eq('trainer_id', trainerId)
        .order('created_at', { ascending: false })
        .limit(6),
      supabase
        .from('access_codes')
        .select(
          'id, code, type, trainer_id, status, created_at, expires_at, consumed_by, consumed_at',
        )
        .eq('trainer_id', trainerId)
        .order('created_at', { ascending: false })
        .limit(6),
      supabase
        .from('payouts')
        .select(
          'id, trainer_id, total, wise_transfer_id, status, period_start, period_end, created_at',
        )
        .eq('trainer_id', trainerId)
        .order('created_at', { ascending: false })
        .limit(6),
    ]);

  if (customersResult.error) {
    throw customersResult.error;
  }

  if (ordersResult.error) {
    throw ordersResult.error;
  }

  if (commissionsResult.error) {
    throw commissionsResult.error;
  }

  if (codesResult.error) {
    throw codesResult.error;
  }

  if (payoutsResult.error) {
    throw payoutsResult.error;
  }

  const orders = (ordersResult.data ?? []) as Order[];
  const commissions = (commissionsResult.data ?? []) as Commission[];
  const codes = (codesResult.data ?? []) as AccessCode[];
  const payouts = (payoutsResult.data ?? []) as Payout[];
  const customerIds = orders.map((order) => order.customer_id);
  const orderIds = orders.map((order) => order.id);

  const [customerResult, referencedOrdersResult] = await Promise.all([
    customerIds.length
      ? supabase.from('customers').select('id, name, email').in('id', customerIds)
      : Promise.resolve({ data: [], error: null }),
    commissions.length && !orderIds.length
      ? supabase
          .from('orders')
          .select('id, bigcommerce_order_id')
          .in(
            'id',
            commissions.map((commission) => commission.order_id),
          )
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (customerResult.error) {
    throw customerResult.error;
  }

  if (referencedOrdersResult.error) {
    throw referencedOrdersResult.error;
  }

  const customerById = new Map(
    (customerResult.data ?? []).map((customer) => [String(customer.id), customer]),
  );
  const orderReferenceById = new Map<string, string>();

  for (const order of orders) {
    orderReferenceById.set(order.id, order.bigcommerce_order_id);
  }

  for (const order of referencedOrdersResult.data ?? []) {
    orderReferenceById.set(String(order.id), String(order.bigcommerce_order_id));
  }

  const recentOrders: OrderRow[] = orders.map((order) => {
    const customer = customerById.get(order.customer_id);

    return {
      ...order,
      customerName: String(customer?.name ?? 'Unknown customer'),
      customerEmail: String(customer?.email ?? 'Unknown email'),
      trainerName: trainer.name,
    };
  });

  const recentCommissions: CommissionRow[] = commissions.map((commission) => ({
    ...commission,
    trainerName: trainer.name,
    orderReference: orderReferenceById.get(commission.order_id) ?? commission.order_id,
  }));

  const recentCodes: CodeRow[] = codes.map((code) => ({
    ...code,
    trainerName: trainer.name,
  }));

  const recentPayouts: PayoutRow[] = payouts.map((payout) => ({
    ...payout,
    trainerName: trainer.name,
  }));

  const [customerCountResult, commissionTotalResult, orderCountResult, activeCodesResult] =
    await Promise.all([
      supabase.from('customers').select('id', { count: 'exact', head: true }).eq('trainer_id', trainerId),
      supabase.from('commissions').select('amount').eq('trainer_id', trainerId),
      supabase.from('orders').select('id', { count: 'exact', head: true }).eq('trainer_id', trainerId),
      supabase
        .from('access_codes')
        .select('id', { count: 'exact', head: true })
        .eq('trainer_id', trainerId)
        .eq('status', 'active'),
    ]);

  if (customerCountResult.error) {
    throw customerCountResult.error;
  }

  if (commissionTotalResult.error) {
    throw commissionTotalResult.error;
  }

  if (orderCountResult.error) {
    throw orderCountResult.error;
  }

  if (activeCodesResult.error) {
    throw activeCodesResult.error;
  }

  const totalCommissionEarned = (commissionTotalResult.data ?? []).reduce(
    (sum, commission) => sum + Number(commission.amount ?? 0),
    0,
  );

  const relatedRecordCount =
    Number(customerCountResult.count ?? 0) +
    Number(orderCountResult.count ?? 0) +
    commissions.length +
    payouts.length;

  return {
    admin,
    trainer,
    clientsCount: Number(customerCountResult.count ?? 0),
    totalCommissionEarned,
    totalOrders: Number(orderCountResult.count ?? 0),
    activeCodes: Number(activeCodesResult.count ?? 0),
    canDelete: relatedRecordCount === 0,
    recentOrders,
    recentCommissions,
    recentCodes,
    recentPayouts,
  };
}

export async function getOrdersDirectory(filters: {
  status?: string;
  country?: string;
  trainerId?: string;
  startDate?: string;
  endDate?: string;
}) {
  const { supabase, admin } = await getAdminSession();

  let ordersQuery = supabase
    .from('orders')
    .select(
      'id, bigcommerce_order_id, customer_id, trainer_id, total, status, payment_method, shipstation_id, country, city, placed_at, updated_at',
    )
    .order('placed_at', { ascending: false });

  if (filters.status) {
    ordersQuery = ordersQuery.eq('status', filters.status);
  }

  if (filters.country) {
    ordersQuery = ordersQuery.eq('country', filters.country);
  }

  if (filters.trainerId) {
    ordersQuery = ordersQuery.eq('trainer_id', filters.trainerId);
  }

  if (filters.startDate) {
    ordersQuery = ordersQuery.gte('placed_at', `${filters.startDate}T00:00:00.000Z`);
  }

  if (filters.endDate) {
    ordersQuery = ordersQuery.lte('placed_at', `${filters.endDate}T23:59:59.999Z`);
  }

  const [ordersResult, trainersResult, countriesResult] = await Promise.all([
    ordersQuery,
    supabase
      .from('trainers')
      .select('id, name')
      .order('name'),
    supabase.from('orders').select('country').order('country'),
  ]);

  if (ordersResult.error) {
    throw ordersResult.error;
  }

  if (trainersResult.error) {
    throw trainersResult.error;
  }

  if (countriesResult.error) {
    throw countriesResult.error;
  }

  const orders = (ordersResult.data ?? []) as Order[];
  const trainers = (trainersResult.data ?? []) as Array<Pick<Trainer, 'id' | 'name'>>;
  const countries = Array.from(
    new Set((countriesResult.data ?? []).map((row) => String(row.country ?? ''))),
  ).filter(Boolean);

  const customerIds = orders.map((order) => order.customer_id);
  const trainerNameById = new Map(trainers.map((trainer) => [trainer.id, trainer.name]));

  const customersResult = customerIds.length
    ? await supabase.from('customers').select('id, name, email').in('id', customerIds)
    : { data: [], error: null };

  if (customersResult.error) {
    throw customersResult.error;
  }

  const customerById = new Map(
    (customersResult.data ?? []).map((customer) => [String(customer.id), customer]),
  );

  const rows: OrderRow[] = orders.map((order) => {
    const customer = customerById.get(order.customer_id);

    return {
      ...order,
      customerName: String(customer?.name ?? 'Unknown customer'),
      customerEmail: String(customer?.email ?? 'Unknown email'),
      trainerName: order.trainer_id ? trainerNameById.get(order.trainer_id) ?? 'Unknown trainer' : null,
    };
  });

  return {
    admin,
    rows,
    countries,
    trainers,
  };
}

export async function getCommissionDirectory(filters: {
  status?: string;
}) {
  const { supabase, admin } = await getAdminSession();

  let commissionsQuery = supabase
    .from('commissions')
    .select('id, trainer_id, order_id, payout_id, commission_type, rate_snapshot, amount, status, created_at')
    .order('created_at', { ascending: false });

  if (filters.status) {
    commissionsQuery = commissionsQuery.eq('status', filters.status);
  }

  const commissionsResult = await commissionsQuery;

  if (commissionsResult.error) {
    throw commissionsResult.error;
  }

  const commissions = (commissionsResult.data ?? []) as Commission[];
  const trainerIds = Array.from(new Set(commissions.map((commission) => commission.trainer_id)));
  const orderIds = Array.from(new Set(commissions.map((commission) => commission.order_id)));

  const [trainersResult, ordersResult] = await Promise.all([
    trainerIds.length
      ? supabase.from('trainers').select('id, name').in('id', trainerIds)
      : Promise.resolve({ data: [], error: null }),
    orderIds.length
      ? supabase.from('orders').select('id, bigcommerce_order_id').in('id', orderIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (trainersResult.error) {
    throw trainersResult.error;
  }

  if (ordersResult.error) {
    throw ordersResult.error;
  }

  const trainerNameById = new Map(
    (trainersResult.data ?? []).map((trainer) => [String(trainer.id), String(trainer.name)]),
  );
  const orderReferenceById = new Map(
    (ordersResult.data ?? []).map((order) => [String(order.id), String(order.bigcommerce_order_id)]),
  );

  const rows: CommissionRow[] = commissions.map((commission) => ({
    ...commission,
    trainerName: trainerNameById.get(commission.trainer_id) ?? 'Unknown trainer',
    orderReference: orderReferenceById.get(commission.order_id) ?? commission.order_id,
  }));

  return {
    admin,
    rows,
  };
}

export async function getPayoutDirectory() {
  const { supabase, admin } = await getAdminSession();

  const [payoutsResult, trainersResult, approvedCommissionsResult] = await Promise.all([
    supabase
      .from('payouts')
      .select('id, trainer_id, total, wise_transfer_id, status, period_start, period_end, created_at')
      .order('created_at', { ascending: false }),
    supabase.from('trainers').select('id, name').order('name'),
    supabase
      .from('commissions')
      .select('id, trainer_id, amount, created_at')
      .eq('status', 'approved')
      .is('payout_id', null)
      .order('created_at', { ascending: true }),
  ]);

  if (payoutsResult.error) {
    throw payoutsResult.error;
  }

  if (trainersResult.error) {
    throw trainersResult.error;
  }

  if (approvedCommissionsResult.error) {
    throw approvedCommissionsResult.error;
  }

  const trainers = (trainersResult.data ?? []) as Array<Pick<Trainer, 'id' | 'name'>>;
  const trainerNameById = new Map(trainers.map((trainer) => [trainer.id, trainer.name]));
  const rows: PayoutRow[] = ((payoutsResult.data ?? []) as Payout[]).map((payout) => ({
    ...payout,
    trainerName: trainerNameById.get(payout.trainer_id) ?? 'Unknown trainer',
  }));
  const approvedCommissions = (approvedCommissionsResult.data ?? []) as Array<
    Pick<Commission, 'id' | 'trainer_id' | 'amount' | 'created_at'>
  >;

  const payoutPreviewByTrainer = new Map<
    string,
    { trainerName: string; total: number; commissionCount: number; firstDate: string; lastDate: string }
  >();

  for (const commission of approvedCommissions) {
    const existing = payoutPreviewByTrainer.get(commission.trainer_id);

    if (!existing) {
      payoutPreviewByTrainer.set(commission.trainer_id, {
        trainerName: trainerNameById.get(commission.trainer_id) ?? 'Unknown trainer',
        total: Number(commission.amount ?? 0),
        commissionCount: 1,
        firstDate: commission.created_at,
        lastDate: commission.created_at,
      });
      continue;
    }

    existing.total += Number(commission.amount ?? 0);
    existing.commissionCount += 1;
    if (new Date(commission.created_at).getTime() < new Date(existing.firstDate).getTime()) {
      existing.firstDate = commission.created_at;
    }
    if (new Date(commission.created_at).getTime() > new Date(existing.lastDate).getTime()) {
      existing.lastDate = commission.created_at;
    }
  }

  return {
    admin,
    rows,
    payoutPreview: Array.from(payoutPreviewByTrainer.values()),
  };
}

export async function getCodesDirectory(filters: {
  status?: string;
  type?: string;
}) {
  const { supabase, admin } = await getAdminSession();

  let codesQuery = supabase
    .from('access_codes')
    .select('id, code, type, trainer_id, status, created_at, expires_at, consumed_by, consumed_at')
    .order('created_at', { ascending: false });

  if (filters.status) {
    codesQuery = codesQuery.eq('status', filters.status);
  }

  if (filters.type) {
    codesQuery = codesQuery.eq('type', filters.type);
  }

  const [codesResult, trainersResult] = await Promise.all([
    codesQuery,
    supabase.from('trainers').select('id, name').order('name'),
  ]);

  if (codesResult.error) {
    throw codesResult.error;
  }

  if (trainersResult.error) {
    throw trainersResult.error;
  }

  const trainerNameById = new Map(
    ((trainersResult.data ?? []) as Array<Pick<Trainer, 'id' | 'name'>>).map((trainer) => [
      trainer.id,
      trainer.name,
    ]),
  );

  const rows: CodeRow[] = ((codesResult.data ?? []) as AccessCode[]).map((code) => ({
    ...code,
    trainerName: code.trainer_id ? trainerNameById.get(code.trainer_id) ?? 'Unknown trainer' : null,
  }));

  return {
    admin,
    rows,
  };
}

export interface CustomerListRow {
  id: string;
  name: string;
  email: string;
  status: 'active' | 'suspended' | 'removed';
  trainer_name: string | null;
  created_at: string;
}

export async function getCustomersList(): Promise<CustomerListRow[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('customers')
    .select('id, name, email, status, created_at, trainers(name)')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: any) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    status: r.status ?? 'active',
    trainer_name: r.trainers?.name ?? null,
    created_at: r.created_at,
  }));
}

export interface CustomerDetail {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  country: string;
  city: string;
  status: 'active' | 'suspended' | 'removed';
  bigcommerce_customer_id: string | null;
  access_code_id: string | null;
  trainer: { id: string; name: string } | null;
  access_code: { code: string; status: string } | null;
  created_at: string;
}

export async function getCustomerDetail(customerId: string): Promise<{
  customer: CustomerDetail;
  events: Array<{
    id: string;
    from_status: string | null;
    to_status: string;
    reason_category: string;
    reason_note: string | null;
    created_at: string;
    actor_name: string;
  }>;
}> {
  const supabase = createServiceClient();

  const { data: customer, error } = await supabase
    .from('customers')
    .select(`
      id, name, email, phone, country, city, status,
      bigcommerce_customer_id, access_code_id, created_at,
      trainers:trainer_id (id, name),
      access_codes:access_code_id (code, status)
    `)
    .eq('id', customerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!customer) throw new Error('customer-not-found');

  const { data: events, error: evErr } = await supabase
    .from('lifecycle_events')
    .select('id, from_status, to_status, reason_category, reason_note, created_at, admins(name)')
    .eq('entity_type', 'customer')
    .eq('entity_id', customerId)
    .order('created_at', { ascending: false });
  if (evErr) throw new Error(evErr.message);

  const c: any = customer;
  return {
    customer: {
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      country: c.country,
      city: c.city,
      status: (c.status ?? 'active') as CustomerDetail['status'],
      bigcommerce_customer_id: c.bigcommerce_customer_id,
      access_code_id: c.access_code_id,
      trainer: c.trainers ? { id: c.trainers.id, name: c.trainers.name } : null,
      access_code: c.access_codes ? { code: c.access_codes.code, status: c.access_codes.status } : null,
      created_at: c.created_at,
    },
    events: (events ?? []).map((e: any) => ({
      id: e.id,
      from_status: e.from_status,
      to_status: e.to_status,
      reason_category: e.reason_category,
      reason_note: e.reason_note,
      created_at: e.created_at,
      actor_name: e.admins?.name ?? 'unknown',
    })),
  };
}

export async function getTrainerLifecycleEvents(trainerId: string) {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('lifecycle_events')
    .select('id, from_status, to_status, reason_category, reason_note, created_at, admins(name)')
    .eq('entity_type', 'trainer')
    .eq('entity_id', trainerId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((e: any) => ({
    id: e.id,
    from_status: e.from_status as string | null,
    to_status: e.to_status as string,
    reason_category: e.reason_category as string,
    reason_note: e.reason_note as string | null,
    created_at: e.created_at as string,
    actor_name: (e.admins?.name as string | undefined) ?? 'unknown',
  }));
}

export async function getRecentLifecycleEvents(limit = 200) {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('lifecycle_events')
    .select('id, entity_type, entity_id, from_status, to_status, reason_category, reason_note, created_at, admins(name, email)')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((e: any) => ({
    id: e.id as string,
    entity_type: e.entity_type as 'customer' | 'trainer' | 'access_code',
    entity_id: e.entity_id as string,
    from_status: e.from_status as string | null,
    to_status: e.to_status as string,
    reason_category: e.reason_category as string,
    reason_note: e.reason_note as string | null,
    created_at: e.created_at as string,
    actor_name: (e.admins?.name as string | undefined) ?? 'unknown',
    actor_email: (e.admins?.email as string | undefined) ?? '',
  }));
}
