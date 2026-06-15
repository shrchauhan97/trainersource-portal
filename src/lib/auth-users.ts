import type { SupabaseClient } from '@supabase/supabase-js';

// Ensures a Supabase auth.users row exists before admin.generateLink mints a
// magiclink token. Called only when the user actively requests a sign-in
// email — not at admin invite time. email_confirm: true is Supabase plumbing
// (avoids signup-token vs magiclink-token mismatch); inbox proof still
// happens when they click the one-time link.
export async function ensureAuthUserForEmail(
  service: SupabaseClient,
  rawEmail: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const email = rawEmail.trim().toLowerCase();
  if (!email) {
    return { ok: false, message: 'missing email' };
  }

  const { error } = await service.auth.admin.createUser({
    email,
    email_confirm: true,
  });

  if (!error) {
    return { ok: true };
  }

  const code = (error as { code?: string }).code;
  const status = (error as { status?: number }).status;
  const message = error.message?.toLowerCase() ?? '';

  const isDuplicateUser =
    code === 'email_exists' ||
    message.includes('already been registered') ||
    message.includes('already exists');

  if (isDuplicateUser) {
    return { ok: true };
  }

  console.error('[ensureAuthUserForEmail] createUser failed', {
    email,
    code,
    status,
    message: error.message,
  });
  return { ok: false, message: error.message };
}
