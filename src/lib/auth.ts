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
