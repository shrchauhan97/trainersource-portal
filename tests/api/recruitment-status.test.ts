import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: () => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ count: 12, error: null }),
      }),
    }),
  }),
}));

beforeEach(() => {
  vi.stubEnv('BOT_PORTAL_SHARED_SECRET', 'test-secret');
  vi.stubEnv('RECRUITMENT_THRESHOLD', '10');
});

describe('GET /api/trainer/recruitment-status', () => {
  it('returns unlocked=true when active clients >= threshold', async () => {
    const { GET } = await import('@/app/api/trainer/recruitment-status/route');
    const res = await GET(new Request('https://x/api/trainer/recruitment-status', {
      headers: {
        'X-Bot-Secret': 'test-secret',
        'X-Trainer-Id': '11111111-1111-1111-1111-111111111111',
      },
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.unlocked).toBe(true);
    expect(body.threshold).toBe(10);
    expect(body.active_clients).toBe(12);
  });
});
