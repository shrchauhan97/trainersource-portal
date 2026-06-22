import { getSiteUrl } from '@/lib/email';

/** Email CTA — prefetch-safe; verifyOtp runs only after user POSTs from /auth/confirm. */
export function buildMagicLinkConfirmUrl(tokenHash: string, intent?: 'reset'): string {
  const url = new URL('/auth/confirm', getSiteUrl());
  url.searchParams.set('token_hash', tokenHash);
  url.searchParams.set('type', 'magiclink');
  if (intent === 'reset') {
    url.searchParams.set('intent', 'reset');
  }
  return url.toString();
}

/** Supabase redirect allowlist target (not used in the email body). */
export function buildMagicLinkCallbackRedirectTo(intent?: 'reset'): string {
  const url = new URL('/auth/callback', getSiteUrl());
  if (intent === 'reset') {
    url.searchParams.set('intent', 'reset');
  }
  return url.toString();
}
