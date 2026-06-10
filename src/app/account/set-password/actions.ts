'use server';

import { redirect } from 'next/navigation';

import { getUserRole, normalizeSessionEmail } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

import { PASSWORD_HINT, PASSWORD_REGEX } from './password-policy';
import { safeNext } from './safe-next';

export type SetPasswordResult = { error?: string };

export async function setPassword(formData: FormData): Promise<SetPasswordResult> {
  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirm') ?? '');
  const rawNext = formData.get('next');
  const next = safeNext(typeof rawNext === 'string' ? rawNext : null, '/dashboard');

  if (!PASSWORD_REGEX.test(password)) {
    return { error: PASSWORD_HINT };
  }
  if (password !== confirm) {
    return { error: 'Passwords do not match.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  const sessionEmail = normalizeSessionEmail(user?.email);
  if (userError || !user || !sessionEmail) {
    console.error('[set-password] getUser failed or missing email', {
      hasUser: Boolean(user),
      hasEmail: Boolean(user?.email),
      message: userError?.message,
    });
    redirect('/login?error=auth_callback_failed');
  }

  let role: Awaited<ReturnType<typeof getUserRole>>;
  try {
    role = await getUserRole(sessionEmail);
  } catch (err) {
    console.error('[set-password] getUserRole failed', { email: sessionEmail, err });
    redirect('/login?error=auth_callback_failed');
  }

  if (role === 'suspended') {
    await supabase.auth.signOut();
    redirect('/login?error=suspended');
  }
  if (role !== 'admin' && role !== 'trainer') {
    await supabase.auth.signOut();
    redirect('/login?error=not_authorized');
  }

  const { error: updateError } = await supabase.auth.updateUser({ password });
  if (updateError) {
    console.error('[set-password] updateUser failed', { uid: user.id, message: updateError.message });
    return { error: "We couldn't save that password. Try a different one or contact support." };
  }

  // Mark password as user-set in OUR table so user_has_password() returns
  // true on subsequent sign-ins. We cannot rely on auth.users.encrypted_password
  // alone — Supabase pre-populates that column with an unknowable placeholder
  // during OTP signup, so it is always non-NULL. See migration 2026-05-18.
  const service = createServiceClient();
  const table = role === 'admin' ? 'admins' : 'trainers';
  const { error: stampError } = await service
    .from(table)
    .update({ password_set_at: new Date().toISOString() })
    .eq('email', sessionEmail);
  if (stampError) {
    // Non-fatal: the auth.users update already succeeded, the user can sign
    // in with their password right now. The only downside is they'll be
    // prompted to set-password again on next sign-in. Log loud so we notice.
    console.error('[set-password] failed to stamp password_set_at', {
      table,
      email: sessionEmail,
      message: stampError.message,
    });
  }

  redirect(next);
}
