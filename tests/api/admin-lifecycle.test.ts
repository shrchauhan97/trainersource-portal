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
