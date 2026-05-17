'use server';

import { redirect } from 'next/navigation';

import { getUserRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

import { PASSWORD_HINT, PASSWORD_REGEX } from './password-policy';

export type SetPasswordResult = { error?: string };

function safeNext(rawNext: string | null | undefined, fallback: string): string {
  if (!rawNext) return fallback;
  if (!/^\/[A-Za-z0-9_\-/]*$/.test(rawNext)) return fallback;
  return rawNext;
}

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
  if (userError || !user?.email) {
    redirect('/login?error=auth_callback_failed');
  }

  const role = await getUserRole(user.email);
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
    return { error: updateError.message };
  }

  redirect(next);
}
