// tests/integration/trainer-data.test.ts
import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  fetchTrainerCodes,
  fetchTrainerClients,
  fetchTrainerCommissions,
} from '@/lib/trainer-data';

// Minimal fluent-builder stub. Each chained call returns the same thenable;
// the resolver (keyed by table name) is invoked at await-time.
type Resolver = () => Promise<{ data: unknown; error: unknown }>;

function buildClient(resolvers: Record<string, Resolver>): SupabaseClient {
  return {
    from(table: string) {
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        in: () => chain,
        order: () => chain,
        then(
          onFulfilled: (v: { data: unknown; error: unknown }) => unknown,
        ) {
          const r = resolvers[table];
          if (!r) throw new Error(`no resolver for table ${table}`);
          return r().then(onFulfilled);
        },
      };
      return chain;
    },
  } as unknown as SupabaseClient;
}

describe('fetchTrainerCodes', () => {
  it('returns active/consumed/expired statuses + customer names', async () => {
    const now = Date.now();
    const future = new Date(now + 86400_000).toISOString();
    const past = new Date(now - 86400_000).toISOString();

    const supabase = buildClient({
      access_codes: async () => ({
        data: [
          { id: 'c1', code: 'A7K2', trainer_id: 't1', status: 'active',   expires_at: future, created_at: past, consumed_by: null },
          { id: 'c2', code: 'B9X1', trainer_id: 't1', status: 'consumed', expires_at: future, created_at: past, consumed_by: 'cust1' },
          { id: 'c3', code: 'Z0Z0', trainer_id: 't1', status: 'active',   expires_at: past,   created_at: past, consumed_by: null },
        ],
        error: null,
      }),
      customers: async () => ({
        data: [{ id: 'cust1', name: 'Sarah Johnson' }],
        error: null,
      }),
    });

    const rows = await fetchTrainerCodes(supabase, 't1');
    expect(rows).toHaveLength(3);
    expect(rows[0].displayStatus).toBe('active');
    expect(rows[1].displayStatus).toBe('consumed');
    expect(rows[1].consumedByName).toBe('Sarah Johnson');
    expect(rows[2].displayStatus).toBe('expired');
  });

  it('skips the customers lookup when no codes are consumed', async () => {
    const customersResolver = vi.fn();
    const supabase = buildClient({
      access_codes: async () => ({
        data: [
          {
            id: 'c1',
            code: 'A',
            trainer_id: 't1',
            status: 'active',
            expires_at: new Date(Date.now() + 1000).toISOString(),
            created_at: '2026-01-01',
            consumed_by: null,
          },
        ],
        error: null,
      }),
      customers: customersResolver,
    });
    const rows = await fetchTrainerCodes(supabase, 't1');
    expect(rows[0].consumedByName).toBeNull();
    expect(customersResolver).not.toHaveBeenCalled();
  });

  it('throws on supabase error', async () => {
    const supabase = buildClient({
      access_codes: async () => ({ data: null, error: { message: 'boom' } }),
    });
    await expect(fetchTrainerCodes(supabase, 't1')).rejects.toThrow('boom');
  });
});

describe('fetchTrainerCommissions', () => {
  it('aggregates pending/approved/paid + attaches customer names', async () => {
    const supabase = buildClient({
      commissions: async () => ({
        data: [
          { id: 'k1', trainer_id: 't1', order_id: 'o1', amount: '120.00', status: 'pending',  commission_type: 'first_sale', rate_snapshot: '0.15', created_at: '2026-03-01' },
          { id: 'k2', trainer_id: 't1', order_id: 'o2', amount: '80.00',  status: 'approved', commission_type: 'reorder',    rate_snapshot: '0.10', created_at: '2026-03-02' },
          { id: 'k3', trainer_id: 't1', order_id: 'o2', amount: '60.00',  status: 'paid',     commission_type: 'reorder',    rate_snapshot: '0.10', created_at: '2026-03-03' },
        ],
        error: null,
      }),
      orders: async () => ({
        data: [
          { id: 'o1', customer_id: 'cu1', bigcommerce_order_id: '20261' },
          { id: 'o2', customer_id: 'cu2', bigcommerce_order_id: '20262' },
        ],
        error: null,
      }),
      customers: async () => ({
        data: [{ id: 'cu1', name: 'Alex' }, { id: 'cu2', name: 'Mike' }],
        error: null,
      }),
    });

    const { commissions, summary } = await fetchTrainerCommissions(supabase, 't1');
    expect(summary).toEqual({ pending: 120, approved: 80, paid: 60 });
    expect(commissions[0].customerName).toBe('Alex');
    expect(commissions[1].bigcommerceOrderId).toBe('20262');
  });
});

describe('fetchTrainerClients', () => {
  it('computes per-customer order count', async () => {
    const supabase = buildClient({
      customers: async () => ({
        data: [
          { id: 'cu1', trainer_id: 't1', name: 'A', email: 'a@x.com', city: 'SG', country: 'SG', created_at: '2026-01-01' },
          { id: 'cu2', trainer_id: 't1', name: 'B', email: 'b@x.com', city: 'SG', country: 'SG', created_at: '2026-01-02' },
        ],
        error: null,
      }),
      orders: async () => ({
        data: [{ customer_id: 'cu1' }, { customer_id: 'cu1' }, { customer_id: 'cu2' }],
        error: null,
      }),
    });
    const rows = await fetchTrainerClients(supabase, 't1');
    expect(rows.find((r) => r.id === 'cu1')?.orderCount).toBe(2);
    expect(rows.find((r) => r.id === 'cu2')?.orderCount).toBe(1);
  });
});
