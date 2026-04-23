import { describe, it, expect, vi } from 'vitest';
import { reasonOptions, isRemovableReason } from '@/lib/lifecycle';

describe('lifecycle helpers', () => {
  it('exposes the six canonical reason categories', () => {
    expect(reasonOptions).toEqual([
      'abuse', 'fraud', 'compliance', 'churn', 'test-data', 'other',
    ]);
  });

  it('isRemovableReason accepts every canonical category', () => {
    for (const r of reasonOptions) expect(isRemovableReason(r)).toBe(true);
  });

  it('isRemovableReason rejects unknown values', () => {
    expect(isRemovableReason('whatever')).toBe(false);
    expect(isRemovableReason('')).toBe(false);
  });
});

import { writeLifecycleEvent, requireSuperadmin } from '@/lib/lifecycle';

describe('writeLifecycleEvent', () => {
  it('inserts a row with the supplied fields', async () => {
    const insert = vi.fn().mockResolvedValue({ data: null, error: null });
    const client = { from: vi.fn().mockReturnValue({ insert }) };
    await writeLifecycleEvent(client as never, {
      entityType: 'customer',
      entityId: 'cust-1',
      fromStatus: 'active',
      toStatus: 'suspended',
      actorAdminId: 'admin-1',
      reasonCategory: 'abuse',
      reasonNote: 'sock puppet',
    });
    expect(client.from).toHaveBeenCalledWith('lifecycle_events');
    expect(insert).toHaveBeenCalledWith({
      entity_type: 'customer',
      entity_id: 'cust-1',
      from_status: 'active',
      to_status: 'suspended',
      actor_admin_id: 'admin-1',
      reason_category: 'abuse',
      reason_note: 'sock puppet',
      metadata: {},
    });
  });

  it('throws if the insert fails', async () => {
    const insert = vi.fn().mockResolvedValue({ data: null, error: { message: 'x' } });
    const client = { from: vi.fn().mockReturnValue({ insert }) };
    await expect(writeLifecycleEvent(client as never, {
      entityType: 'trainer', entityId: 'a', fromStatus: null,
      toStatus: 'suspended', actorAdminId: 'b', reasonCategory: 'other',
    })).rejects.toThrow('lifecycle_events insert failed: x');
  });
});

describe('requireSuperadmin', () => {
  it('returns the admin row when role=superadmin', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { id: 'a', email: 'x@y', name: 'X', role: 'superadmin' }, error: null,
    });
    const client = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }) };
    const result = await requireSuperadmin(client as never, 'x@y');
    expect(result.id).toBe('a');
  });

  it('throws when admin missing', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const client = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }) };
    await expect(requireSuperadmin(client as never, 'x@y')).rejects.toThrow('not-an-admin');
  });

  it('throws when role is not superadmin', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { id: 'a', email: 'x@y', name: 'X', role: 'admin' }, error: null,
    });
    const client = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }) };
    await expect(requireSuperadmin(client as never, 'x@y')).rejects.toThrow('not-superadmin');
  });
});
