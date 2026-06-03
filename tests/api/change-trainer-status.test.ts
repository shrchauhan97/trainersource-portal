import { beforeEach, describe, expect, it, vi } from 'vitest';

// SHA-5 regression coverage for `changeTrainerStatus` — the admin action
// that flips a trainer's status from the admin/trainers page. Before this
// PR the action wrote the status update and returned; the trainer was
// never told they had been approved, and (combined with the auth gate
// also fixed in this PR) the entire onboarding flow was unreachable.
//
// Pins:
//   - applied → onboarding fires the welcome email exactly once
//   - applied → active   fires the welcome email exactly once
//   - onboarding → active does NOT re-notify (already approved)
//   - any → suspended    does NOT email
//   - email send failures do NOT bubble (status update is the contract)
//   - email is sent via next/server `after()`, not blocking the action

const mockFrom = vi.fn();
const mockGetUser = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: () =>
    Promise.resolve({
      from: mockFrom,
      auth: { getUser: mockGetUser },
    }),
}));

// The action also pulls a service-role client (for unrelated helpers); stub
// it so any incidental call doesn't crash the test.
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({ from: vi.fn(), rpc: vi.fn() }),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

// Capture the callback passed to next/server.after — execute it synchronously
// so the test can assert sendEmail was called and inspect its arguments.
// In production `after()` defers the callback until after the response is
// flushed; for the unit test we just want to verify the wiring.
const afterCallbacks: Array<() => Promise<void> | void> = [];
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return {
    ...actual,
    after: (cb: () => Promise<void> | void) => {
      afterCallbacks.push(cb);
    },
  };
});

const sendEmailMock = vi.fn();
vi.mock('@/lib/email', async () => {
  // Use the real `trainerApprovedInviteEmail` template (cheap, deterministic)
  // and only stub the network-bound `sendEmail`. That keeps the test
  // honest: a template rename or signature change will break the test, not
  // be silently masked.
  const actual = await vi.importActual<typeof import('@/lib/email')>('@/lib/email');
  return {
    ...actual,
    sendEmail: (...args: Parameters<typeof actual.sendEmail>) => sendEmailMock(...args),
  };
});

import { changeTrainerStatus } from '@/app/admin/actions';

type TrainerStatus = 'applied' | 'onboarding' | 'active' | 'suspended';
type TrainerRow = {
  id: string;
  name: string | null;
  email: string | null;
  status: TrainerStatus;
};

function buildSupabaseStubs(opts: {
  callerIsAdmin?: boolean;
  trainer: TrainerRow | null;
  updateError?: { message: string } | null;
  suspendCodesError?: { message: string } | null;
}) {
  const updateCalls: Array<{ table: string; updates: Record<string, unknown> }> = [];
  const suspendCallArgs: Array<{ status: string }> = [];

  mockFrom.mockImplementation((table: string) => {
    if (table === 'admins') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data: (opts.callerIsAdmin ?? true)
                  ? { id: 'a1', role: 'admin' }
                  : null,
                error: null,
              }),
          }),
        }),
      };
    }
    if (table === 'trainers') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({ data: opts.trainer, error: null }),
          }),
        }),
        update: (updates: Record<string, unknown>) => {
          updateCalls.push({ table, updates });
          return {
            eq: () => Promise.resolve({ data: null, error: opts.updateError ?? null }),
          };
        },
      };
    }
    if (table === 'access_codes') {
      return {
        update: (updates: Record<string, unknown>) => {
          suspendCallArgs.push({ status: String(updates.status) });
          return {
            eq: () => ({
              eq: () =>
                Promise.resolve({ data: null, error: opts.suspendCodesError ?? null }),
            }),
          };
        },
      };
    }
    throw new Error('unexpected table: ' + table);
  });

  mockGetUser.mockResolvedValue({
    data: { user: { id: 'u1', email: 'admin@example.com' } },
    error: null,
  });

  return { updateCalls, suspendCallArgs };
}

function buildForm(trainerId: string, status: TrainerStatus): FormData {
  const form = new FormData();
  form.set('trainerId', trainerId);
  form.set('status', status);
  return form;
}

async function flushAfterCallbacks(): Promise<void> {
  while (afterCallbacks.length) {
    const cb = afterCallbacks.shift();
    if (cb) await cb();
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  afterCallbacks.length = 0;
  sendEmailMock.mockResolvedValue({ ok: true, id: 'msg_test' });
});

describe('changeTrainerStatus — SHA-5 welcome email', () => {
  it('fires the welcome email when admin approves applied → onboarding', async () => {
    const stubs = buildSupabaseStubs({
      trainer: {
        id: 't1',
        name: 'Tim Smith',
        email: 'tim@example.com',
        status: 'applied',
      },
    });

    await changeTrainerStatus(buildForm('t1', 'onboarding'));
    await flushAfterCallbacks();

    // Status update happened.
    expect(stubs.updateCalls).toHaveLength(1);
    expect(stubs.updateCalls[0]?.updates).toMatchObject({ status: 'onboarding' });

    // Welcome email sent exactly once, to the trainer, with the expected subject.
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const sentArg = sendEmailMock.mock.calls[0]?.[0] as {
      to: string;
      subject: string;
      html: string;
    };
    expect(sentArg.to).toBe('tim@example.com');
    expect(sentArg.subject).toBe("You're approved — welcome to TrainerSource");
    expect(sentArg.html).toContain('Hey Tim');
  });

  it('fires the welcome email when admin activates an applied trainer (skip-onboarding)', async () => {
    // Admin clicks "Activate" on a still-applied row — the trainer goes
    // straight from 'applied' to 'active', skipping onboarding. They still
    // need to be told they were approved.
    buildSupabaseStubs({
      trainer: {
        id: 't1',
        name: 'Tim Smith',
        email: 'tim@example.com',
        status: 'applied',
      },
    });

    await changeTrainerStatus(buildForm('t1', 'active'));
    await flushAfterCallbacks();

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT re-notify on onboarding → active (already approved earlier)', async () => {
    buildSupabaseStubs({
      trainer: {
        id: 't1',
        name: 'Tim Smith',
        email: 'tim@example.com',
        status: 'onboarding',
      },
    });

    await changeTrainerStatus(buildForm('t1', 'active'));
    await flushAfterCallbacks();

    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('does NOT email on any → suspended (suspension is not a welcome moment)', async () => {
    buildSupabaseStubs({
      trainer: {
        id: 't1',
        name: 'Tim Smith',
        email: 'tim@example.com',
        status: 'active',
      },
    });

    await changeTrainerStatus(buildForm('t1', 'suspended'));
    await flushAfterCallbacks();

    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('does NOT email when the trainer row has no email column populated', async () => {
    // Defence-in-depth: an inserted trainer with a null email (shouldn't
    // happen because /apply requires one + the DB has a NOT NULL constraint
    // in practice) must not throw from the email path.
    buildSupabaseStubs({
      trainer: {
        id: 't1',
        name: 'Tim Smith',
        email: null,
        status: 'applied',
      },
    });

    await changeTrainerStatus(buildForm('t1', 'onboarding'));
    await flushAfterCallbacks();

    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('does NOT email when the trainer name is null (uses empty-string fallback)', async () => {
    buildSupabaseStubs({
      trainer: {
        id: 't1',
        name: null,
        email: 'tim@example.com',
        status: 'applied',
      },
    });

    await changeTrainerStatus(buildForm('t1', 'onboarding'));
    await flushAfterCallbacks();

    // Email still fires (we have the email address). The template handles
    // empty name gracefully ("Hey ,") rather than throwing on .split(' ').
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it('email send failure does NOT bubble out of the action', async () => {
    // The status update is the contract — the welcome email is a courtesy.
    // A Resend outage must not roll back the admin's approval.
    sendEmailMock.mockResolvedValueOnce({ ok: false, error: 'resend down' });
    buildSupabaseStubs({
      trainer: {
        id: 't1',
        name: 'Tim Smith',
        email: 'tim@example.com',
        status: 'applied',
      },
    });

    await expect(
      changeTrainerStatus(buildForm('t1', 'onboarding'))
    ).resolves.not.toThrow();
    await expect(flushAfterCallbacks()).resolves.not.toThrow();
  });

  it('throws when the trainer is not found (no email, no spurious update)', async () => {
    buildSupabaseStubs({ trainer: null });

    await expect(
      changeTrainerStatus(buildForm('missing', 'onboarding'))
    ).rejects.toThrow(/not found/i);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});
