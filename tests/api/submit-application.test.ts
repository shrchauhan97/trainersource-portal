// tests/api/submit-application.test.ts
//
// Regression coverage for `submitApplication` in src/app/apply/actions.ts —
// the public, unauthenticated trainer-application form.
//
// Why this matters. PR #47 (T2.13) closed the READ side of the
// case-sensitivity landmine: every `.eq('email', user.email)` site now lower-
// cases the session email first via `normalizeSessionEmail`. That depends on
// a parallel invariant on the WRITE side — every persisted
// `trainers.email` row must already be lowercase + trimmed. Before this
// nightly the apply action inserted `formData.get('email') as string` raw, so
// an applicant typing `John@Example.COM` landed a mixed-case row in the DB.
// On their next sign-in, Supabase Auth returns `john@example.com` (lowercase),
// `normalizeSessionEmail` passes that through unchanged, and the read misses
// the canonical row → silent /apply bounce, missing dashboard data, missing
// telegram-link banner, etc. Audit `bugs/A4-ts-app-code-audit.md` (A5) called
// this out explicitly.
//
// These tests pin BOTH the write-side normalization contract (email lower-
// cased, every text field trimmed) AND the validation contract (required
// fields, email shape) that wraps it.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// `next/server.after()` schedules a fire-and-forget callback for after the
// response. In tests we don't want admin notification email side-effects, so
// we no-op it. (The notification path itself is its own seam — covered
// separately by tests/api/admin-notify-application or by the action's own
// `try/catch` if it lands inline.)
vi.mock('next/server', () => ({
  after: vi.fn(),
}));

// Supabase service client mock. Each test installs its own `from` handler
// (slug uniqueness probe + trainers insert) so we can observe the exact
// payload the action sends to the DB.
const fromMock = vi.fn();
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({ from: fromMock }),
}));

import { submitApplication } from '@/app/apply/actions';

type SlugProbeResult = { data: { id: string } | null; error: null | { code: string; message: string } };
type InsertResult = { data: unknown; error: null | { code: string; message: string; details?: string | null } };

function makeFromHandler(opts: {
  slugProbes?: SlugProbeResult[];
  insert: InsertResult;
  onInsert?: (payload: Record<string, unknown>) => void;
}) {
  const slugProbes = [...(opts.slugProbes ?? [{ data: null, error: null }])];
  return (table: string) => {
    if (table !== 'trainers') {
      throw new Error(`unexpected table: ${table}`);
    }
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve(slugProbes.shift() ?? { data: null, error: null }),
        }),
      }),
      insert: (payload: Record<string, unknown>) => {
        opts.onInsert?.(payload);
        return {
          select: () => ({
            single: () => Promise.resolve(opts.insert),
          }),
        };
      },
    };
  };
}

function makeFormData(fields: Record<string, string | null | undefined>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (typeof v === 'string') fd.append(k, v);
  }
  return fd;
}

beforeEach(() => {
  fromMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('submitApplication — write-side normalization', () => {
  it('lowercases the email before inserting', async () => {
    let captured: Record<string, unknown> | null = null;
    fromMock.mockImplementation(
      makeFromHandler({
        insert: { data: { id: 't1', email: 'john@example.com' }, error: null },
        onInsert: (p) => {
          captured = p;
        },
      }),
    );

    const result = await submitApplication(
      makeFormData({
        name: 'John Doe',
        email: 'John@Example.COM',
        country: 'Singapore',
        city: 'Singapore',
      }),
    );

    expect(result).toEqual({ success: true, data: { id: 't1', email: 'john@example.com' } });
    expect(captured).not.toBeNull();
    expect(captured!.email).toBe('john@example.com');
  });

  it('trims whitespace on every persisted text field', async () => {
    let captured: Record<string, unknown> | null = null;
    fromMock.mockImplementation(
      makeFromHandler({
        insert: { data: { id: 't2' }, error: null },
        onInsert: (p) => {
          captured = p;
        },
      }),
    );

    const result = await submitApplication(
      makeFormData({
        name: '  Jane Doe  ',
        email: '  JANE@example.com  ',
        phone: '  +65 9123 4567  ',
        country: '  Singapore  ',
        city: '  Singapore  ',
        niche: '  fat-loss coaching  ',
        socialMedia: '  https://instagram.com/jane  ',
      }),
    );

    expect(result).toEqual({ success: true, data: { id: 't2' } });
    expect(captured).not.toBeNull();
    expect(captured!.name).toBe('Jane Doe');
    expect(captured!.email).toBe('jane@example.com');
    expect(captured!.phone).toBe('+65 9123 4567');
    expect(captured!.country).toBe('Singapore');
    expect(captured!.city).toBe('Singapore');
    expect(captured!.niche).toBe('fat-loss coaching');
    expect(captured!.social_media).toBe('https://instagram.com/jane');
  });

  it('whitespace-only optional fields become NULL, not empty strings', async () => {
    let captured: Record<string, unknown> | null = null;
    fromMock.mockImplementation(
      makeFromHandler({
        insert: { data: { id: 't3' }, error: null },
        onInsert: (p) => {
          captured = p;
        },
      }),
    );

    await submitApplication(
      makeFormData({
        name: 'Test',
        email: 'test@example.com',
        country: 'Singapore',
        city: 'Singapore',
        phone: '   ',
        niche: '',
        socialMedia: '\t\n  ',
      }),
    );

    expect(captured).not.toBeNull();
    expect(captured!.phone).toBeNull();
    expect(captured!.niche).toBeNull();
    expect(captured!.social_media).toBeNull();
  });

  it('treats whitespace-only required fields as missing (no DB call)', async () => {
    const insertSpy = vi.fn();
    fromMock.mockImplementation(
      makeFromHandler({
        insert: { data: { id: 'should-not-fire' }, error: null },
        onInsert: insertSpy,
      }),
    );

    const result = await submitApplication(
      makeFormData({
        name: '   ',
        email: 'a@b.com',
        country: 'Singapore',
        city: 'Singapore',
      }),
    );

    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toMatch(/Full name/);
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it('rejects malformed email shape BEFORE hitting the DB', async () => {
    const insertSpy = vi.fn();
    fromMock.mockImplementation(
      makeFromHandler({
        insert: { data: { id: 'should-not-fire' }, error: null },
        onInsert: insertSpy,
      }),
    );

    const result = await submitApplication(
      makeFormData({
        name: 'Test',
        email: 'not-an-email',
        country: 'Singapore',
        city: 'Singapore',
      }),
    );

    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toMatch(/email address/i);
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it('surfaces friendly copy on unique-violation (existing email)', async () => {
    fromMock.mockImplementation(
      makeFromHandler({
        insert: {
          data: null,
          error: {
            code: '23505',
            message: 'duplicate key value violates unique constraint "trainers_email_key"',
            details: 'Key (email)=(john@example.com) already exists.',
          },
        },
      }),
    );

    const result = await submitApplication(
      makeFormData({
        name: 'John',
        email: 'John@Example.com',
        country: 'Singapore',
        city: 'Singapore',
      }),
    );

    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toMatch(/already have an application/i);
  });
});
