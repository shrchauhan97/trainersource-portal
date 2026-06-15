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
  storefrontWelcomeEmail,
  onboardingCompleteAdminEmail,
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

// SHA-122: storefront customer welcome email — sent the first time we mint
// a BC storefront account so the customer has a path to set a password
// before the next visit. Locks the CTA contract (must point at the BC
// storefront's reset-password page, NOT the trainer portal) and the
// XSS-escape contract for both customerName and customerEmail.
describe('storefrontWelcomeEmail', () => {
  const safeInput = {
    customerName: 'Jordan Lee',
    customerEmail: 'jordan@example.com',
  };

  it('subject calls out password setup', () => {
    const { subject } = storefrontWelcomeEmail(safeInput);
    expect(subject).toBe(
      'Your Ultimate Peptides account is ready — set your password',
    );
  });

  it('greets by first name and surfaces the customer email', () => {
    const { html } = storefrontWelcomeEmail(safeInput);
    expect(html).toContain('Hey Jordan');
    expect(html).toContain('<strong>jordan@example.com</strong>');
  });

  it('CTA points at the BC storefront reset-password page (NOT the trainer portal)', () => {
    const { html } = storefrontWelcomeEmail(safeInput);
    // Default storefront host (BC_STORE_URL env unset in test env).
    expect(html).toContain(
      'href="https://ultimate-peptides.com/login.php?action=reset_password"',
    );
    expect(html).toContain('Set my password');
    // The trainer portal must NEVER show up here — the CTA leads the
    // customer to BC's own account flow.
    expect(html).not.toContain('trainer-source.com');
  });

  it('escapes <script> in customerName', () => {
    const { html } = storefrontWelcomeEmail({
      ...safeInput,
      customerName: '<script>alert(1)</script> Lee',
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('escapes an attribute-break payload in customerEmail', () => {
    const { html } = storefrontWelcomeEmail({
      ...safeInput,
      customerEmail: 'a@b.com"><img onerror=alert(1)>',
    });
    expect(html).not.toContain('<img onerror=alert(1)>');
    expect(html).toContain('a@b.com&quot;&gt;&lt;img onerror=alert(1)&gt;');
  });

  it('honours BC_STORE_URL when set (strips trailing slash)', async () => {
    const originalEnv = process.env.BC_STORE_URL;
    try {
      process.env.BC_STORE_URL = 'https://shop.example.com/';
      // The template reads getBcStoreUrl() at call time, so a fresh call
      // picks up the override without re-importing.
      const { html } = storefrontWelcomeEmail(safeInput);
      expect(html).toContain(
        'href="https://shop.example.com/login.php?action=reset_password"',
      );
      expect(html).not.toContain('shop.example.com//login.php');
    } finally {
      if (originalEnv === undefined) {
        delete process.env.BC_STORE_URL;
      } else {
        process.env.BC_STORE_URL = originalEnv;
      }
    }
  });
});

describe('onboardingCompleteAdminEmail', () => {
  const base = {
    trainerId: 'trainer-1',
    trainerName: 'Alice',
    trainerEmail: 'alice@example.com',
    city: 'Austin',
  };

  it('claims attachment when hasAttachment is true', () => {
    const { html } = onboardingCompleteAdminEmail({
      ...base,
      hasAttachment: true,
    });
    expect(html).toContain('signed agreement is attached');
  });

  it('honest fallback copy when attachment is missing but path is known', () => {
    const path = 'trainer-1/signed-agreement-99.pdf';
    const { html } = onboardingCompleteAdminEmail({
      ...base,
      hasAttachment: false,
      signedAgreementPath: path,
    });
    expect(html).toContain('attach the signed agreement automatically');
    expect(html).toContain(path);
    expect(html).not.toContain('is attached to this email');
  });

  it('notes missing path when no signed agreement path was recorded', () => {
    const { html } = onboardingCompleteAdminEmail({
      ...base,
      hasAttachment: false,
    });
    expect(html).toContain('No signed agreement path was recorded');
  });
});
