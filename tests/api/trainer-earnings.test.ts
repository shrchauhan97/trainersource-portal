// tests/api/trainer-earnings.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'node:crypto';

const SECRET = 'test-secret';
const TG_USER_ID = '123456789';
const TRAINER_ID = '11111111-1111-1111-1111-111111111111';

function sign(s: string): string {
  return crypto.createHmac('sha256', SECRET).update(s).digest('hex');
}

const commissions = [
  { amount: 25.0, status: 'pending', created_at: '2026-04-19T10:00:00Z' },
  { amount: 15.5, status: 'pending', created_at: '2026-04-20T10:00:00Z' },
];
const lastPayout = {
  total: 120.0, period_start: '2026-04-01', period_end: '2026-04-14',
  status: 'paid',
};

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === 'trainer_telegram_links') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { trainer_id: TRAINER_ID }, error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'trainers') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { status: 'active' }, error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'commissions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              gte: vi.fn().mockResolvedValue({ data: commissions, error: null }),
            }),
          }),
        };
      }
      if (table === 'payouts') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: lastPayout, error: null }),
                }),
              }),
            }),
          }),
        };
      }
      return {};
    },
  }),
}));

beforeEach(() => {
  vi.stubEnv('BOT_PORTAL_SHARED_SECRET', SECRET);
});

describe('GET /api/trainer/earnings', () => {
  it('returns current + last + next', async () => {
    const { GET } = await import('@/app/api/trainer/earnings/route');
    const res = await GET(new Request('https://x/api/trainer/earnings', {
      headers: {
        'X-Bot-Secret': SECRET,
        'X-Telegram-User-Id': TG_USER_ID,
        'X-Bot-Sig': sign(TG_USER_ID),
      },
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.current_period_total).toBeCloseTo(40.5);
    expect(body.last_payout.total).toBeCloseTo(120.0);
    expect(body.next_payout_date).toBeDefined();
  });
});
