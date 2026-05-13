import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------- mock the Resend SDK ----------
//
// The real `resend` package does a network call from `client.emails.send`.
// We replace it with a constructable class stub so the email module's
// `new Resend(apiKey)` call returns an object whose `emails.send` is a spy.
// `vi.fn().mockImplementation(() => obj)` is NOT constructable in vitest 4 —
// `new` on it throws. A plain class is the simplest fix.
const sendSpy = vi.fn();

vi.mock('resend', () => {
  class ResendStub {
    emails = { send: sendSpy };
  }
  return { Resend: ResendStub };
});

// Import AFTER the mock so the module under test resolves to the stub. The
// env-reading functions inside the module read process.env at call time, so
// `vi.stubEnv` BEFORE each call is sufficient — no `vi.resetModules()` needed.
import {
  sendEmail,
  assertProductionEmailReady,
  getSiteUrl,
  newClientJoinedEmail,
} from '@/lib/email';

// Reset the spy's call history between tests (the mock itself is module-level
// so the same `sendSpy` reference is shared — we just clear it). Also unstub
// every env var so each test sets up a clean slate; otherwise a VERCEL_ENV
// stub from one test leaks into the next.
beforeEach(() => {
  sendSpy.mockReset();
  sendSpy.mockResolvedValue({ data: { id: 'msg_test' }, error: null });
  vi.unstubAllEnvs();
  // Vitest defaults NODE_ENV='test'. Strip every env var our code looks at so
  // each test declares its own state explicitly.
  vi.stubEnv('VERCEL_ENV', '');
  vi.stubEnv('VERCEL_URL', '');
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
  vi.stubEnv('RESEND_API_KEY', '');
  vi.stubEnv('RESEND_FROM', '');
  vi.stubEnv('RESEND_REPLY_TO', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// Helper: stub a full prod environment.
function stubProductionEnv(): void {
  vi.stubEnv('VERCEL_ENV', 'production');
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('RESEND_API_KEY', 'rsd_prod_key');
  vi.stubEnv('RESEND_FROM', 'TrainerSource <support@trainer-source.com>');
  vi.stubEnv('RESEND_REPLY_TO', 'support@trainer-source.com');
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://trainer-source.com');
}

// ---------- assertProductionEmailReady ----------

describe('assertProductionEmailReady', () => {
  it('no-ops in preview (VERCEL_ENV=preview)', () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    expect(() => assertProductionEmailReady()).not.toThrow();
  });

  it('no-ops in development (VERCEL_ENV=development)', () => {
    vi.stubEnv('VERCEL_ENV', 'development');
    expect(() => assertProductionEmailReady()).not.toThrow();
  });

  it('no-ops when VERCEL_ENV is unset and NODE_ENV is not production', () => {
    // vitest sets NODE_ENV=test by default; mirror that explicitly.
    vi.stubEnv('NODE_ENV', 'test');
    expect(() => assertProductionEmailReady()).not.toThrow();
  });

  it('throws in production when RESEND_API_KEY is missing', () => {
    stubProductionEnv();
    vi.stubEnv('RESEND_API_KEY', '');
    expect(() => assertProductionEmailReady()).toThrow(/RESEND_API_KEY/);
  });

  it('throws in production when RESEND_FROM is missing', () => {
    stubProductionEnv();
    vi.stubEnv('RESEND_FROM', '');
    expect(() => assertProductionEmailReady()).toThrow(/RESEND_FROM/);
  });

  it('throws in production when RESEND_REPLY_TO is missing', () => {
    stubProductionEnv();
    vi.stubEnv('RESEND_REPLY_TO', '');
    expect(() => assertProductionEmailReady()).toThrow(/RESEND_REPLY_TO/);
  });

  it('throws in production when NEXT_PUBLIC_SITE_URL is missing', () => {
    stubProductionEnv();
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
    expect(() => assertProductionEmailReady()).toThrow(/NEXT_PUBLIC_SITE_URL/);
  });

  it('lists all missing vars in one error', () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    // Leave every email-config var blank.
    let caught: Error | null = null;
    try {
      assertProductionEmailReady();
    } catch (e) {
      caught = e as Error;
    }
    expect(caught).not.toBeNull();
    expect(caught?.message).toMatch(/RESEND_API_KEY/);
    expect(caught?.message).toMatch(/RESEND_FROM/);
    expect(caught?.message).toMatch(/RESEND_REPLY_TO/);
    expect(caught?.message).toMatch(/NEXT_PUBLIC_SITE_URL/);
  });

  it('passes when fully configured in production', () => {
    stubProductionEnv();
    expect(() => assertProductionEmailReady()).not.toThrow();
  });

  it('falls back to NODE_ENV when VERCEL_ENV is absent', () => {
    // Off-Vercel runtime (CI runner, local node, etc.). NODE_ENV=production
    // should engage the prod readiness check.
    vi.stubEnv('VERCEL_ENV', '');
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => assertProductionEmailReady()).toThrow(/missing/);
  });
});

// ---------- getSiteUrl ----------

describe('getSiteUrl', () => {
  it('uses NEXT_PUBLIC_SITE_URL in production when set', () => {
    stubProductionEnv();
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://trainer-source.com');
    expect(getSiteUrl()).toBe('https://trainer-source.com');
  });

  it('falls back to the prod default in production when env unset', () => {
    // Note: assertProductionEmailReady would throw here in the actual send
    // path, but getSiteUrl itself is permissive — we still want a sane
    // value for any non-send caller.
    vi.stubEnv('VERCEL_ENV', 'production');
    expect(getSiteUrl()).toBe('https://trainer-source.com');
  });

  it('prefers NEXT_PUBLIC_SITE_URL on preview when set', () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://preview.example.com');
    expect(getSiteUrl()).toBe('https://preview.example.com');
  });

  it('falls back to https://${VERCEL_URL} on preview when SITE_URL unset', () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('VERCEL_URL', 'trainersource-app-abc123.vercel.app');
    expect(getSiteUrl()).toBe('https://trainersource-app-abc123.vercel.app');
  });

  it('falls back to localhost when nothing is set', () => {
    vi.stubEnv('NODE_ENV', 'test');
    expect(getSiteUrl()).toBe('http://localhost:3000');
  });
});

// ---------- sendEmail (FROM / REPLY_TO selection) ----------

describe('sendEmail — env-aware FROM / REPLY_TO', () => {
  it('uses prod FROM and REPLY_TO when VERCEL_ENV=production and vars set', async () => {
    stubProductionEnv();
    vi.stubEnv('RESEND_FROM', 'TrainerSource <support@trainer-source.com>');
    vi.stubEnv('RESEND_REPLY_TO', 'support@trainer-source.com');

    await sendEmail({ to: 'x@example.com', subject: 's', html: '<p>h</p>' });

    expect(sendSpy).toHaveBeenCalledTimes(1);
    const call = sendSpy.mock.calls[0][0];
    expect(call.from).toBe('TrainerSource <support@trainer-source.com>');
    expect(call.replyTo).toBe('support@trainer-source.com');
  });

  it('uses preview placeholder FROM/REPLY_TO when VERCEL_ENV=preview and env vars unset', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('RESEND_API_KEY', 'rsd_preview_key');
    // RESEND_FROM / RESEND_REPLY_TO intentionally left unset.

    await sendEmail({ to: 'x@example.com', subject: 's', html: '<p>h</p>' });

    expect(sendSpy).toHaveBeenCalledTimes(1);
    const call = sendSpy.mock.calls[0][0];
    expect(call.from).toContain('PREVIEW');
    expect(call.from).toContain('preview-no-reply@ultimate-peptides.com');
    expect(call.replyTo).toBe('preview-no-reply@ultimate-peptides.com');
  });

  it('throws in production when VERCEL_ENV=production but vars unset', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    // Every email-config var blank.

    await expect(
      sendEmail({ to: 'x@example.com', subject: 's', html: '<p>h</p>' }),
    ).rejects.toThrow(/missing/);

    // And we never reached the Resend client.
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('behaves like preview when NODE_ENV=test and no VERCEL_ENV', async () => {
    // No VERCEL_ENV. NODE_ENV is 'test' (vitest default, set explicitly here).
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('RESEND_API_KEY', 'rsd_test_key');

    await sendEmail({ to: 'x@example.com', subject: 's', html: '<p>h</p>' });

    expect(sendSpy).toHaveBeenCalledTimes(1);
    const call = sendSpy.mock.calls[0][0];
    expect(call.from).toContain('PREVIEW');
    expect(call.replyTo).toBe('preview-no-reply@ultimate-peptides.com');
  });

  it('respects RESEND_FROM override on preview when explicitly set', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('RESEND_API_KEY', 'rsd_preview_key');
    vi.stubEnv('RESEND_FROM', 'Custom <custom@example.com>');
    vi.stubEnv('RESEND_REPLY_TO', 'reply@example.com');

    await sendEmail({ to: 'x@example.com', subject: 's', html: '<p>h</p>' });

    const call = sendSpy.mock.calls[0][0];
    expect(call.from).toBe('Custom <custom@example.com>');
    expect(call.replyTo).toBe('reply@example.com');
  });

  it('warns on every send in non-prod (visible in logs)', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('RESEND_API_KEY', 'rsd_preview_key');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      await sendEmail({ to: 'x@example.com', subject: 's', html: '<p>h</p>' });
      // First call should be the non-production banner. We don't pin the index
      // because `RESEND_API_KEY missing` would emit a different warn — but
      // here we have a key, so only one warn fires.
      const nonProdWarns = warnSpy.mock.calls.filter(
        (c) => typeof c[0] === 'string' && c[0].startsWith('[email] non-production send'),
      );
      expect(nonProdWarns.length).toBe(1);
      expect(nonProdWarns[0][1]).toMatchObject({
        vercelEnv: 'preview',
        to: 'x@example.com',
        from: expect.stringContaining('PREVIEW'),
      });
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('does NOT warn on prod send', async () => {
    stubProductionEnv();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      await sendEmail({ to: 'x@example.com', subject: 's', html: '<p>h</p>' });
      const nonProdWarns = warnSpy.mock.calls.filter(
        (c) => typeof c[0] === 'string' && c[0].startsWith('[email] non-production send'),
      );
      expect(nonProdWarns.length).toBe(0);
    } finally {
      warnSpy.mockRestore();
    }
  });
});

// ---------- template SITE_URL plumbing ----------

describe('templates use env-aware SITE_URL', () => {
  it('newClientJoinedEmail uses the prod SITE_URL when VERCEL_ENV=production', () => {
    stubProductionEnv();
    const out = newClientJoinedEmail({
      trainerName: 'Sam Smith',
      clientName: 'Pat',
      clientEmail: 'pat@example.com',
      clientCity: 'Singapore',
      clientCountry: 'SG',
    });
    expect(out.html).toContain('https://trainer-source.com/dashboard');
  });

  it('newClientJoinedEmail uses localhost on dev/test without a SITE_URL', () => {
    vi.stubEnv('NODE_ENV', 'test');
    const out = newClientJoinedEmail({
      trainerName: 'Sam Smith',
      clientName: 'Pat',
      clientEmail: 'pat@example.com',
      clientCity: 'Singapore',
      clientCountry: 'SG',
    });
    expect(out.html).toContain('http://localhost:3000/dashboard');
  });

  it('newClientJoinedEmail uses VERCEL_URL on preview when SITE_URL unset', () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('VERCEL_URL', 'trainersource-app-abc.vercel.app');
    const out = newClientJoinedEmail({
      trainerName: 'Sam Smith',
      clientName: 'Pat',
      clientEmail: 'pat@example.com',
      clientCity: 'Singapore',
      clientCountry: 'SG',
    });
    expect(out.html).toContain('https://trainersource-app-abc.vercel.app/dashboard');
  });
});
