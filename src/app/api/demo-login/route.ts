// Demo-only sign-in shortcut for live walkthroughs where the demo trainer's
// email doesn't exist as a real inbox (so the normal magic-link flow can't
// reach them). Generates a fresh email OTP via the admin API, then redeems
// it via verifyOtp on the SSR client — verifyOtp doesn't require PKCE state
// the way exchangeCodeForSession does, so it works from any browser.
//
// Locked behind DEMO_LOGIN_SECRET. Without that env var set, this route 404s.
// Treat the secret like a password — anyone with it can log in as any
// existing non-admin trainer (admins are explicitly refused so a leaked secret
// can't be used to pivot trainer -> admin via this endpoint).
//
// Hardening (Wave 2 T2.3):
//   1. `next` is validated as a same-origin relative path; anything else
//      (full URLs, protocol-relative `//`, backslash-mangled `\\`) falls back
//      to `/dashboard` — closes the open-redirect phishing vector.
//   2. The target email MUST resolve to a trainer row. Admin emails are
//      refused with 403 (don't let demo-login bridge non-admin -> admin).
//      Missing emails return 404 without revealing whether the email exists
//      in auth.users.
//   3. Secret comparison is timing-safe via `crypto.timingSafeEqual` against
//      equal-length buffers; the length-mismatch path returns 401 without
//      invoking the comparator.
//   4. Every attempt — success or failure — is logged via console.info with
//      email + ip + outcome (NEVER the secret) for forensics.
//
// Kill switch: unset `DEMO_LOGIN_SECRET` in the environment. The route then
// 404s on every request before doing any work.

import crypto from 'node:crypto';

import { NextResponse } from 'next/server';
import { createClient as createSSRClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

export const runtime = 'nodejs';

// Default landing for a freshly-minted demo session.
const DEFAULT_NEXT = '/dashboard';

// Same-origin relative path matcher.
//   - MUST start with a single `/`
//   - MUST NOT start with `//` or `/\` (protocol-relative / backslash-mangled)
//   - body limited to URL-safe characters we actually use in app paths
// This deliberately rejects `https://evil`, `//evil.com`, `/\\evil.com`, and
// anything containing whitespace, `@`, `:`, or other URL meta-characters that
// could break out of the same-origin guarantee.
const SAFE_NEXT_RE = /^\/[a-zA-Z0-9_\-/?&=%.]*$/;

function isSafeRelativePath(value: string | null | undefined): value is string {
  if (!value) return false;
  // Reject protocol-relative and backslash-mangled prefixes BEFORE the regex
  // check (a future regex tweak shouldn't reopen the hole).
  if (value.startsWith('//') || value.startsWith('/\\')) return false;
  return SAFE_NEXT_RE.test(value);
}

// Constant-time secret comparison. `crypto.timingSafeEqual` itself throws on
// length mismatch; checking length first avoids that and short-circuits at
// the same time. Returns false if either side is empty.
function timingSafeStringEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function getClientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return (
    request.headers.get('x-real-ip') ??
    request.headers.get('cf-connecting-ip') ??
    'unknown'
  );
}

type AttemptLog = {
  email: string | null;
  ip: string;
  outcome:
    | 'no_secret_env'
    | 'missing_params'
    | 'invalid_secret'
    | 'not_a_trainer'
    | 'admin_refused'
    | 'generate_link_failed'
    | 'verify_otp_failed'
    | 'success';
  next?: string;
  next_rejected?: string;
};

function logAttempt(entry: AttemptLog): void {
  // console.info goes to platform stdout — pick this up via Vercel/Railway
  // log search when investigating suspicious activity. NEVER include the
  // secret value or the generated OTP in this log line.
  console.info('[demo-login]', JSON.stringify(entry));
}

export async function GET(request: Request) {
  const ip = getClientIp(request);

  const expectedSecret = process.env.DEMO_LOGIN_SECRET;
  if (!expectedSecret) {
    logAttempt({ email: null, ip, outcome: 'no_secret_env' });
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const url = new URL(request.url);
  const rawEmail = url.searchParams.get('email');
  const secret = url.searchParams.get('secret');
  const rawNext = url.searchParams.get('next');

  // Normalize email for consistent lookup (trainers table emails are
  // stored lower-case throughout the codebase — see src/lib/auth.ts:26).
  const email = rawEmail?.trim().toLowerCase() || null;

  if (!email || !secret) {
    logAttempt({ email, ip, outcome: 'missing_params' });
    return NextResponse.json({ error: 'email + secret required' }, { status: 400 });
  }

  if (!timingSafeStringEqual(secret, expectedSecret)) {
    logAttempt({ email, ip, outcome: 'invalid_secret' });
    return NextResponse.json({ error: 'invalid secret' }, { status: 401 });
  }

  // Validate `next` BEFORE issuing the session so a malformed value is
  // surfaced in the attempt log even on the happy path.
  let next = DEFAULT_NEXT;
  let nextRejected: string | undefined;
  if (rawNext !== null) {
    if (isSafeRelativePath(rawNext)) {
      next = rawNext;
    } else {
      nextRejected = rawNext;
    }
  }

  const service = createServiceClient();

  // Refuse admin emails outright — demo-login must never bridge to admin.
  // Checked against `admins` table (the authoritative source — see
  // src/lib/auth.ts:34-39 and src/app/api/trainers/route.ts:24-29).
  const { data: adminRow, error: adminErr } = await service
    .from('admins')
    .select('id')
    .eq('email', email)
    .maybeSingle<{ id: string }>();

  if (adminErr) {
    console.error('[demo-login] admin lookup failed:', adminErr);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }

  if (adminRow) {
    logAttempt({ email, ip, outcome: 'admin_refused' });
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // The email MUST resolve to a trainer. 404 (not 401/403) so we don't
  // leak which auth.users emails exist.
  const { data: trainerRow, error: trainerErr } = await service
    .from('trainers')
    .select('id')
    .eq('email', email)
    .maybeSingle<{ id: string }>();

  if (trainerErr) {
    console.error('[demo-login] trainer lookup failed:', trainerErr);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }

  if (!trainerRow) {
    logAttempt({ email, ip, outcome: 'not_a_trainer' });
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const { data: linkData, error: linkErr } = await service.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  if (linkErr || !linkData?.properties?.email_otp) {
    logAttempt({ email, ip, outcome: 'generate_link_failed' });
    return NextResponse.json(
      { error: linkErr?.message ?? 'Could not generate OTP' },
      { status: 500 },
    );
  }

  const supabase = await createSSRClient();
  const { error: verifyErr } = await supabase.auth.verifyOtp({
    email,
    token: linkData.properties.email_otp,
    type: 'email',
  });
  if (verifyErr) {
    logAttempt({ email, ip, outcome: 'verify_otp_failed' });
    return NextResponse.json({ error: verifyErr.message }, { status: 401 });
  }

  logAttempt({
    email,
    ip,
    outcome: 'success',
    next,
    ...(nextRejected !== undefined ? { next_rejected: nextRejected } : {}),
  });

  return NextResponse.redirect(new URL(next, request.url));
}
