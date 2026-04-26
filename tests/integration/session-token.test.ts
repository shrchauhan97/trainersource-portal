import { beforeAll, describe, expect, it } from 'vitest';

describe('session-token', () => {
  beforeAll(() => {
    process.env.ACCESS_GATE_SESSION_SECRET =
      'test-secret-at-least-32-characters-long-abcdef01234';
  });

  it('round-trips a freshly minted token', async () => {
    const { mintSessionToken, verifySessionToken } = await import('@/lib/session-token');
    const token = mintSessionToken('customer-123');
    expect(verifySessionToken(token)).toEqual({ customerId: 'customer-123' });
  });

  it('rejects a token with a tampered payload', async () => {
    const { mintSessionToken, verifySessionToken } = await import('@/lib/session-token');
    const token = mintSessionToken('customer-123');
    const [, sig] = token.split('.');
    const forgedPayload = Buffer.from('attacker.9999999999', 'utf8').toString('base64url');
    const forged = `${forgedPayload}.${sig}`;
    expect(verifySessionToken(forged)).toBeNull();
  });

  it('rejects a token with a tampered signature', async () => {
    const { mintSessionToken, verifySessionToken } = await import('@/lib/session-token');
    const token = mintSessionToken('customer-123');
    const [payload] = token.split('.');
    const forgedSig = Buffer.alloc(32, 0xaa).toString('base64url');
    expect(verifySessionToken(`${payload}.${forgedSig}`)).toBeNull();
  });

  it('rejects expired tokens', async () => {
    const { mintSessionToken, verifySessionToken } = await import('@/lib/session-token');
    const longAgo = Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 31;
    const token = mintSessionToken('customer-123', longAgo);
    expect(verifySessionToken(token)).toBeNull();
  });

  it('rejects garbage input', async () => {
    const { verifySessionToken } = await import('@/lib/session-token');
    expect(verifySessionToken(null)).toBeNull();
    expect(verifySessionToken('')).toBeNull();
    expect(verifySessionToken('not-a-token')).toBeNull();
    expect(verifySessionToken('only.one.dot.too.many')).toBeNull();
    expect(verifySessionToken(123 as unknown)).toBeNull();
  });

  it('throws when the secret is missing or too short', async () => {
    const originalSecret = process.env.ACCESS_GATE_SESSION_SECRET;
    try {
      delete process.env.ACCESS_GATE_SESSION_SECRET;
      const { mintSessionToken } = await import('@/lib/session-token');
      expect(() => mintSessionToken('customer-123')).toThrow();

      process.env.ACCESS_GATE_SESSION_SECRET = 'too-short';
      expect(() => mintSessionToken('customer-123')).toThrow();
    } finally {
      process.env.ACCESS_GATE_SESSION_SECRET = originalSecret;
    }
  });
});
