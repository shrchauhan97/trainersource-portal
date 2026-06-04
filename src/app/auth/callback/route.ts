import { NextResponse, type NextRequest } from 'next/server';

import { getUserRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

function getLoginUrl(request: NextRequest, error?: string) {
  const loginUrl = new URL('/login', request.url);

  if (error) {
    loginUrl.searchParams.set('error', error);
  }

  return loginUrl;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const intent = request.nextUrl.searchParams.get('intent');

  if (!code) {
    return NextResponse.redirect(getLoginUrl(request, 'auth_callback_failed'));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
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

  const role = await getUserRole(user.email);

  if (role === 'suspended') {
    await supabase.auth.signOut();
    return NextResponse.redirect(getLoginUrl(request, 'suspended'));
  }

  if (role !== 'admin' && role !== 'trainer' && role !== 'onboarding') {
    await supabase.auth.signOut();
    return NextResponse.redirect(getLoginUrl(request, 'not_authorized'));
  }

  const next =
    role === 'admin' ? '/admin' : role === 'onboarding' ? '/onboarding' : '/dashboard';

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
