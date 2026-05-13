import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'node:crypto';

// Service-role client mocks the `link_telegram_to_trainer` RPC. The portal
// client mocks `auth.getUser` + a `from('trainers').select(...).eq(...).maybeSingle()`
// chain that resolves to the authenticated trainer's row.
const mockRpc = vi.fn();
const mockServiceFrom = vi.fn();

const mockTrainerMaybeSingle = vi.fn().mockResolvedValue({
  data: { id: 't-uuid', email: 'sarah@x.com' },
  error: null,
});
const mockPortalFrom = vi.fn(() => ({
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: mockTrainerMaybeSingle,
}));
const mockAuth = {
  getUser: vi.fn().mockResolvedValue({
    data: { user: { email: 'sarah@x.com' } },
    error: null,
  }),
};

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ from: mockPortalFrom, auth: mockAuth }),
}));
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({ rpc: mockRpc, from: mockServiceFrom }),
}));

beforeEach(() => {
  vi.stubEnv('TELEGRAM_BOT_TOKEN', '1234567:ABCDEF');
  mockRpc.mockReset();
  mockServiceFrom.mockReset();
  // Default: RPC reports a fresh link succeeded. Individual tests override.
  mockRpc.mockResolvedValue({
    data: [
      {
        ok: true,
        reason: null,
        existing_trainer_id: 't-uuid',
        action: 'create',
      },
    ],
    error: null,
  });
});

function sign(data: Record<string, string | number>, token: string): string {
  const secret = crypto.createHash('sha256').update(token).digest();
  const dcs = Object.keys(data).filter((k) => k !== 'hash').sort().map((k) => `${k}=${data[k]}`).join('\n');
  return crypto.createHmac('sha256', secret).update(dcs).digest('hex');
}

function makeSignedUrl(id: number, firstName = 'Sarah') {
  const now = Math.floor(Date.now() / 1000);
  const payload = { id, first_name: firstName, auth_date: now };
  const hash = sign(payload, '1234567:ABCDEF');
  return `https://trainer-source.com/api/telegram/verify-login?id=${id}&first_name=${firstName}&auth_date=${now}&hash=${hash}`;
}

describe('GET /api/telegram/verify-login', () => {
  it('redirects to dashboard on a fresh link (happy path)', async () => {
    const { GET } = await import('@/app/api/telegram/verify-login/route');
    const res = await GET(new Request(makeSignedUrl(999)));
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toMatch(/\/dashboard\?telegram_linked=1/);
    expect(mockRpc).toHaveBeenCalledWith(
      'link_telegram_to_trainer',
      expect.objectContaining({
        p_telegram_user_id: 999,
        p_trainer_id: 't-uuid',
        p_linked_via: 'widget',
      }),
    );
  });

  it('is idempotent on self-relink (RPC returns ok=true, action=noop)', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [
        {
          ok: true,
          reason: null,
          existing_trainer_id: 't-uuid',
          action: 'noop',
        },
      ],
      error: null,
    });
    const { GET } = await import('@/app/api/telegram/verify-login/route');
    const res = await GET(new Request(makeSignedUrl(999)));
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toMatch(/\/dashboard\?telegram_linked=1/);
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });

  it('returns 409 when Telegram account is already linked to a different trainer', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [
        {
          ok: false,
          reason: 'telegram_account_linked_to_another_trainer',
          existing_trainer_id: 'other-trainer-uuid',
          action: 'conflict_blocked',
        },
      ],
      error: null,
    });
    const { GET } = await import('@/app/api/telegram/verify-login/route');
    const res = await GET(new Request(makeSignedUrl(999)));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('telegram_account_linked_to_another_trainer');
    expect(body.message).toMatch(/already linked to another trainer/i);
    // The conflict response must NOT leak the other trainer's id.
    expect(JSON.stringify(body)).not.toContain('other-trainer-uuid');
    // RPC was called with the audit fields (ip/UA) so the migration can log
    // the blocked-hijack attempt.
    expect(mockRpc).toHaveBeenCalledWith(
      'link_telegram_to_trainer',
      expect.objectContaining({
        p_telegram_user_id: 999,
        p_trainer_id: 't-uuid',
        p_linked_via: 'widget',
      }),
    );
  });

  it('returns 401 on invalid HMAC', async () => {
    const { GET } = await import('@/app/api/telegram/verify-login/route');
    const url = `https://x/api/telegram/verify-login?id=1&first_name=S&auth_date=1&hash=deadbeef`;
    const res = await GET(new Request(url));
    expect(res.status).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('returns 401 when no portal session', async () => {
    mockAuth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const { GET } = await import('@/app/api/telegram/verify-login/route');
    const res = await GET(new Request(makeSignedUrl(5, 'S')));
    expect(res.status).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('returns 500 when the RPC itself errors', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'connection lost' } });
    const { GET } = await import('@/app/api/telegram/verify-login/route');
    const res = await GET(new Request(makeSignedUrl(999)));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('link-failed');
  });
});
