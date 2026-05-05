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

  if (role === 'admin') {
    return NextResponse.redirect(new URL('/admin', request.url));
  }

  if (role === 'trainer') {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  if (role === 'suspended') {
    await supabase.auth.signOut();
    return NextResponse.redirect(getLoginUrl(request, 'suspended'));
  }

  await supabase.auth.signOut();

  return NextResponse.redirect(getLoginUrl(request, 'not_authorized'));
}
