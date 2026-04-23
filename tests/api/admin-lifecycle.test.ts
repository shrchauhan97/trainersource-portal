import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the service-role client factory and auth helper BEFORE importing the action
const mockFrom = vi.fn();
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({ from: mockFrom }),
}));
vi.mock('@/lib/auth', () => ({
  getCurrentAdminEmail: vi.fn().mockResolvedValue('shrchauhan97@gmail.com'),
}));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import { suspendCustomer } from '@/app/admin/actions';
import { removeCustomer } from '@/app/admin/actions';

beforeEach(() => { vi.clearAllMocks(); });

describe('suspendCustomer', () => {
  it('refuses non-superadmins', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'admins') {
        return { select: () => ({ eq: () => ({ maybeSingle: () =>
          Promise.resolve({ data: { id: 'a1', email: 'x', name: 'X', role: 'admin' }, error: null })
        }) }) };
      }
      throw new Error('unexpected table: ' + table);
    });
    const form = new FormData();
    form.set('customerId', 'c1');
    form.set('reasonCategory', 'abuse');
    await expect(suspendCustomer(form)).rejects.toThrow('not-superadmin');
  });

  it('rejects unknown reason category', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'admins') {
        return { select: () => ({ eq: () => ({ maybeSingle: () =>
          Promise.resolve({ data: { id: 'a1', email: 'x', name: 'X', role: 'superadmin' }, error: null })
        }) }) };
      }
      throw new Error('unexpected table: ' + table);
    });
    const form = new FormData();
    form.set('customerId', 'c1');
    form.set('reasonCategory', 'nonsense');
    await expect(suspendCustomer(form)).rejects.toThrow('invalid-reason');
  });
});

describe('removeCustomer', () => {
  it('requires the confirm phrase', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'admins') {
        return { select: () => ({ eq: () => ({ maybeSingle: () =>
          Promise.resolve({ data: { id: 'a1', email: 'x', name: 'X', role: 'superadmin' }, error: null })
        }) }) };
      }
      throw new Error('unexpected table: ' + table);
    });
    const form = new FormData();
    form.set('customerId', 'c1');
    form.set('reasonCategory', 'abuse');
    form.set('confirm', 'DELETEE');
    await expect(removeCustomer(form)).rejects.toThrow('confirm-mismatch');
  });

  it('marks customer removed + revokes access code + cascades bot links', async () => {
    // Track every operation across tables. The chainable API (select/eq/in/update/delete/insert/maybeSingle)
    // is faked so we can assert on the set of calls the action makes.
    const calls: Array<{ table: string; op: string }> = [];
    mockFrom.mockImplementation((table: string) => {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        in: () => chain,
        update: () => { calls.push({ table, op: 'update' }); return chain; },
        delete: () => { calls.push({ table, op: 'delete' }); return chain; },
        insert: () => { calls.push({ table, op: 'insert' }); return Promise.resolve({ error: null }); },
        maybeSingle: () => {
          if (table === 'admins') {
            return Promise.resolve({
              data: { id: 'a1', email: 'x', name: 'X', role: 'superadmin' }, error: null,
            });
          }
          // customers lookup — has a bc_customer_id so the BC cascade branch runs
          return Promise.resolve({
            data: { id: 'c1', status: 'active', bigcommerce_customer_id: '99', access_code_id: 'ac1' },
            error: null,
          });
        },
      };
      return chain;
    });

    const form = new FormData();
    form.set('customerId', 'c1');
    form.set('reasonCategory', 'fraud');
    form.set('confirm', 'REMOVE');

    await removeCustomer(form);
    const tables = calls.map((c) => `${c.table}:${c.op}`);
    expect(tables).toContain('customers:update');
    expect(tables).toContain('access_codes:update');
    expect(tables).toContain('bc_customer_links:delete');
    expect(tables).toContain('lifecycle_events:insert');
  });
});
