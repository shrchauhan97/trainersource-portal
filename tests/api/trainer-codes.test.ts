// tests/api/trainer-codes.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'node:crypto';

const SECRET = 'test-secret';
const TG_USER_ID = '123456789';
const TRAINER_ID = '11111111-1111-1111-1111-111111111111';

function sign(s: string): string {
  return crypto.createHmac('sha256', SECRET).update(s).digest('hex');
}

const mockSelect = vi.fn().mockResolvedValue({
  data: [
    {
      id: 'cid-1',
      code: 'SARAH-A7K2',
      label: 'Sarah yoga',
      status: 'active',
      issued_via: 'bot',
      created_at: '2026-04-15T00:00:00Z',
      expires_at: '2027-04-15T00:00:00Z',
    },
  ],
  error: null,
});
const mockCount = vi.fn().mockResolvedValue({ count: 3, error: null });

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
      if (table === 'access_codes') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue(mockSelect()),
              }),
            }),
          }),
        };
      }
      if (table === 'customers') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue(mockCount()),
            in: vi.fn().mockResolvedValue({ data: [], error: null }),
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

describe('GET /api/trainer/codes', () => {
  it('returns codes with usage counts on valid bot auth', async () => {
    const { GET } = await import('@/app/api/trainer/codes/route');
    const res = await GET(new Request('https://x/api/trainer/codes', {
      headers: {
        'X-Bot-Secret': SECRET,
        'X-Telegram-User-Id': TG_USER_ID,
        'X-Bot-Sig': sign(TG_USER_ID),
      },
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.codes).toHaveLength(1);
    expect(body.codes[0].code).toBe('SARAH-A7K2');
  });

  it('rejects missing X-Bot-Secret', async () => {
    const { GET } = await import('@/app/api/trainer/codes/route');
    const res = await GET(new Request('https://x/api/trainer/codes'));
    expect(res.status).toBe(401);
  });
});
