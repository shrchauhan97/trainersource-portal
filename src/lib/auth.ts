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

    // Both 'active' and 'onboarding' map to 'trainer'. The dashboard shell is
    // already designed to render for onboarding trainers (see the comment on
    // `getTrainerBySession` in src/app/dashboard/actions.ts — non-active sees
    // a greyed shell + an onboarding CTA), and mutation actions re-check
    // status === 'active' before running. Before this change, getUserRole
    // returned 'unauthorized' for an approved-but-still-onboarding trainer,
    // so they could never authenticate (auth/callback signed them out,
    // checkEmailAllowed rejected them) and the entire onboarding flow was
    // unreachable — see SHA-5.
    //
    // 'applied' (never approved) intentionally stays 'unauthorized' — they
    // are not yet supposed to have access; an admin's Approve click moves
    // them to 'onboarding' which is when this branch starts allowing them.
    if (trainer.status === 'active' || trainer.status === 'onboarding') {
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
