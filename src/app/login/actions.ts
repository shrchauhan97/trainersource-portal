'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { getUserRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

export type CheckEmailResult =
  | {
      allowed: false;
      reason: 'not_authorized' | 'suspended' | 'rate_limited' | 'invalid' | 'server_error';
    }
  | { allowed: true; hasPassword: boolean };

export type SignInResult =
  | { ok: true; next: string }
  | { ok: false; reason: 'invalid_credentials' | 'not_authorized' | 'suspended' | 'server_error' };

// Per-instance, per-bucket-prefix token bucket. Reset every WINDOW_MS.
// Buckets are keyed `<prefix>:<ip>` so the email-check and password-
// signin throttles don't share quota — a user who probed 10 emails
// can still try their password without an immediate lockout.
//
// Known limitation (tracked for a follow-up infra PR): this is local
// to the Node instance; effective limit scales with concurrent lambdas.
// Move to Vercel KV / Upstash when we settle on a shared store.
const BUCKET = new Map<string, { count: number; resetAt: number }>();
const LIMIT = 10;
const WINDOW_MS = 60_000;
const MAX_BUCKET_KEYS = 5_000;
let unknownIpWarned = false;

function rateLimit(key: string): boolean {
  const now = Date.now();
  if (BUCKET.size > MAX_BUCKET_KEYS) {
    for (const [k, v] of BUCKET) {
      if (v.resetAt < now) BUCKET.delete(k);
      if (BUCKET.size <= MAX_BUCKET_KEYS) break;
    }
  }
  const entry = BUCKET.get(key);
  if (!entry || entry.resetAt < now) {
    BUCKET.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= LIMIT) return false;
  entry.count += 1;
  return true;
}

async function clientIp(): Promise<string | null> {
  const hdrs = await headers();
  const xff = hdrs.get('x-forwarded-for')?.split(',')[0]?.trim();
  const real = hdrs.get('x-real-ip');
  return xff || real || null;
}

// Fail-CLOSED on unknown IP — a misconfigured proxy that strips
// x-forwarded-for must not silently disable the throttle. On Vercel
// the header is always set; an unknown-IP request is therefore a
// configuration smell worth logging the first time we see it.
async function rateLimitOrReject(bucketPrefix: 'email' | 'signin'): Promise<boolean> {
  const ip = await clientIp();
  if (!ip) {
    if (!unknownIpWarned) {
      console.warn('[login/actions] no client IP available — failing closed on rate limit');
      unknownIpWarned = true;
    }
    return false;
  }
  return rateLimit(`${bucketPrefix}:${ip}`);
}

export async function checkEmailAllowed(rawEmail: string): Promise<CheckEmailResult> {
  const email = (rawEmail || '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { allowed: false, reason: 'invalid' };
  }

  if (!(await rateLimitOrReject('email'))) {
    return { allowed: false, reason: 'rate_limited' };
  }

  const supabase = createServiceClient();

  const { data: admin, error: adminError } = await supabase
    .from('admins')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (adminError) {
    console.error('[checkEmailAllowed] admins lookup failed', { email, code: adminError.code, message: adminError.message });
    return { allowed: false, reason: 'server_error' };
  }

  if (!admin) {
    const { data: trainer, error: trainerError } = await supabase
      .from('trainers')
      .select('id, status')
      .eq('email', email)
      .maybeSingle();

    if (trainerError) {
      console.error('[checkEmailAllowed] trainers lookup failed', {
        email,
        code: trainerError.code,
        message: trainerError.message,
      });
      return { allowed: false, reason: 'server_error' };
    }

    if (!trainer) return { allowed: false, reason: 'not_authorized' };
    if (trainer.status === 'suspended') return { allowed: false, reason: 'suspended' };
    if (trainer.status !== 'active') return { allowed: false, reason: 'not_authorized' };
  }

  const { data: hasPwd, error: rpcError } = await supabase.rpc('user_has_password_by_email', {
    addr: email,
  });
  if (rpcError) {
    console.error('[checkEmailAllowed] user_has_password_by_email rpc failed', {
      email,
      code: rpcError.code,
      message: rpcError.message,
    });
    return { allowed: false, reason: 'server_error' };
  }

  return { allowed: true, hasPassword: hasPwd === true };
}

export async function signInWithPasswordAction(
  rawEmail: string,
  rawPassword: string
): Promise<SignInResult> {
  const email = (rawEmail || '').trim().toLowerCase();
  const password = rawPassword || '';
  if (!email || !password) {
    return { ok: false, reason: 'invalid_credentials' };
  }

  if (!(await rateLimitOrReject('signin'))) {
    return { ok: false, reason: 'server_error' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session || !data.user?.email) {
    // Match on Supabase's typed error.code (or HTTP 400) — the message
    // string is localized + reworded across SDK versions and would
    // silently flip "wrong password" into "server error" on rewrite.
    const isInvalidCredentials =
      error?.code === 'invalid_credentials' ||
      error?.status === 400 ||
      (!error && (!data.session || !data.user?.email));
    if (error && !isInvalidCredentials) {
      console.error('[signInWithPassword] non-credential error', {
        email,
        code: error.code,
        status: error.status,
        message: error.message,
      });
      return { ok: false, reason: 'server_error' };
    }
    return { ok: false, reason: 'invalid_credentials' };
  }

  let role: Awaited<ReturnType<typeof getUserRole>>;
  try {
    role = await getUserRole(data.user.email);
  } catch (err) {
    console.error('[signInWithPassword] getUserRole failed', { email, err });
    await supabase.auth.signOut();
    return { ok: false, reason: 'server_error' };
  }

  if (role === 'suspended') {
    await supabase.auth.signOut();
    return { ok: false, reason: 'suspended' };
  }
  if (role !== 'admin' && role !== 'trainer') {
    await supabase.auth.signOut();
    return { ok: false, reason: 'not_authorized' };
  }

  return { ok: true, next: role === 'admin' ? '/admin' : '/dashboard' };
}

// Server action that redirects after success. Used by the form so that
// SSR sees the session cookie on the very next request — calling
// signInWithPassword on the client would only mint a localStorage
// session that the server can't see until the next page load.
export async function signInRedirect(formData: FormData): Promise<{ error?: string }> {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');
  const result = await signInWithPasswordAction(email, password);
  if (!result.ok) {
    const copy: Record<typeof result.reason, string> = {
      invalid_credentials: 'Incorrect email or password.',
      not_authorized: 'Your email is not authorized to access TrainerSource.',
      suspended: 'Your account has been suspended. Contact support to restore access.',
      server_error: 'Something went wrong. Please try again in a moment.',
    };
    return { error: copy[result.reason] };
  }
  redirect(result.next);
}
