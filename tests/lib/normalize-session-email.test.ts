// Regression coverage for AGGREGATE.md T2.13.
//
// trainers / admins rows are persisted with their email lower-cased — the
// /apply form, login/actions.ts, admin/actions.ts and the seed migration all
// run `.trim().toLowerCase()` on insert/update. But `supabase.auth.getUser()`
// echoes back the exact string the user typed into the magic-link / password
// form, including upper-case variants like `Alice@Example.COM`. Comparing
// that raw session email to the stored lower-case column silently misses, so
// the trainer / admin lands on the unauthorized branch.
//
// normalizeSessionEmail() is the canonical fix. Every call site that compares
// a session email against trainers.email / admins.email runs through it.
import { describe, it, expect } from 'vitest';
import { normalizeSessionEmail } from '@/lib/auth';

describe('normalizeSessionEmail()', () => {
  it('returns null for null / undefined input', () => {
    expect(normalizeSessionEmail(null)).toBeNull();
    expect(normalizeSessionEmail(undefined)).toBeNull();
  });

  it('returns null for an empty or whitespace-only string', () => {
    expect(normalizeSessionEmail('')).toBeNull();
    expect(normalizeSessionEmail('   ')).toBeNull();
    expect(normalizeSessionEmail('\t\n')).toBeNull();
  });

  it('lower-cases the local part', () => {
    expect(normalizeSessionEmail('Alice@example.com')).toBe('alice@example.com');
    expect(normalizeSessionEmail('AlIcE@example.com')).toBe('alice@example.com');
  });

  it('lower-cases the domain part', () => {
    expect(normalizeSessionEmail('alice@Example.COM')).toBe('alice@example.com');
    expect(normalizeSessionEmail('alice@EXAMPLE.com')).toBe('alice@example.com');
  });

  it('lower-cases both local and domain together', () => {
    expect(normalizeSessionEmail('Alice@Example.COM')).toBe('alice@example.com');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeSessionEmail('  alice@example.com  ')).toBe('alice@example.com');
    expect(normalizeSessionEmail('\talice@example.com\n')).toBe('alice@example.com');
  });

  it('combines trim + lowercase', () => {
    expect(normalizeSessionEmail('  Alice@Example.COM  ')).toBe('alice@example.com');
  });

  it('is a no-op on an already-normalized email', () => {
    expect(normalizeSessionEmail('alice@example.com')).toBe('alice@example.com');
  });

  it('preserves the + alias separator used by /iamtrainer testing', () => {
    expect(normalizeSessionEmail('Alice+Trainer@Example.com')).toBe(
      'alice+trainer@example.com',
    );
  });

  it('preserves non-ASCII characters (IDN domains, unicode local parts)', () => {
    // We don't punycode-normalize — Supabase auth stores the raw string and
    // so does our `trainers.email` column. As long as both sides are lowered
    // consistently the match works.
    expect(normalizeSessionEmail('ALICE@münchen.de')).toBe('alice@münchen.de');
  });
});
