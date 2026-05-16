// tests/lib/auth.test.ts
//
// Unit coverage for `normalizeEmail` — the helper added in T2.13 to fix
// case-insensitive email matching across the codebase. Every site that
// reads/writes an email-keyed row goes through this helper, so the contract
// here is load-bearing for login, onboarding, dashboard, admin, commissions,
// payouts, codes-generate, demo-login, and telegram verify-login.

import { describe, expect, it } from 'vitest';

import { normalizeEmail } from '@/lib/auth';

describe('normalizeEmail', () => {
  it('returns null for null/undefined/empty input', () => {
    expect(normalizeEmail(null)).toBeNull();
    expect(normalizeEmail(undefined)).toBeNull();
    expect(normalizeEmail('')).toBeNull();
  });

  it('returns null for whitespace-only input', () => {
    expect(normalizeEmail('   ')).toBeNull();
    expect(normalizeEmail('\t\n')).toBeNull();
  });

  it('lower-cases an already-trimmed mixed-case email', () => {
    expect(normalizeEmail('John@Example.COM')).toBe('john@example.com');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeEmail('  trainer@x.com  ')).toBe('trainer@x.com');
  });

  it('combines trim + lower-case', () => {
    expect(normalizeEmail('  Trainer@X.COM \n')).toBe('trainer@x.com');
  });

  it('is a no-op on an already-normalised email', () => {
    expect(normalizeEmail('trainer@x.com')).toBe('trainer@x.com');
  });
});
