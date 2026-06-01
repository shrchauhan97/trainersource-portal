import type { User } from '@supabase/supabase-js';

import { createClient } from '@/lib/supabase/server';

export type AppUserRole = 'admin' | 'trainer' | 'suspended' | 'unauthorized';

export async function getCurrentUser(): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    throw error;
  }

  return user;
}

/**
 * Normalize an email captured from a Supabase auth session for use as a
 * primary-key lookup against `trainers.email` / `admins.email`. Both tables
 * persist emails in lower-case (see `admin/actions.ts:createTrainer/updateTrainer`,
 * `login/actions.ts`, the `apply` form) but the user object returned by
 * `supabase.auth.getUser()` echoes back whatever the user originally typed
 * into the magic-link / password form — including mixed-case variants. A raw
 * `.eq('email', user.email)` therefore silently fails to match the canonical
 * row whenever the session email isn't already lower-case, and the trainer/
 * admin lands on the wrong branch (redirect to /apply, "Unauthorized", etc.).
 *
 * This helper is the canonical fix for AGGREGATE.md T2.13. Use it at every
 * call site that compares a session-derived email against a stored email.
 *
 * Returns `null` when the input is null/undefined/whitespace so callers can
 * cheaply short-circuit the "no email = unauthenticated" branch with the
 * same nullish check they were already doing on `user?.email`.
 */
export function normalizeSessionEmail(
  email: string | null | undefined,
): string | null {
  if (!email) return null;
  const trimmed = email.trim().toLowerCase();
  return trimmed.length === 0 ? null : trimmed;
}

export async function getUserRole(email?: string | null): Promise<AppUserRole> {
  if (!email) {
    return 'unauthorized';
  }

  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail) {
    return 'unauthorized';
  }

  const supabase = await createClient();

  const { data: admin, error: adminError } = await supabase
    .from('admins')
    .select('id')
    .eq('email', normalizedEmail)
    .maybeSingle();

  if (adminError) {
    throw adminError;
  }

  if (admin) {
    return 'admin';
  }

  const { data: trainer, error: trainerError } = await supabase
    .from('trainers')
    .select('id, status')
    .eq('email', normalizedEmail)
    .maybeSingle();

  if (trainerError) {
    throw trainerError;
  }

  if (trainer) {
    if (trainer.status === 'suspended') {
      return 'suspended';
    }

    if (trainer.status === 'active') {
      return 'trainer';
    }
  }

  return 'unauthorized';
}

export async function getCurrentAdminEmail(): Promise<string> {
  const user = await getCurrentUser();
  if (!user?.email) throw new Error('not-authenticated');
  return user.email.toLowerCase();
}
