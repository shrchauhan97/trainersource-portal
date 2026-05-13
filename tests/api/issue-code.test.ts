// tests/api/issue-code.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'node:crypto';

const SECRET = 'test-secret';
const TG_USER_ID = '123456789';
const TRAINER_ID = '11111111-1111-1111-1111-111111111111';

function sign(s: string): string {
  return crypto.createHmac('sha256', SECRET).update(s).digest('hex');
}

const mockInsert = vi.fn().mockReturnThis();
const mockSelect = vi.fn().mockReturnThis();
const mockSingle = vi.fn().mockResolvedValue({
  data: {
    id: 'c-1', code: 'SARAH-A7K2', label: 'Sarah yoga',
    expires_at: '2027-04-21T00:00:00Z',
  },
  error: null,
});

// The route now calls supabase via:
//   - trainer_telegram_links.select.eq.maybeSingle   (bot-auth)
//   - trainers.select.eq.maybeSingle                  (bot-auth)
//   - access_codes.insert.select.single               (issue-code business logic)
// We dispatch on table name.
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
      // access_codes — legacy chain mock kept as-is.
      return { insert: mockInsert, select: mockSelect, single: mockSingle };
    },
  }),
}));

beforeEach(() => {
  vi.stubEnv('BOT_PORTAL_SHARED_SECRET', SECRET);
  mockInsert.mockClear();
});

function authHeaders(): Record<string, string> {
  return {
    'X-Bot-Secret': SECRET,
    'X-Telegram-User-Id': TG_USER_ID,
    'X-Bot-Sig': sign(TG_USER_ID),
    'Content-Type': 'application/json',
  };
}

describe('POST /api/trainer/issue-code', () => {
  it('creates a code for valid label', async () => {
    const { POST } = await import('@/app/api/trainer/issue-code/route');
    const res = await POST(new Request('https://x/api/trainer/issue-code', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ label: 'Sarah yoga' }),
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.code).toMatch(/^SARAH-YOGA-[A-Z0-9]{4}$/);
    expect(body.deep_link).toMatch(/ultimate-peptides\.com\/code\/SARAH-YOGA-/);
    expect(body.landing_url).toMatch(/ref=SARAH-YOGA-/);
    expect(body.qr_url).toMatch(/\/api\/qr\//);
  });

  it('rejects missing label', async () => {
    const { POST } = await import('@/app/api/trainer/issue-code/route');
    const res = await POST(new Request('https://x/api/trainer/issue-code', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({}),
    }));
    expect(res.status).toBe(400);
  });

  it('rejects non-ASCII-only label (empty slug)', async () => {
    const { POST } = await import('@/app/api/trainer/issue-code/route');
    const res = await POST(new Request('https://x/api/trainer/issue-code', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ label: '客户' }),
    }));
    // Falls back to CLIENT-XXXX, should still 200
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.code).toMatch(/^CLIENT-[A-Z0-9]{4}$/);
  });
});
