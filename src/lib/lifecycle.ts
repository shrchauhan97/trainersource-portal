export const reasonOptions = [
  'abuse', 'fraud', 'compliance', 'churn', 'test-data', 'other',
] as const;

export type ReasonCategory = (typeof reasonOptions)[number];

export function isRemovableReason(value: string): value is ReasonCategory {
  return (reasonOptions as readonly string[]).includes(value);
}

export type LifecycleEntity = 'customer' | 'trainer' | 'access_code';

export interface LifecycleEventInput {
  entityType: LifecycleEntity;
  entityId: string;
  fromStatus: string | null;
  toStatus: string;
  actorAdminId: string;
  reasonCategory: ReasonCategory;
  reasonNote?: string;
  metadata?: Record<string, unknown>;
}

import type { SupabaseClient } from '@supabase/supabase-js';

export async function writeLifecycleEvent(
  client: SupabaseClient,
  input: LifecycleEventInput,
): Promise<void> {
  const { error } = await client.from('lifecycle_events').insert({
    entity_type: input.entityType,
    entity_id: input.entityId,
    from_status: input.fromStatus,
    to_status: input.toStatus,
    actor_admin_id: input.actorAdminId,
    reason_category: input.reasonCategory,
    reason_note: input.reasonNote,
    metadata: input.metadata ?? {},
  });
  if (error) throw new Error(`lifecycle_events insert failed: ${error.message}`);
}

export interface AdminRow {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'superadmin';
}

export async function requireSuperadmin(
  client: SupabaseClient,
  email: string,
): Promise<AdminRow> {
  const { data, error } = await client
    .from('admins')
    .select('id, email, name, role')
    .eq('email', email.toLowerCase())
    .maybeSingle();
  if (error) throw new Error(`admin lookup failed: ${error.message}`);
  if (!data) throw new Error('not-an-admin');
  if (data.role !== 'superadmin') throw new Error('not-superadmin');
  return data as AdminRow;
}
