// DEV-ONLY shortcut: password login without going through the magic-link flow.
//
// Triple-guarded:
//   1. NODE_ENV !== 'production'
//   2. ENABLE_DEV_LOGIN=1
//   3. DEV_LOGIN_SECRET set AND matches ?secret= (timing-safe)
// If ANY guard fails the route 404s (treat as not-found, not 403, so scanners
// can't fingerprint).
//
// Even past all three gates, session minting is restricted to a hardcoded
// allowlist (EVAA emails by domain, plus the demo trainer). This prevents
// password-login-as-anyone if the secret ever leaks. Tighten the allowlist
// before adding new dev accounts.
//
// `redirect` param is validated to relative paths only — prevents open-redirect
// abuse (auth-flow phishing). Anything weird falls back to /dashboard.

import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

// Allowlisted dev emails — either an exact match or a domain suffix.
// Keep tight: anyone past the secret can log in as any address here.
const ALLOWED_EMAIL_DOMAINS = ['@evaa.com', '@ultimate-peptides.com'];
const ALLOWED_EMAILS = new Set<string>([
  'demo@trainer-source.com',
]);

// Same shape as demo-login: only relative paths, no protocol-relative,
// no backslash trickery, no embedded CR/LF. Falls back to /dashboard.
const SAFE_REDIRECT_RE = /^\/[a-zA-Z0-9_\-/?&=%.]*$/;
function sanitizeRedirect(raw: string | null): string {
  if (!raw) return '/dashboard';
  if (raw.startsWith('//') || raw.startsWith('/\\')) return '/dashboard';
  if (!SAFE_REDIRECT_RE.test(raw)) return '/dashboard';
  return raw;
}

function emailAllowed(email: string): boolean {
  const lower = email.toLowerCase();
  if (ALLOWED_EMAILS.has(lower)) return true;
  return ALLOWED_EMAIL_DOMAINS.some((d) => lower.endsWith(d));
}

function timingSafeEqualStrings(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

export async function GET(request: Request) {
  const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
  const expectedSecret = process.env.DEV_LOGIN_SECRET;

  // Gates 1+2 (env): 404 (not 403) so the route is unfingerprintable in prod.
  if (
    process.env.NODE_ENV === 'production' ||
    process.env.ENABLE_DEV_LOGIN !== '1' ||
    !expectedSecret
  ) {
    console.info('[dev-login] denied: env-gate', { ip });
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const url = new URL(request.url);
  const email = url.searchParams.get('email');
  const password = url.searchParams.get('password');
  const secret = url.searchParams.get('secret');
  const safeRedirect = sanitizeRedirect(url.searchParams.get('redirect'));

  if (!email || !password || !secret) {
    console.info('[dev-login] denied: missing-params', { ip, email: email ?? null });
    return NextResponse.json(
      { error: 'email + password + secret required' },
      { status: 400 },
    );
  }

  // Gate 3: timing-safe secret comparison.
  if (!timingSafeEqualStrings(secret, expectedSecret)) {
    console.info('[dev-login] denied: bad-secret', { ip, email });
    return NextResponse.json({ error: 'invalid secret' }, { status: 401 });
  }

  // Allowlist: even with the secret, only dev accounts can be minted.
  if (!emailAllowed(email)) {
    console.info('[dev-login] denied: email-not-allowlisted', { ip, email });
    return NextResponse.json({ error: 'invalid secret' }, { status: 401 });
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    console.info('[dev-login] denied: supabase-auth', { ip, email, msg: error.message });
    return NextResponse.json({ error: error.message }, { status: 401 });
  }

  console.info('[dev-login] allowed', { ip, email, redirect: safeRedirect });
  return NextResponse.redirect(new URL(safeRedirect, request.url));
}
