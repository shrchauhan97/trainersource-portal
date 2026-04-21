// tests/api/issue-code.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInsert = vi.fn().mockReturnThis();
const mockSelect = vi.fn().mockReturnThis();
const mockSingle = vi.fn().mockResolvedValue({
  data: {
    id: 'c-1', code: 'SARAH-A7K2', label: 'Sarah yoga',
    expires_at: '2027-04-21T00:00:00Z',
  },
  error: null,
});

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: () => ({ insert: mockInsert, select: mockSelect, single: mockSingle }),
  }),
}));

beforeEach(() => {
  vi.stubEnv('BOT_PORTAL_SHARED_SECRET', 'test-secret');
  mockInsert.mockClear();
});

describe('POST /api/trainer/issue-code', () => {
  it('creates a code for valid label', async () => {
    const { POST } = await import('@/app/api/trainer/issue-code/route');
    const res = await POST(new Request('https://x/api/trainer/issue-code', {
      method: 'POST',
      headers: {
        'X-Bot-Secret': 'test-secret',
        'X-Trainer-Id': '11111111-1111-1111-1111-111111111111',
        'Content-Type': 'application/json',
      },
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
      headers: {
        'X-Bot-Secret': 'test-secret',
        'X-Trainer-Id': '11111111-1111-1111-1111-111111111111',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    }));
    expect(res.status).toBe(400);
  });

  it('rejects non-ASCII-only label (empty slug)', async () => {
    const { POST } = await import('@/app/api/trainer/issue-code/route');
    const res = await POST(new Request('https://x/api/trainer/issue-code', {
      method: 'POST',
      headers: {
        'X-Bot-Secret': 'test-secret',
        'X-Trainer-Id': '11111111-1111-1111-1111-111111111111',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ label: '客户' }),
    }));
    // Falls back to CLIENT-XXXX, should still 200
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.code).toMatch(/^CLIENT-[A-Z0-9]{4}$/);
  });
});
