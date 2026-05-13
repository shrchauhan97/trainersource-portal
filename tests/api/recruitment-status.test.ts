import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'node:crypto';

const SECRET = 'test-secret';
const TG_USER_ID = '123456789';
const TRAINER_ID = '11111111-1111-1111-1111-111111111111';

function sign(s: string): string {
  return crypto.createHmac('sha256', SECRET).update(s).digest('hex');
}

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
      // customers table — recruitment-status business logic
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ count: 12, error: null }),
        }),
      };
    },
  }),
}));

beforeEach(() => {
  vi.stubEnv('BOT_PORTAL_SHARED_SECRET', SECRET);
  vi.stubEnv('RECRUITMENT_THRESHOLD', '10');
});

describe('GET /api/trainer/recruitment-status', () => {
  it('returns unlocked=true when active clients >= threshold', async () => {
    const { GET } = await import('@/app/api/trainer/recruitment-status/route');
    const res = await GET(new Request('https://x/api/trainer/recruitment-status', {
      headers: {
        'X-Bot-Secret': SECRET,
        'X-Telegram-User-Id': TG_USER_ID,
        'X-Bot-Sig': sign(TG_USER_ID),
      },
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.unlocked).toBe(true);
    expect(body.threshold).toBe(10);
    expect(body.active_clients).toBe(12);
  });
});
