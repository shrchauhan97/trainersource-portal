// tests/lib/email-templates.test.ts
//
// Wave 3 T2.15: user-controlled strings (clientName, trainerName, city,
// country, email, orderId) are interpolated into the HTML body of these
// templates. Without escaping, a value like `<script>alert(1)</script>`
// or `Alice"\n><img onerror=alert(1)>` arrives as live markup in the
// trainer's inbox. These tests pin the escape contract so a future refactor
// that drops htmlEscape() will fail in CI rather than ship a vector.

import { describe, it, expect } from 'vitest';
import {
  htmlEscape,
  newClientJoinedEmail,
  firstOrderEmail,
  trainerApprovedEmail,
} from '@/lib/email';

describe('htmlEscape', () => {
  it('escapes the five OWASP characters', () => {
    expect(htmlEscape('&')).toBe('&amp;');
    expect(htmlEscape('<')).toBe('&lt;');
    expect(htmlEscape('>')).toBe('&gt;');
    expect(htmlEscape('"')).toBe('&quot;');
    expect(htmlEscape("'")).toBe('&#39;');
  });

  it('escapes & FIRST so other entities are not double-escaped', () => {
    // If we ran "& -> &amp;" after "< -> &lt;" we would also rewrite the
    // ampersand we just emitted, producing `&amp;lt;`. Lock the order.
    expect(htmlEscape('<&>')).toBe('&lt;&amp;&gt;');
    expect(htmlEscape('a & b < c')).toBe('a &amp; b &lt; c');
  });

  it('neutralises a script tag', () => {
    expect(htmlEscape('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;',
    );
  });

  it('neutralises an attribute-break payload', () => {
    // The classic "break out of a double-quoted attribute, then inject a tag"
    // shape. With escaping, the quote becomes `&quot;` and the `>` stays
    // visible as `&gt;`, so the surrounding tag still closes correctly and
    // the payload renders as text.
    const payload = 'Alice"><img src=x onerror=alert(1)>';
    const out = htmlEscape(payload);
    expect(out).toBe('Alice&quot;&gt;&lt;img src=x onerror=alert(1)&gt;');
    expect(out).not.toContain('<img');
    expect(out).not.toContain('"');
  });

  it('handles single-quoted attribute break (apostrophe)', () => {
    expect(htmlEscape("Alice'><img onerror=alert(1)>")).toBe(
      'Alice&#39;&gt;&lt;img onerror=alert(1)&gt;',
    );
  });

  it('passes harmless strings through verbatim', () => {
    expect(htmlEscape('Alice Smith')).toBe('Alice Smith');
    expect(htmlEscape('alice@example.com')).toBe('alice@example.com');
    expect(htmlEscape('Singapore')).toBe('Singapore');
    expect(htmlEscape('')).toBe('');
  });

  it('coerces nullish defensively (caller-side guard)', () => {
    // The exported templates pass `input.trainerName.split(' ')[0] ?? ''`
    // which can never be null in TS, but the helper is exported and might
    // be used in looser contexts. Coercing avoids a `Cannot read .replace
    // of null` crash at the email path (which would break the parent
    // request the email is best-effort attached to).
    expect(htmlEscape(null as unknown as string)).toBe('');
    expect(htmlEscape(undefined as unknown as string)).toBe('');
  });

  it('is idempotent on already-escaped strings (re-escapes the ampersand)', () => {
    // Worth documenting: htmlEscape is NOT a no-op on its own output.
    // Calling it twice produces `&amp;amp;` because the entity itself
    // contains `&`. Callers must escape exactly once per render.
    expect(htmlEscape(htmlEscape('<'))).toBe('&amp;lt;');
  });
});

describe('newClientJoinedEmail', () => {
  const safeInput = {
    trainerName: 'Tim Smith',
    clientName: 'Alice',
    clientEmail: 'alice@example.com',
    clientCity: 'Singapore',
    clientCountry: 'Singapore',
  };

  it('renders the trainer first name + client name in the body', () => {
    const { html } = newClientJoinedEmail(safeInput);
    expect(html).toContain('Hey Tim');
    expect(html).toContain('<strong>Alice</strong>');
    expect(html).toContain('alice@example.com');
  });

  it('escapes a <script> payload in clientName', () => {
    const { html } = newClientJoinedEmail({
      ...safeInput,
      clientName: '<script>alert(1)</script>',
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('escapes an attribute-break payload in clientName', () => {
    const { html } = newClientJoinedEmail({
      ...safeInput,
      clientName: 'Alice"><img onerror=alert(1)>',
    });
    // The injected <img> tag must not appear as live HTML.
    expect(html).not.toContain('<img onerror=alert(1)>');
    // The quote and brackets must be entity-encoded.
    expect(html).toContain('Alice&quot;&gt;&lt;img onerror=alert(1)&gt;');
  });

  it('escapes a <script> payload in trainerName (via the first-name split)', () => {
    // trainerName.split(' ')[0] takes the first word; if that first word
    // contains markup it MUST still be escaped before reaching the HTML.
    const { html } = newClientJoinedEmail({
      ...safeInput,
      trainerName: '<script>alert(1)</script> Smith',
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('escapes payload in clientEmail, clientCity, clientCountry', () => {
    const { html } = newClientJoinedEmail({
      ...safeInput,
      clientEmail: 'a@b.com"><x>',
      clientCity: '<svg/onload=alert(1)>',
      clientCountry: 'Sing"&apore',
    });
    expect(html).not.toContain('a@b.com"><x>');
    expect(html).not.toContain('<svg/onload=alert(1)>');
    expect(html).toContain('a@b.com&quot;&gt;&lt;x&gt;');
    expect(html).toContain('&lt;svg/onload=alert(1)&gt;');
    expect(html).toContain('Sing&quot;&amp;apore');
  });

  it('subject contains the raw clientName (subject is a header, not HTML)', () => {
    // Document the intentional carve-out: header sanitisation is the
    // SDK's job (CRLF, encoded-word) and mail clients render subjects as
    // plain text, so we deliberately do NOT entity-encode here.
    const { subject } = newClientJoinedEmail({
      ...safeInput,
      clientName: 'Alice & Bob',
    });
    expect(subject).toBe('New client joined via your code — Alice & Bob');
  });
});

// SHA-6: a trainer's approval email is the one moment they receive a
// sign-in/onboarding link. The href interpolates a Supabase generateLink
// URL into the HTML body; if a future refactor drops the entity-encoding,
// the `&` query separators become invalid in an HTML attribute and some
// mail clients silently truncate the URL.
describe('trainerApprovedEmail', () => {
  const onboardingInput = {
    trainerName: 'Tim Smith',
    signInUrl:
      'https://proj.supabase.co/auth/v1/verify?token=abc123&type=magiclink&redirect_to=https://app.test/auth/callback',
    status: 'onboarding' as const,
  };
  const activeInput = { ...onboardingInput, status: 'active' as const };

  it('onboarding subject + CTA reflect "start onboarding"', () => {
    const { subject, html } = trainerApprovedEmail(onboardingInput);
    expect(subject).toMatch(/onboarding/i);
    expect(html).toContain('Start onboarding');
    expect(html).toContain('Hey Tim');
  });

  it('active subject + CTA reflect "open dashboard / welcome"', () => {
    const { subject, html } = trainerApprovedEmail(activeInput);
    expect(subject).toMatch(/welcome/i);
    expect(html).toContain('Open dashboard');
  });

  it('entity-encodes the `&` query separators in the sign-in href', () => {
    // The href appears verbatim in `<a href="...">`. `&` inside an HTML
    // attribute must be `&amp;` to be valid; this is what stops a mail
    // client from truncating the URL at the first `&` boundary.
    const { html } = trainerApprovedEmail(onboardingInput);
    // Original `&` must NOT survive into the rendered href as a bare `&`
    // because we replaced it with `&amp;`. Look for the encoded form.
    expect(html).toContain('token=abc123&amp;type=magiclink');
    expect(html).not.toContain('token=abc123&type=magiclink');
  });

  it('escapes a payload smuggled through trainerName', () => {
    const { html } = trainerApprovedEmail({
      ...onboardingInput,
      trainerName: '<script>alert(1)</script> Smith',
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });
});

describe('firstOrderEmail', () => {
  const safeInput = {
    trainerName: 'Tim Smith',
    clientName: 'Alice',
    orderTotal: 199.5,
    commissionAmount: 39.9,
    orderId: 'ORD-1234',
  };

  it('renders the trainer first name + client name + order total', () => {
    const { html } = firstOrderEmail(safeInput);
    expect(html).toContain('Hey Tim');
    expect(html).toContain('<strong>Alice</strong>');
    expect(html).toContain('$199.50');
    expect(html).toContain('$39.90');
    expect(html).toContain('ORD-1234');
  });

  it('escapes a <script> payload in clientName', () => {
    const { html } = firstOrderEmail({
      ...safeInput,
      clientName: '<script>alert(1)</script>',
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('escapes an attribute-break payload in clientName', () => {
    const { html } = firstOrderEmail({
      ...safeInput,
      clientName: 'Alice"><img onerror=alert(1)>',
    });
    expect(html).not.toContain('<img onerror=alert(1)>');
    expect(html).toContain('Alice&quot;&gt;&lt;img onerror=alert(1)&gt;');
  });

  it('escapes a <script> payload in trainerName (via first-name split)', () => {
    const { html } = firstOrderEmail({
      ...safeInput,
      trainerName: '<script>alert(1)</script> Smith',
    });
    expect(html).not.toContain('<script>alert(1)</script>');
  });

  it('escapes orderId (defence in depth — BC IDs are usually integers)', () => {
    const { html } = firstOrderEmail({
      ...safeInput,
      orderId: 'ORD"><x>',
    });
    expect(html).not.toContain('ORD"><x>');
    expect(html).toContain('ORD&quot;&gt;&lt;x&gt;');
  });

  it('subject contains raw clientName (header carve-out)', () => {
    const { subject } = firstOrderEmail({
      ...safeInput,
      clientName: 'Alice & Bob',
    });
    expect(subject).toBe('Commission earned — $39.90 from Alice & Bob');
  });

  it('numeric fields render via toFixed — no escape needed', () => {
    // orderTotal and commissionAmount are typed `number`. They cannot
    // contain HTML metacharacters; document that we deliberately do not
    // call htmlEscape on `${input.commissionAmount.toFixed(2)}`.
    const { html } = firstOrderEmail({
      ...safeInput,
      orderTotal: 1000,
      commissionAmount: 100,
    });
    expect(html).toContain('$1000.00');
    expect(html).toContain('$100.00');
  });
});
