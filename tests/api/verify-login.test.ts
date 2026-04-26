import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'node:crypto';

const mockUpsert = vi.fn().mockResolvedValue({ error: null });
const mockFrom = vi.fn(() => ({
  upsert: mockUpsert,
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn().mockResolvedValue({
    data: { id: 't-uuid', email: 'sarah@x.com' },
    error: null,
  }),
}));
const mockAuth = {
  getUser: vi.fn().mockResolvedValue({
    data: { user: { email: 'sarah@x.com' } },
    error: null,
  }),
};

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ from: mockFrom, auth: mockAuth }),
}));
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({ from: mockFrom }),
}));

beforeEach(() => {
  vi.stubEnv('TELEGRAM_BOT_TOKEN', '1234567:ABCDEF');
  mockUpsert.mockClear();
});

function sign(data: Record<string, string | number>, token: string): string {
  const secret = crypto.createHash('sha256').update(token).digest();
  const dcs = Object.keys(data).filter((k) => k !== 'hash').sort().map((k) => `${k}=${data[k]}`).join('\n');
  return crypto.createHmac('sha256', secret).update(dcs).digest('hex');
}

describe('GET /api/telegram/verify-login', () => {
  it('redirects to dashboard on valid payload + upserts link', async () => {
    const { GET } = await import('@/app/api/telegram/verify-login/route');
    const now = Math.floor(Date.now() / 1000);
    const payload = { id: 999, first_name: 'Sarah', auth_date: now };
    const hash = sign(payload, '1234567:ABCDEF');
    const url = `https://trainer-source.com/api/telegram/verify-login?id=999&first_name=Sarah&auth_date=${now}&hash=${hash}`;
    const res = await GET(new Request(url));
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toMatch(/\/dashboard\?telegram_linked=1/);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        telegram_user_id: 999,
        trainer_id: 't-uuid',
        linked_via: 'widget',
      }),
      expect.anything(),
    );
  });

  it('returns 401 on invalid HMAC', async () => {
    const { GET } = await import('@/app/api/telegram/verify-login/route');
    const url = `https://x/api/telegram/verify-login?id=1&first_name=S&auth_date=1&hash=deadbeef`;
    const res = await GET(new Request(url));
    expect(res.status).toBe(401);
  });

  it('returns 401 when no portal session', async () => {
    mockAuth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const { GET } = await import('@/app/api/telegram/verify-login/route');
    const now = Math.floor(Date.now() / 1000);
    const payload = { id: 5, first_name: 'S', auth_date: now };
    const hash = sign(payload, '1234567:ABCDEF');
    const url = `https://x/api/telegram/verify-login?id=5&first_name=S&auth_date=${now}&hash=${hash}`;
    const res = await GET(new Request(url));
    expect(res.status).toBe(401);
  });
});
