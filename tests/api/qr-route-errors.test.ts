// tests/api/qr-route-errors.test.ts
//
// Error-path coverage for /api/qr/[code]. The happy path (encoded URL, env
// override, invalid code, cache header) lives in qr-route.test.ts on the
// PR #33 branch — that file isn't on main yet, so this PR ships its error
// test as a separate file to avoid a merge conflict. The two can be merged
// post-hoc if the redundancy bothers anyone.
//
// What we're testing: when QRCode.toBuffer throws (string-too-long, OOM,
// native draw failure), the route catches the error, logs with the
// `[qr-route]` grep tag and the failing code, and returns a 500 plain-text
// response. Pre-PR-#35 the request returned an opaque 500 with zero log
// line — debuggability was zero.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('qrcode', () => ({
  default: {
    toBuffer: vi.fn(),
  },
}));

describe('GET /api/qr/[code] — error path', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetAllMocks();
    // Silence the expected console.error so test output stays clean; we
    // still assert that it was called below.
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('returns 500 plain text when QRCode.toBuffer throws', async () => {
    const QRCode = await import('qrcode');
    const toBufferMock = QRCode.default.toBuffer as ReturnType<typeof vi.fn>;
    toBufferMock.mockRejectedValueOnce(new Error('mock encode failure'));

    const { GET } = await import('@/app/api/qr/[code]/route');
    const res = await GET(
      new Request('https://x/api/qr/OK-1234'),
      { params: Promise.resolve({ code: 'OK-1234' }) },
    );
    expect(res.status).toBe(500);
    expect(await res.text()).toBe('qr render failed');
  });

  it('logs the failure with grep tag + code context', async () => {
    const QRCode = await import('qrcode');
    const toBufferMock = QRCode.default.toBuffer as ReturnType<typeof vi.fn>;
    toBufferMock.mockRejectedValueOnce(new Error('mock encode failure'));

    const { GET } = await import('@/app/api/qr/[code]/route');
    await GET(
      new Request('https://x/api/qr/TEST-5678'),
      { params: Promise.resolve({ code: 'TEST-5678' }) },
    );

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [msg, err] = errorSpy.mock.calls[0] as [string, unknown];
    // Tag must match the project's convention so future "what's wrong with
    // the QR endpoint?" greps land here.
    expect(msg).toContain('[qr-route]');
    // Code in the message means logs are filterable per-failing-code.
    expect(msg).toContain('TEST-5678');
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe('mock encode failure');
  });
});
