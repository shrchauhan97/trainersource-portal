import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildMagicLinkCallbackRedirectTo,
  buildMagicLinkConfirmUrl,
} from '@/lib/auth-magic-link-urls';

describe('auth-magic-link-urls', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('buildMagicLinkConfirmUrl points at /auth/confirm with token params', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'http://localhost:3000');
    expect(buildMagicLinkConfirmUrl('tok-abc')).toBe(
      'http://localhost:3000/auth/confirm?token_hash=tok-abc&type=magiclink',
    );
  });

  it('buildMagicLinkConfirmUrl includes intent=reset when requested', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'http://localhost:3000');
    const url = buildMagicLinkConfirmUrl('tok-abc', 'reset');
    expect(url).toContain('/auth/confirm');
    expect(url).toContain('intent=reset');
  });

  it('buildMagicLinkCallbackRedirectTo targets /auth/callback for Supabase allowlist', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'http://localhost:3000');
    expect(buildMagicLinkCallbackRedirectTo()).toBe('http://localhost:3000/auth/callback');
    expect(buildMagicLinkCallbackRedirectTo('reset')).toBe(
      'http://localhost:3000/auth/callback?intent=reset',
    );
  });
});
