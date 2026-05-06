// Demo-only sign-in shortcut for live walkthroughs where the demo trainer's
// email doesn't exist as a real inbox (so the normal magic-link flow can't
// reach them). Generates a fresh email OTP via the admin API, then redeems
// it via verifyOtp on the SSR client — verifyOtp doesn't require PKCE state
// the way exchangeCodeForSession does, so it works from any browser.
//
// Locked behind DEMO_LOGIN_SECRET. Without that env var set, this route 404s.
// Treat the secret like a password — anyone with it can log in as any
// existing trainer.

import { NextResponse, type NextRequest } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createClient as createSSRClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const expectedSecret = process.env.DEMO_LOGIN_SECRET;
  if (!expectedSecret) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const email = request.nextUrl.searchParams.get('email');
  const secret = request.nextUrl.searchParams.get('secret');
  const next = request.nextUrl.searchParams.get('next') ?? '/dashboard';

  if (!email || !secret) {
    return NextResponse.json({ error: 'email + secret required' }, { status: 400 });
  }
  if (secret !== expectedSecret) {
    return NextResponse.json({ error: 'invalid secret' }, { status: 401 });
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  if (linkErr || !linkData?.properties?.email_otp) {
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
    return NextResponse.json({ error: verifyErr.message }, { status: 401 });
  }

  return NextResponse.redirect(new URL(next, request.url));
}
