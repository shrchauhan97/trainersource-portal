import type { User } from '@supabase/supabase-js';

import { createClient } from '@/lib/supabase/server';

export type AppUserRole = 'admin' | 'trainer' | 'suspended' | 'unauthorized';

// Normalises an email for case-insensitive matching against rows where email
// may have been stored with mixed case (historic data, applications written
// before normalisation rolled out, customers seeded by BigCommerce, etc.).
//
// Callers MUST use this helper at every read site that filters by email and at
// every write site that inserts/upserts email — otherwise a trainer who
// applies with "John@Example.com" but logs in with "john@example.com" silently
// fails the lookup (T2.13 fix).
//
// Returns the trimmed lower-cased email, or null when the input is missing or
// blank after trimming.
export function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const normalized = email.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

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
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail) {
    return 'unauthorized';
  }

  const supabase = await createClient();

  // T2.13: case-insensitive — historic rows may have been inserted before
  // email normalisation rolled out (mixed-case).
  const { data: admin, error: adminError } = await supabase
    .from('admins')
    .select('id')
    .ilike('email', normalizedEmail)
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
    .ilike('email', normalizedEmail)
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
