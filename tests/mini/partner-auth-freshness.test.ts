// tests/mini/partner-auth-freshness.test.ts
//
// Regression coverage for bugs/A4 + A7 (Wave 2 T2.7):
// /api/mini/partner/summary and /api/mini/partner/issue-code must reject
// initData whose auth_date is older than the 5-minute replay-attack window.
// Both routes share a verifier (`verifyTelegramWebAppFresh`) — these tests
// confirm the wrapper-vs-route plumbing is wired correctly on both.
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the verifier — that way each test controls exactly which arm
// the route takes (valid / invalid_signature / expired_auth_data). The
// unit-level verifier tests live in tests/lib/telegram-webapp.test.ts.
vi.mock('@/lib/telegram-auth', () => ({
  verifyTelegramWebAppFresh: vi.fn(),
}));

// Supabase + issue-code mocks: only relevant for the OK path which we don't
// hit in these tests, but the modules need to import cleanly.
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
      }),
    }),
  }),
}));

vi.mock('@/lib/trainer-data', () => ({
  fetchTrainerCodes: vi.fn(),
  fetchTrainerCommissions: vi.fn(),
}));

vi.mock('@/lib/issue-code', () => ({
  issueTrainerCode: vi.fn(),
}));

import { verifyTelegramWebAppFresh } from '@/lib/telegram-auth';
import { GET as summaryGET } from '@/app/api/mini/partner/summary/route';
import { POST as issueCodePOST } from '@/app/api/mini/partner/issue-code/route';

beforeEach(() => {
  vi.clearAllMocks();
  process.env.TELEGRAM_BOT_TOKEN = 'test-bot-token';
});

function summaryReq(initData: string | null): Request {
  const headers: Record<string, string> = {};
  if (initData !== null) headers['x-telegram-init-data'] = initData;
  return new Request('http://localhost/api/mini/partner/summary', {
    method: 'GET',
    headers,
  });
}

function issueCodeReq(initData: string | null): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (initData !== null) headers['x-telegram-init-data'] = initData;
  return new Request('http://localhost/api/mini/partner/issue-code', {
    method: 'POST',
    headers,
    body: JSON.stringify({ label: 'Sarah yoga' }),
  });
}

describe('GET /api/mini/partner/summary — freshness gate', () => {
  it('returns 401 + expired_auth_data when initData is stale', async () => {
    vi.mocked(verifyTelegramWebAppFresh).mockReturnValue({
      ok: false,
      reason: 'expired_auth_data',
    });
    const res = await summaryGET(summaryReq('STALE_INIT_DATA'));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('expired_auth_data');
    expect(body.message).toMatch(/reopen/i);
  });

  it('returns 401 + invalid_init_data for bad signature (not expired)', async () => {
    vi.mocked(verifyTelegramWebAppFresh).mockReturnValue({
      ok: false,
      reason: 'invalid_signature',
    });
    const res = await summaryGET(summaryReq('TAMPERED'));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('invalid_init_data');
  });

  it('returns 401 when the X-Telegram-Init-Data header is missing', async () => {
    const res = await summaryGET(summaryReq(null));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('missing_init_data');
  });
});

describe('POST /api/mini/partner/issue-code — freshness gate', () => {
  it('returns 401 + expired_auth_data when initData is stale', async () => {
    vi.mocked(verifyTelegramWebAppFresh).mockReturnValue({
      ok: false,
      reason: 'expired_auth_data',
    });
    const res = await issueCodePOST(issueCodeReq('STALE_INIT_DATA'));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('expired_auth_data');
    expect(body.message).toMatch(/reopen/i);
  });

  it('returns 401 + invalid_init_data for bad signature (not expired)', async () => {
    vi.mocked(verifyTelegramWebAppFresh).mockReturnValue({
      ok: false,
      reason: 'invalid_signature',
    });
    const res = await issueCodePOST(issueCodeReq('TAMPERED'));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('invalid_init_data');
  });

  it('returns 401 when the X-Telegram-Init-Data header is missing', async () => {
    const res = await issueCodePOST(issueCodeReq(null));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('missing_init_data');
  });
});
