// tests/lib/bigcommerce-create-customer.test.ts
//
// SHA-122: createBigCommerceCustomer must include an `authentication` block
// (force_password_reset: true + a strong random new_password) on every
// customer-create POST so the BC account lands with valid credentials AND a
// reset-required flag. Before this fix the POST body carried only
// email/first/last name, so the customer had no way to authenticate on a
// future device — the validate route would just keep minting a fresh,
// equally-passwordless row.
//
// We also pin the `{id, created}` return contract: a fresh POST is
// `created: true`; the 422 duplicate-fallback path returns `created: false`
// so the validate route can decide whether to send the welcome email.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createBigCommerceCustomer,
  generateBigCommercePassword,
} from '@/lib/bigcommerce';

const fetchSpy = vi.fn();

beforeEach(() => {
  fetchSpy.mockReset();
  vi.stubGlobal('fetch', fetchSpy);
  vi.unstubAllEnvs();
  vi.stubEnv('BIGCOMMERCE_STORE_HASH', 'teststore');
  vi.stubEnv('BIGCOMMERCE_ACCESS_TOKEN', 'test-token');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('generateBigCommercePassword', () => {
  it('produces a non-empty string with at least one upper, one lower, one digit', () => {
    for (let i = 0; i < 25; i++) {
      const pwd = generateBigCommercePassword();
      expect(pwd.length).toBeGreaterThanOrEqual(16);
      // BC's default policy requires upper + lower + digit. The `A1!`
      // suffix the helper appends guarantees all three even when the
      // base64url body happens to skew one way.
      expect(pwd).toMatch(/[A-Z]/);
      expect(pwd).toMatch(/[a-z]/);
      expect(pwd).toMatch(/[0-9]/);
    }
  });

  it('produces a fresh value on each call (random entropy, not a constant)', () => {
    const a = generateBigCommercePassword();
    const b = generateBigCommercePassword();
    expect(a).not.toBe(b);
  });
});

describe('createBigCommerceCustomer', () => {
  it('POSTs an authentication block with force_password_reset + a non-empty new_password', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse(200, { data: [{ id: 4242 }] }),
    );

    const result = await createBigCommerceCustomer({
      email: 'jordan@example.com',
      first_name: 'Jordan',
      last_name: 'Lee',
    });

    expect(result).toEqual({ id: 4242, created: true });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toBe(
      'https://api.bigcommerce.com/stores/teststore/v3/customers',
    );
    expect((init as RequestInit).method).toBe('POST');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(Array.isArray(body)).toBe(true);
    const row = body[0];
    expect(row.email).toBe('jordan@example.com');
    expect(row.first_name).toBe('Jordan');
    expect(row.last_name).toBe('Lee');
    expect(row.authentication).toBeDefined();
    expect(row.authentication.force_password_reset).toBe(true);
    expect(typeof row.authentication.new_password).toBe('string');
    expect(row.authentication.new_password.length).toBeGreaterThanOrEqual(16);
  });

  it('lowercases + trims the email and trims the name on the way out', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse(200, { data: [{ id: 1 }] }),
    );

    await createBigCommerceCustomer({
      email: '  Mixed.Case@Example.COM  ',
      first_name: '  Casey  ',
      last_name: '  Park  ',
    });

    const body = JSON.parse(
      (fetchSpy.mock.calls[0]![1] as RequestInit).body as string,
    );
    expect(body[0].email).toBe('mixed.case@example.com');
    expect(body[0].first_name).toBe('Casey');
    expect(body[0].last_name).toBe('Park');
  });

  it('on a 422 duplicate-email response, falls back to the existing customer and reports created:false', async () => {
    // First POST: BC rejects with 422 (duplicate email).
    fetchSpy.mockResolvedValueOnce(
      jsonResponse(422, { title: 'Email already used' }),
    );
    // Second call: GET by email returns the pre-existing row.
    fetchSpy.mockResolvedValueOnce(
      jsonResponse(200, { data: [{ id: 5050 }] }),
    );

    const result = await createBigCommerceCustomer({
      email: 'taken@example.com',
      first_name: 'A',
      last_name: 'B',
    });

    expect(result).toEqual({ id: 5050, created: false });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(String(fetchSpy.mock.calls[1]![0])).toContain(
      '/customers?email:in=taken%40example.com',
    );
  });

  it('non-422 errors propagate (we only special-case the duplicate path)', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse(500, { title: 'BigCommerce on fire' }),
    );

    await expect(
      createBigCommerceCustomer({
        email: 'a@b.co',
        first_name: 'A',
        last_name: 'B',
      }),
    ).rejects.toThrow(/BigCommerce on fire/);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
