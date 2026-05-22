import { describe, it, expect, vi, beforeEach } from 'vitest';

// Loose Supabase query-builder mock shape. The actions under test exercise a
// handful of chained methods; modelling the full PostgrestFilterBuilder isn't
// worth it for these tests, so a deliberately-narrow recursive interface
// keeps the mocks readable without sprinkling `any`. All chain methods are
// optional so individual tests can stub only the surface their code path
// actually touches.
type MockResult = Promise<{ data?: unknown; error: { message: string } | null }>;
interface MockChain {
  select?: () => MockChain;
  eq?: () => MockChain;
  in?: () => MockChain;
  update?: () => MockChain;
  delete?: () => MockChain;
  insert?: (args?: unknown) => MockResult;
  maybeSingle?: () => MockResult;
  _last?: unknown;
}

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
vi.mock('@/lib/bc-rest-client', () => ({
  deleteBcCustomer: vi.fn().mockResolvedValue({ deleted: true }),
}));

import { suspendCustomer } from '@/app/admin/actions';
import { removeCustomer } from '@/app/admin/actions';
import { suspendTrainer, removeTrainer } from '@/app/admin/actions';
import { restoreCustomer, restoreTrainer } from '@/app/admin/actions';
import { deleteBcCustomer } from '@/lib/bc-rest-client';

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
      const chain: MockChain = {
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

describe('suspendTrainer', () => {
  it('sets trainers.status=suspended and logs event', async () => {
    const calls: Array<{ table: string; op: string }> = [];
    mockFrom.mockImplementation((table: string) => {
      const chain: MockChain = {
        select: () => chain, eq: () => chain,
        update: () => { calls.push({ table, op: 'update' }); return chain; },
        insert: () => { calls.push({ table, op: 'insert' }); return Promise.resolve({ error: null }); },
        maybeSingle: () => Promise.resolve({
          data: table === 'admins'
            ? { id: 'a1', email: 'x', name: 'X', role: 'superadmin' }
            : { id: 't1', status: 'active' },
          error: null,
        }),
      };
      return chain;
    });
    const form = new FormData();
    form.set('trainerId', 't1');
    form.set('reasonCategory', 'compliance');
    await suspendTrainer(form);
    expect(calls.find((c) => c.table === 'trainers' && c.op === 'update')).toBeDefined();
    expect(calls.find((c) => c.table === 'lifecycle_events' && c.op === 'insert')).toBeDefined();
  });

  it('refuses non-superadmin', async () => {
    mockFrom.mockImplementation(() => ({
      select: () => ({ eq: () => ({ maybeSingle: () =>
        Promise.resolve({ data: { id: 'a1', email: 'x', name: 'X', role: 'admin' }, error: null })
      }) }),
    }));
    const form = new FormData();
    form.set('trainerId', 't1');
    form.set('reasonCategory', 'other');
    await expect(suspendTrainer(form)).rejects.toThrow('not-superadmin');
  });
});

describe('removeTrainer', () => {
  it('requires confirm phrase REMOVE', async () => {
    mockFrom.mockImplementation(() => ({
      select: () => ({ eq: () => ({ maybeSingle: () =>
        Promise.resolve({ data: { id: 'a1', email: 'x', name: 'X', role: 'superadmin' }, error: null })
      }) }),
    }));
    const form = new FormData();
    form.set('trainerId', 't1');
    form.set('reasonCategory', 'fraud');
    form.set('confirm', 'delete');
    await expect(removeTrainer(form)).rejects.toThrow('confirm-mismatch');
  });

  it('revokes active access codes and logs to_status=removed', async () => {
    const calls: Array<{ table: string; op: string }> = [];
    mockFrom.mockImplementation((table: string) => {
      const chain: MockChain = {
        select: () => chain, eq: () => chain, in: () => chain,
        update: () => { calls.push({ table, op: 'update' }); return chain; },
        insert: (args?: unknown) => { calls.push({ table, op: 'insert' }); chain._last = args; return Promise.resolve({ error: null }); },
        maybeSingle: () => Promise.resolve({
          data: table === 'admins'
            ? { id: 'a1', email: 'x', name: 'X', role: 'superadmin' }
            : { id: 't1', status: 'active' },
          error: null,
        }),
      };
      return chain;
    });
    const form = new FormData();
    form.set('trainerId', 't1');
    form.set('reasonCategory', 'fraud');
    form.set('confirm', 'REMOVE');
    await removeTrainer(form);
    expect(calls.some((c) => c.table === 'trainers' && c.op === 'update')).toBe(true);
    expect(calls.some((c) => c.table === 'access_codes' && c.op === 'update')).toBe(true);
    expect(calls.some((c) => c.table === 'lifecycle_events' && c.op === 'insert')).toBe(true);
  });
});

describe('restoreCustomer', () => {
  it('flips status back to active and logs event', async () => {
    const calls: Array<{ table: string; op: string }> = [];
    mockFrom.mockImplementation((table: string) => {
      const chain: MockChain = {
        select: () => chain, eq: () => chain,
        update: () => { calls.push({ table, op: 'update' }); return chain; },
        insert: () => { calls.push({ table, op: 'insert' }); return Promise.resolve({ error: null }); },
        maybeSingle: () => Promise.resolve({
          data: table === 'admins'
            ? { id: 'a1', email: 'x', name: 'X', role: 'superadmin' }
            : { id: 'c1', status: 'suspended' },
          error: null,
        }),
      };
      return chain;
    });
    const form = new FormData();
    form.set('customerId', 'c1');
    form.set('reasonCategory', 'other');
    await restoreCustomer(form);
    expect(calls.some((c) => c.table === 'customers' && c.op === 'update')).toBe(true);
    expect(calls.some((c) => c.table === 'lifecycle_events' && c.op === 'insert')).toBe(true);
  });

  it('refuses to restore a removed customer (only suspended → active)', async () => {
    mockFrom.mockImplementation((table: string) => {
      const chain: MockChain = {
        select: () => chain, eq: () => chain,
        maybeSingle: () => Promise.resolve({
          data: table === 'admins'
            ? { id: 'a1', email: 'x', name: 'X', role: 'superadmin' }
            : { id: 'c1', status: 'removed' },
          error: null,
        }),
      };
      return chain;
    });
    const form = new FormData();
    form.set('customerId', 'c1');
    form.set('reasonCategory', 'other');
    await expect(restoreCustomer(form)).rejects.toThrow('not-restorable');
  });
});

describe('restoreTrainer', () => {
  it('flips trainer status back to active', async () => {
    const calls: Array<{ table: string; op: string }> = [];
    mockFrom.mockImplementation((table: string) => {
      const chain: MockChain = {
        select: () => chain, eq: () => chain,
        update: () => { calls.push({ table, op: 'update' }); return chain; },
        insert: () => { calls.push({ table, op: 'insert' }); return Promise.resolve({ error: null }); },
        maybeSingle: () => Promise.resolve({
          data: table === 'admins'
            ? { id: 'a1', email: 'x', name: 'X', role: 'superadmin' }
            : { id: 't1', status: 'suspended' },
          error: null,
        }),
      };
      return chain;
    });
    const form = new FormData();
    form.set('trainerId', 't1');
    form.set('reasonCategory', 'churn');
    await restoreTrainer(form);
    expect(calls.some((c) => c.table === 'trainers' && c.op === 'update')).toBe(true);
    expect(calls.some((c) => c.table === 'lifecycle_events' && c.op === 'insert')).toBe(true);
  });
});

describe('removeCustomer BC cascade', () => {
  it('calls deleteBcCustomer when bc_customer_id is present', async () => {
    const calls: Array<{ table: string; op: string }> = [];
    mockFrom.mockImplementation((table: string) => {
      const chain: MockChain = {
        select: () => chain, eq: () => chain, in: () => chain,
        update: () => { calls.push({ table, op: 'update' }); return chain; },
        delete: () => { calls.push({ table, op: 'delete' }); return chain; },
        insert: () => { calls.push({ table, op: 'insert' }); return Promise.resolve({ error: null }); },
        maybeSingle: () => Promise.resolve({
          data: table === 'admins'
            ? { id: 'a1', email: 'x', name: 'X', role: 'superadmin' }
            : { id: 'c1', status: 'active', bigcommerce_customer_id: '99', access_code_id: 'ac1' },
          error: null,
        }),
      };
      return chain;
    });

    const form = new FormData();
    form.set('customerId', 'c1');
    form.set('reasonCategory', 'fraud');
    form.set('confirm', 'REMOVE');

    await removeCustomer(form);
    expect(deleteBcCustomer).toHaveBeenCalledWith(99);
  });
});
