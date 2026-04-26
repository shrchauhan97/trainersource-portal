import { createHmac, timingSafeEqual } from 'node:crypto';

const TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
const CLOCK_SKEW_TOLERANCE_SECONDS = 60;

function getSecret(): Buffer {
  const secret = process.env.ACCESS_GATE_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      'ACCESS_GATE_SESSION_SECRET must be set to a string of at least 32 characters',
    );
  }
  return Buffer.from(secret, 'utf8');
}

export function mintSessionToken(customerId: string, nowSeconds?: number): string {
  const issuedAt = nowSeconds ?? Math.floor(Date.now() / 1000);
  const payload = `${customerId}.${issuedAt}`;
  const sig = createHmac('sha256', getSecret()).update(payload).digest();
  const payloadB64 = Buffer.from(payload, 'utf8').toString('base64url');
  const sigB64 = sig.toString('base64url');
  return `${payloadB64}.${sigB64}`;
}

export function verifySessionToken(
  token: unknown,
  nowSeconds?: number,
): { customerId: string } | null {
  if (typeof token !== 'string' || token.length < 10 || token.length > 512) return null;

  const parts = token.split('.');
  if (parts.length !== 2) return null;

  let payloadBuf: Buffer;
  let sigBuf: Buffer;
  try {
    payloadBuf = Buffer.from(parts[0], 'base64url');
    sigBuf = Buffer.from(parts[1], 'base64url');
  } catch {
    return null;
  }

  const expectedSig = createHmac('sha256', getSecret()).update(payloadBuf).digest();
  if (expectedSig.length !== sigBuf.length) return null;
  if (!timingSafeEqual(expectedSig, sigBuf)) return null;

  const payload = payloadBuf.toString('utf8');
  const dot = payload.lastIndexOf('.');
  if (dot <= 0 || dot === payload.length - 1) return null;

  const customerId = payload.slice(0, dot);
  const issuedAtStr = payload.slice(dot + 1);
  const issuedAt = Number(issuedAtStr);
  if (!Number.isFinite(issuedAt) || !Number.isInteger(issuedAt)) return null;

  const now = nowSeconds ?? Math.floor(Date.now() / 1000);
  const age = now - issuedAt;
  if (age > TOKEN_TTL_SECONDS) return null;
  if (age < -CLOCK_SKEW_TOLERANCE_SECONDS) return null;

  if (!customerId) return null;

  return { customerId };
}
