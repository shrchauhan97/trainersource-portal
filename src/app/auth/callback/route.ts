import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';

import { getUserRole, normalizeSessionEmail } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

function getLoginUrl(request: NextRequest, error?: string) {
  const loginUrl = new URL('/login', request.url);

  if (error) {
    loginUrl.searchParams.set('error', error);
  }

  return loginUrl;
}

type AuthCallbackParams = {
  token_hash: string | null;
  type: string | null;
  code: string | null;
  intent: string | null;
};

function readFormField(value: FormDataEntryValue | null): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function handleAuthCallback(request: NextRequest, params: AuthCallbackParams) {
  const { token_hash, type, code, intent } = params;

  const supabase = await createClient();

  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash,
      type: type as EmailOtpType,
    });
    if (error) {
      console.error('[auth/callback] verifyOtp failed', {
        code: error.code,
        message: error.message,
      });
      Sentry.captureMessage('auth/callback: verifyOtp failed', {
        level: 'warning',
        extra: { code: error.code, message: error.message },
      });
      return NextResponse.redirect(getLoginUrl(request, 'auth_callback_failed'));
    }
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error('[auth/callback] exchangeCodeForSession failed', {
        code: error.code,
        message: error.message,
      });
      Sentry.captureMessage('auth/callback: exchangeCodeForSession failed', {
        level: 'warning',
        extra: { code: error.code, message: error.message },
      });
      return NextResponse.redirect(getLoginUrl(request, 'auth_callback_failed'));
    }
  } else {
    console.error('[auth/callback] missing token_hash/type and code');
    Sentry.captureMessage('auth/callback: missing auth params', { level: 'warning' });
    return NextResponse.redirect(getLoginUrl(request, 'auth_callback_failed'));
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user?.email) {
    await supabase.auth.signOut();
    return NextResponse.redirect(getLoginUrl(request, 'auth_callback_failed'));
  }

  const sessionEmail = normalizeSessionEmail(user.email);
  if (!sessionEmail) {
    await supabase.auth.signOut();
    return NextResponse.redirect(getLoginUrl(request, 'auth_callback_failed'));
  }

  const role = await getUserRole(sessionEmail);

  if (role === 'suspended') {
    await supabase.auth.signOut();
    return NextResponse.redirect(getLoginUrl(request, 'suspended'));
  }

  if (role !== 'admin' && role !== 'trainer') {
    await supabase.auth.signOut();
    return NextResponse.redirect(getLoginUrl(request, 'not_authorized'));
  }

  let next = '/dashboard';

  if (role === 'admin') {
    next = '/admin';
  } else {
    const { data: trainer } = await supabase
      .from('trainers')
      .select('status')
      .eq('email', sessionEmail)
      .maybeSingle();

    if (
      trainer?.status === 'onboarding' ||
      trainer?.status === 'onboarding_completed'
    ) {
      next = '/onboarding';
    }
  }

  // Reset flow always goes through set-password; first-time logins (no
  // password set yet) likewise. Password-bearing returning users skip.
  if (intent === 'reset') {
    return NextResponse.redirect(new URL(`/account/set-password?next=${encodeURIComponent(next)}`, request.url));
  }

  const { data: hasPwd, error: rpcError } = await supabase.rpc('user_has_password', { uid: user.id });
  if (rpcError) {
    console.error('[auth/callback] user_has_password rpc failed', {
      uid: user.id,
      code: rpcError.code,
      message: rpcError.message,
    });
    Sentry.captureMessage('auth/callback: user_has_password rpc failed', {
      level: 'error',
      extra: { uid: user.id, code: rpcError.code, message: rpcError.message },
    });
    return NextResponse.redirect(getLoginUrl(request, 'auth_callback_failed'));
  }

  // hasPwd is strictly true | false here. `=== false` ensures any future
  // ternary value doesn't silently fold into the reset branch (Wave-7
  // taught us the cost of treating "unknown" as a happy-path signal).
  if (hasPwd === false) {
    return NextResponse.redirect(new URL(`/account/set-password?next=${encodeURIComponent(next)}`, request.url));
  }

  return NextResponse.redirect(new URL(next, request.url));
}

export async function GET(request: NextRequest) {
  return handleAuthCallback(request, {
    token_hash: request.nextUrl.searchParams.get('token_hash'),
    type: request.nextUrl.searchParams.get('type'),
    code: request.nextUrl.searchParams.get('code'),
    intent: request.nextUrl.searchParams.get('intent'),
  });
}

/** Redeems magic-link tokens submitted from /auth/confirm (POST avoids mail-scanner GET prefetch). */
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  return handleAuthCallback(request, {
    token_hash: readFormField(formData.get('token_hash')),
    type: readFormField(formData.get('type')),
    code: null,
    intent: readFormField(formData.get('intent')),
  });
}
