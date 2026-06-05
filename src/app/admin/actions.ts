'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { getCurrentAdminEmail, normalizeSessionEmail } from '@/lib/auth';
import { deleteBcCustomer } from '@/lib/bc-rest-client';
import {
  isRemovableReason,
  requireSuperadmin,
  writeLifecycleEvent,
  type ReasonCategory,
} from '@/lib/lifecycle';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import type { PayoutStatus, TrainerStatus } from '@/lib/types';

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

function asString(value: FormDataEntryValue | null) {
  return typeof value === 'string' ? value.trim() : '';
}

function asNullableString(value: FormDataEntryValue | null) {
  const parsed = asString(value);
  return parsed ? parsed : null;
}

function asNumber(value: FormDataEntryValue | null, fallback: number) {
  const parsed = Number(asString(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  const email = normalizeSessionEmail(user?.email);
  if (userError || !email) {
    redirect('/login');
  }

  const { data: admin, error: adminError } = await supabase
    .from('admins')
    .select('id, role')
    .eq('email', email)
    .maybeSingle();

  if (adminError) {
    throw adminError;
  }

  if (!admin || (admin.role !== 'superadmin' && admin.role !== 'admin')) {
    redirect('/');
  }

  return supabase;
}

async function ensureUniqueSlug(
  supabase: SupabaseClient,
  seed: string,
  excludeTrainerId?: string,
) {
  const baseSlug = (seed || 'trainer')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'trainer';

  let slug = baseSlug;
  let counter = 1;

  while (true) {
    let slugQuery = supabase.from('trainers').select('id').eq('slug', slug);

    if (excludeTrainerId) {
      slugQuery = slugQuery.neq('id', excludeTrainerId);
    }

    const { data, error } = await slugQuery.maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return slug;
    }

    slug = `${baseSlug}-${counter}`;
    counter += 1;
  }
}

async function suspendTrainerCodes(supabase: SupabaseClient, trainerId: string) {
  const { error } = await supabase
    .from('access_codes')
    .update({ status: 'expired' })
    .eq('trainer_id', trainerId)
    .eq('status', 'active');

  if (error) {
    throw error;
  }
}

function revalidateAdminPages(pathname?: string) {
  revalidatePath('/admin');
  revalidatePath('/admin/trainers');
  revalidatePath('/admin/orders');
  revalidatePath('/admin/commissions');
  revalidatePath('/admin/payouts');
  revalidatePath('/admin/codes');

  if (pathname) {
    revalidatePath(pathname);
  }
}

export async function createTrainer(formData: FormData): Promise<void> {
  const supabase = await requireAdmin();

  const name = asString(formData.get('name'));
  const email = asString(formData.get('email')).toLowerCase();
  const country = asString(formData.get('country'));
  const city = asString(formData.get('city'));

  if (!name || !email || !country || !city) {
    throw new Error('Name, email, country, and city are required.');
  }

  const requestedStatus = asString(formData.get('status')) as TrainerStatus;
  const status: TrainerStatus =
    requestedStatus === 'onboarding' || requestedStatus === 'active' || requestedStatus === 'suspended'
      ? requestedStatus
      : 'applied';

  const slugSeed = asString(formData.get('slug')) || name;
  const slug = await ensureUniqueSlug(supabase, slugSeed);
  const onboardingCompletedAt = status === 'active' ? new Date().toISOString() : null;

  const { error } = await supabase.from('trainers').insert({
    name,
    email,
    phone: asNullableString(formData.get('phone')),
    country,
    city,
    niche: asNullableString(formData.get('niche')),
    social_media: asNullableString(formData.get('social_media')),
    slug,
    tier: asString(formData.get('tier')) || 'trainer',
    status,
    commission_rate: asNumber(formData.get('commission_rate'), 0.2),
    reorder_commission_rate: asNumber(formData.get('reorder_commission_rate'), 0.1),
    max_clients: asNumber(formData.get('max_clients'), 100),
    wise_account: asNullableString(formData.get('wise_account')),
    onboarding_completed_at: onboardingCompletedAt,
  });

  if (error) {
    throw error;
  }

  revalidateAdminPages();
}

export async function updateTrainer(formData: FormData): Promise<void> {
  const supabase = await requireAdmin();

  const trainerId = asString(formData.get('trainerId'));

  if (!trainerId) {
    throw new Error('Trainer id is required.');
  }

  const { data: existingTrainer, error: existingTrainerError } = await supabase
    .from('trainers')
    .select('id, name, status, onboarding_completed_at')
    .eq('id', trainerId)
    .maybeSingle();

  if (existingTrainerError) {
    throw existingTrainerError;
  }

  if (!existingTrainer) {
    throw new Error('Trainer not found.');
  }

  const name = asString(formData.get('name'));
  const email = asString(formData.get('email')).toLowerCase();
  const country = asString(formData.get('country'));
  const city = asString(formData.get('city'));

  if (!name || !email || !country || !city) {
    throw new Error('Name, email, country, and city are required.');
  }

  const requestedStatus = asString(formData.get('status')) as TrainerStatus;
  const status: TrainerStatus =
    requestedStatus === 'applied' ||
    requestedStatus === 'onboarding' ||
    requestedStatus === 'active' ||
    requestedStatus === 'suspended'
      ? requestedStatus
      : existingTrainer.status;

  const slugSeed = asString(formData.get('slug')) || name;
  const slug = await ensureUniqueSlug(supabase, slugSeed, trainerId);
  const onboardingCompletedAt =
    status === 'active'
      ? existingTrainer.onboarding_completed_at ?? new Date().toISOString()
      : existingTrainer.onboarding_completed_at;

  const { error } = await supabase
    .from('trainers')
    .update({
      name,
      email,
      phone: asNullableString(formData.get('phone')),
      country,
      city,
      niche: asNullableString(formData.get('niche')),
      social_media: asNullableString(formData.get('social_media')),
      slug,
      tier: asString(formData.get('tier')) || 'trainer',
      status,
      commission_rate: asNumber(formData.get('commission_rate'), 0.2),
      reorder_commission_rate: asNumber(formData.get('reorder_commission_rate'), 0.1),
      max_clients: asNumber(formData.get('max_clients'), 100),
      wise_account: asNullableString(formData.get('wise_account')),
      onboarding_completed_at: onboardingCompletedAt,
    })
    .eq('id', trainerId);

  if (error) {
    throw error;
  }

  if (status === 'suspended') {
    await suspendTrainerCodes(supabase, trainerId);
  }

  revalidateAdminPages(`/admin/trainers/${trainerId}`);
}

export async function changeTrainerStatus(formData: FormData): Promise<void> {
  const supabase = await requireAdmin();

  const trainerId = asString(formData.get('trainerId'));
  const status = asString(formData.get('status')) as TrainerStatus;

  if (!trainerId || !status) {
    throw new Error('Trainer id and status are required.');
  }

  const updates: {
    status: TrainerStatus;
    onboarding_completed_at?: string | null;
  } = { status };

  if (status === 'active') {
    updates.onboarding_completed_at = new Date().toISOString();
  }

  const { error } = await supabase.from('trainers').update(updates).eq('id', trainerId);

  if (error) {
    throw error;
  }

  if (status === 'suspended') {
    await suspendTrainerCodes(supabase, trainerId);
  }

  revalidateAdminPages(`/admin/trainers/${trainerId}`);
}

export async function approveSelectedCommissions(formData: FormData): Promise<void> {
  const supabase = await requireAdmin();

  const commissionIds = formData
    .getAll('commissionIds')
    .map((value) => (typeof value === 'string' ? value : ''))
    .filter(Boolean);

  if (!commissionIds.length) {
    throw new Error('Select at least one pending commission.');
  }

  const { error } = await supabase
    .from('commissions')
    .update({ status: 'approved' })
    .in('id', commissionIds)
    .eq('status', 'pending');

  if (error) {
    throw error;
  }

  revalidateAdminPages();
}

export async function createPayoutBatch(formData: FormData): Promise<void> {
  const supabase = await requireAdmin();

  const requestedPeriodStart = asString(formData.get('period_start'));
  const requestedPeriodEnd = asString(formData.get('period_end'));

  const { data: approvedCommissions, error: approvedCommissionsError } = await supabase
    .from('commissions')
    .select('id, trainer_id, amount, created_at')
    .eq('status', 'approved')
    .is('payout_id', null)
    .order('created_at', { ascending: true });

  if (approvedCommissionsError) {
    throw approvedCommissionsError;
  }

  if (!approvedCommissions?.length) {
    throw new Error('No approved commissions are waiting for a payout batch.');
  }

  const grouped = new Map<string, Array<{ id: string; amount: number; created_at: string }>>();

  for (const commission of approvedCommissions) {
    const trainerId = String(commission.trainer_id);
    const existing = grouped.get(trainerId) ?? [];
    existing.push({
      id: String(commission.id),
      amount: Number(commission.amount ?? 0),
      created_at: String(commission.created_at),
    });
    grouped.set(trainerId, existing);
  }

  for (const [trainerId, commissions] of grouped.entries()) {
    const periodStart = requestedPeriodStart || commissions[0]?.created_at.slice(0, 10) || new Date().toISOString().slice(0, 10);
    const periodEnd =
      requestedPeriodEnd ||
      commissions[commissions.length - 1]?.created_at.slice(0, 10) ||
      new Date().toISOString().slice(0, 10);

    const total = commissions.reduce((sum, commission) => sum + commission.amount, 0);
    const { data: payout, error: payoutError } = await supabase
      .from('payouts')
      .insert({
        trainer_id: trainerId,
        total,
        status: 'pending',
        wise_transfer_id: null,
        period_start: periodStart,
        period_end: periodEnd,
      })
      .select('id')
      .single();

    if (payoutError || !payout) {
      throw payoutError ?? new Error('Unable to create payout.');
    }

    const { error: updateCommissionsError } = await supabase
      .from('commissions')
      .update({ payout_id: payout.id })
      .in(
        'id',
        commissions.map((commission) => commission.id),
      );

    if (updateCommissionsError) {
      throw updateCommissionsError;
    }
  }

  revalidateAdminPages();
}

export async function updatePayoutStatus(formData: FormData): Promise<void> {
  const supabase = await requireAdmin();

  const payoutId = asString(formData.get('payoutId'));
  const nextStatus = asString(formData.get('status')) as PayoutStatus;
  const wiseTransferId = asNullableString(formData.get('wise_transfer_id'));

  if (!payoutId || !nextStatus) {
    throw new Error('Payout id and next status are required.');
  }

  const { data: existingPayout, error: existingPayoutError } = await supabase
    .from('payouts')
    .select('id, status, wise_transfer_id')
    .eq('id', payoutId)
    .maybeSingle();

  if (existingPayoutError) {
    throw existingPayoutError;
  }

  if (!existingPayout) {
    throw new Error('Payout not found.');
  }

  const isValidTransition =
    (existingPayout.status === 'pending' && nextStatus === 'sent') ||
    (existingPayout.status === 'sent' && nextStatus === 'confirmed');

  if (!isValidTransition) {
    throw new Error('Invalid payout status transition.');
  }

  const updates: { status: PayoutStatus; wise_transfer_id?: string | null } = {
    status: nextStatus,
  };

  if (nextStatus === 'sent') {
    updates.wise_transfer_id = wiseTransferId;
  }

  const { error } = await supabase.from('payouts').update(updates).eq('id', payoutId);

  if (error) {
    throw error;
  }

  if (nextStatus === 'confirmed') {
    const { error: commissionUpdateError } = await supabase
      .from('commissions')
      .update({ status: 'paid' })
      .eq('payout_id', payoutId)
      .eq('status', 'approved');

    if (commissionUpdateError) {
      throw commissionUpdateError;
    }
  }

  revalidateAdminPages();
}

async function generateUniqueAccessCode(supabase: SupabaseClient, prefix: string) {
  while (true) {
    const value = `${prefix}-${crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`;
    const { data, error } = await supabase
      .from('access_codes')
      .select('id')
      .eq('code', value)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return value;
    }
  }
}

export async function generateCodes(formData: FormData): Promise<void> {
  const supabase = await requireAdmin();

  const type = asString(formData.get('type'));
  const quantity = Math.max(1, Math.min(25, asNumber(formData.get('quantity'), 1)));
  const expiresInDays = Math.max(1, Math.min(30, asNumber(formData.get('expires_in_days'), 7)));

  if (type !== 'founder' && type !== 'organic') {
    throw new Error('Only founder and organic codes can be created here.');
  }

  const prefix = type === 'founder' ? 'FDR' : 'ORG';
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();
  const records = [] as Array<{
    code: string;
    type: 'founder' | 'organic';
    trainer_id: null;
    status: 'active';
    expires_at: string;
  }>;

  for (let index = 0; index < quantity; index += 1) {
    const code = await generateUniqueAccessCode(supabase, prefix);
    records.push({
      code,
      type,
      trainer_id: null,
      status: 'active',
      expires_at: expiresAt,
    });
  }

  const { error } = await supabase.from('access_codes').insert(records);

  if (error) {
    throw error;
  }

  revalidateAdminPages();
}

function readReason(form: FormData): { category: ReasonCategory; note?: string } {
  const category = String(form.get('reasonCategory') ?? '');
  if (!isRemovableReason(category)) throw new Error('invalid-reason');
  const note = String(form.get('reasonNote') ?? '').trim() || undefined;
  return { category, note };
}

export async function suspendCustomer(form: FormData): Promise<void> {
  const email = await getCurrentAdminEmail();
  const supabase = createServiceClient();
  const admin = await requireSuperadmin(supabase, email);

  const customerId = String(form.get('customerId') ?? '');
  if (!customerId) throw new Error('customer-id-required');
  const { category, note } = readReason(form);

  const { data: before, error: readErr } = await supabase
    .from('customers')
    .select('id, status')
    .eq('id', customerId)
    .maybeSingle();
  if (readErr) throw new Error(`customer lookup failed: ${readErr.message}`);
  if (!before) throw new Error('customer-not-found');
  if (before.status === 'suspended') return; // idempotent

  const { error: updErr } = await supabase
    .from('customers')
    .update({ status: 'suspended' })
    .eq('id', customerId);
  if (updErr) throw new Error(`customer suspend failed: ${updErr.message}`);

  await writeLifecycleEvent(supabase, {
    entityType: 'customer',
    entityId: customerId,
    fromStatus: before.status,
    toStatus: 'suspended',
    actorAdminId: admin.id,
    reasonCategory: category,
    reasonNote: note,
  });

  revalidatePath(`/admin/customers/${customerId}`);
  revalidatePath('/admin/customers');
}

export async function removeCustomer(form: FormData): Promise<void> {
  const email = await getCurrentAdminEmail();
  const supabase = createServiceClient();
  const admin = await requireSuperadmin(supabase, email);

  const customerId = String(form.get('customerId') ?? '');
  if (!customerId) throw new Error('customer-id-required');
  const confirm = String(form.get('confirm') ?? '');
  if (confirm !== 'REMOVE') throw new Error('confirm-mismatch');
  const { category, note } = readReason(form);

  const { data: before } = await supabase
    .from('customers')
    .select('id, status, bigcommerce_customer_id, access_code_id')
    .eq('id', customerId)
    .maybeSingle();
  if (!before) throw new Error('customer-not-found');

  // Soft-delete — keep the row, flip status. Preserves FK integrity with orders.
  await supabase
    .from('customers')
    .update({ status: 'removed' })
    .eq('id', customerId);

  // Revoke their access code (if any)
  if (before.access_code_id) {
    await supabase
      .from('access_codes')
      .update({ status: 'revoked' })
      .eq('id', before.access_code_id);
  }

  // Cascade bot identity tables — keyed by bc_customer_id
  if (before.bigcommerce_customer_id) {
    const bcId = Number(before.bigcommerce_customer_id);
    if (!Number.isNaN(bcId)) {
      // Find linked telegram user ids so we can also wipe their acknowledgment
      const { data: links } = await supabase
        .from('bc_customer_links')
        .select('telegram_user_id')
        .eq('bc_customer_id', bcId);
      const tgIds = (links ?? []).map((l: { telegram_user_id: number }) => l.telegram_user_id);
      if (tgIds.length > 0) {
        await supabase.from('bot_user_acknowledgments').delete().in('telegram_user_id', tgIds);
      }
      await supabase.from('bc_customer_links').delete().eq('bc_customer_id', bcId);

      // Delete BC storefront customer account — last step so Supabase cleanup
      // is committed even if BC is down. Supabase is source of truth; the gate
      // enforces removed status regardless of whether the BC account is gone.
      try {
        const result = await deleteBcCustomer(bcId);
        if (!result.deleted && result.reason === 'has-orders') {
          console.warn(
            `[removeCustomer] BC customer ${bcId} has orders — storefront account retained, Supabase status=removed stops checkout access via the gate.`,
          );
        }
      } catch (err) {
        // Log but don't fail — Supabase is source of truth. Admin can retry BC delete manually from BC admin.
        console.error('[removeCustomer] BC delete failed, continuing:', err);
      }
    }
  }

  await writeLifecycleEvent(supabase, {
    entityType: 'customer',
    entityId: customerId,
    fromStatus: before.status,
    toStatus: 'removed',
    actorAdminId: admin.id,
    reasonCategory: category,
    reasonNote: note,
    metadata: { bc_customer_id: before.bigcommerce_customer_id },
  });

  revalidatePath(`/admin/customers/${customerId}`);
  revalidatePath('/admin/customers');
}

export async function suspendTrainer(form: FormData): Promise<void> {
  const email = await getCurrentAdminEmail();
  const supabase = createServiceClient();
  const admin = await requireSuperadmin(supabase, email);

  const trainerId = String(form.get('trainerId') ?? '');
  if (!trainerId) throw new Error('trainer-id-required');
  const { category, note } = readReason(form);

  const { data: before } = await supabase
    .from('trainers').select('id, status').eq('id', trainerId).maybeSingle();
  if (!before) throw new Error('trainer-not-found');
  if (before.status === 'suspended') return;

  await supabase.from('trainers').update({ status: 'suspended' }).eq('id', trainerId);

  await writeLifecycleEvent(supabase, {
    entityType: 'trainer',
    entityId: trainerId,
    fromStatus: before.status,
    toStatus: 'suspended',
    actorAdminId: admin.id,
    reasonCategory: category,
    reasonNote: note,
  });

  revalidatePath(`/admin/trainers/${trainerId}`);
  revalidatePath('/admin/trainers');
}

export async function removeTrainer(form: FormData): Promise<void> {
  const email = await getCurrentAdminEmail();
  const supabase = createServiceClient();
  const admin = await requireSuperadmin(supabase, email);

  const trainerId = String(form.get('trainerId') ?? '');
  if (!trainerId) throw new Error('trainer-id-required');
  const confirm = String(form.get('confirm') ?? '');
  if (confirm !== 'REMOVE') throw new Error('confirm-mismatch');
  const { category, note } = readReason(form);

  const { data: before } = await supabase
    .from('trainers').select('id, status').eq('id', trainerId).maybeSingle();
  if (!before) throw new Error('trainer-not-found');

  // Trainers stay in the DB (commissions/orders reference them) — flip to suspended.
  // Audit log records intent='removed' even though column stays 'suspended'; trainer_status enum
  // has no 'removed' value because existing commissions/orders need the FK intact.
  await supabase.from('trainers').update({ status: 'suspended' }).eq('id', trainerId);

  // Revoke any unconsumed access codes so no new clients can onboard under this trainer.
  await supabase
    .from('access_codes')
    .update({ status: 'revoked' })
    .eq('trainer_id', trainerId)
    .eq('status', 'active');

  await writeLifecycleEvent(supabase, {
    entityType: 'trainer',
    entityId: trainerId,
    fromStatus: before.status,
    toStatus: 'removed',
    actorAdminId: admin.id,
    reasonCategory: category,
    reasonNote: note,
  });

  revalidatePath(`/admin/trainers/${trainerId}`);
  revalidatePath('/admin/trainers');
}

export async function restoreCustomer(form: FormData): Promise<void> {
  const email = await getCurrentAdminEmail();
  const supabase = createServiceClient();
  const admin = await requireSuperadmin(supabase, email);

  const customerId = String(form.get('customerId') ?? '');
  if (!customerId) throw new Error('customer-id-required');
  const { category, note } = readReason(form);

  const { data: before } = await supabase
    .from('customers').select('id, status').eq('id', customerId).maybeSingle();
  if (!before) throw new Error('customer-not-found');
  if (before.status !== 'suspended') throw new Error('not-restorable');

  await supabase.from('customers').update({ status: 'active' }).eq('id', customerId);
  await writeLifecycleEvent(supabase, {
    entityType: 'customer', entityId: customerId,
    fromStatus: 'suspended', toStatus: 'active',
    actorAdminId: admin.id, reasonCategory: category, reasonNote: note,
  });
  revalidatePath(`/admin/customers/${customerId}`);
  revalidatePath('/admin/customers');
}

export async function restoreTrainer(form: FormData): Promise<void> {
  const email = await getCurrentAdminEmail();
  const supabase = createServiceClient();
  const admin = await requireSuperadmin(supabase, email);

  const trainerId = String(form.get('trainerId') ?? '');
  if (!trainerId) throw new Error('trainer-id-required');
  const { category, note } = readReason(form);

  const { data: before } = await supabase
    .from('trainers').select('id, status').eq('id', trainerId).maybeSingle();
  if (!before) throw new Error('trainer-not-found');
  if (before.status !== 'suspended') throw new Error('not-restorable');

  await supabase.from('trainers').update({ status: 'active' }).eq('id', trainerId);
  await writeLifecycleEvent(supabase, {
    entityType: 'trainer', entityId: trainerId,
    fromStatus: 'suspended', toStatus: 'active',
    actorAdminId: admin.id, reasonCategory: category, reasonNote: note,
  });
  revalidatePath(`/admin/trainers/${trainerId}`);
  revalidatePath('/admin/trainers');
}
