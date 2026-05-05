// DEV-ONLY shortcut: password login without going through the magic-link flow.
// Double-guarded: refuses to run in production AND requires ENABLE_DEV_LOGIN=1.
// If both guards were ever misconfigured simultaneously on a public deploy,
// this would be a password-login-as-anyone bypass, so keep both locks on.

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === 'production' || process.env.ENABLE_DEV_LOGIN !== '1') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const email = request.nextUrl.searchParams.get('email');
  const password = request.nextUrl.searchParams.get('password');
  const redirectPath = request.nextUrl.searchParams.get('redirect') ?? '/';

  if (!email || !password) {
    return NextResponse.json({ error: 'email + password required' }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }

  return NextResponse.redirect(new URL(redirectPath, request.url));
}
