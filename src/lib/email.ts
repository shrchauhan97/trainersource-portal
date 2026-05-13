import { Resend } from 'resend';

// ---------- environment detection ----------
//
// Sender / reply-to / site-url defaults USED TO be hard-coded to prod values
// at module-load time (commit f3391ac+):
//   const FROM = process.env.RESEND_FROM ?? 'TrainerSource <trainersource@...>';
//   const REPLY_TO = process.env.RESEND_REPLY_TO ?? 'support@ultimate-peptides.com';
//   const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://trainer-source.com';
// That meant a Vercel preview deploy without these env vars set would happily
// send a real, prod-branded email to a real customer with a CTA pointing at
// the live site. Audit bug F-T2.20.
//
// Fix: read env at call time, gate the defaults on `VERCEL_ENV === 'production'`,
// and use OBVIOUSLY non-prod placeholders for preview / dev / test so that any
// email accidentally sent from those environments is unmistakable in logs.
//
// `VERCEL_ENV` is the source of truth on Vercel ('production' | 'preview' |
// 'development'). Off-Vercel (CI, local, vitest) we fall back to NODE_ENV.

// Treat `undefined` and empty/whitespace strings the same. Vercel's dashboard
// lets operators blank out a value to "unset" it (the platform actually keeps
// an empty string), and vitest's `vi.stubEnv(name, '')` produces the same
// shape. `??` alone wouldn't trigger the fallback on `''`.
function readEnv(name: string): string | undefined {
  const v = process.env[name];
  if (v == null) return undefined;
  const trimmed = v.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function isProductionEnv(): boolean {
  const vercelEnv = readEnv('VERCEL_ENV');
  if (vercelEnv) return vercelEnv === 'production';
  return readEnv('NODE_ENV') === 'production';
}

// Placeholders chosen to be loud in logs and unlikely to deliver if accidentally
// used (the `preview-no-reply@…` localpart is not provisioned on Resend, so
// sends will fail visibly rather than silently land in a customer inbox).
const PREVIEW_FROM = 'TrainerSource (PREVIEW — do not use) <preview-no-reply@ultimate-peptides.com>';
const PREVIEW_REPLY_TO = 'preview-no-reply@ultimate-peptides.com';

function getFrom(): string {
  if (isProductionEnv()) {
    return (
      readEnv('RESEND_FROM') ??
      'TrainerSource <trainersource@ultimate-peptides.com>'
    );
  }
  return readEnv('RESEND_FROM') ?? PREVIEW_FROM;
}

function getReplyTo(): string {
  if (isProductionEnv()) {
    return readEnv('RESEND_REPLY_TO') ?? 'support@ultimate-peptides.com';
  }
  return readEnv('RESEND_REPLY_TO') ?? PREVIEW_REPLY_TO;
}

// Exported so templates (and any other module that needs to build a link in
// an email body) can route off the same env-aware base URL. In non-prod, fall
// back to the preview-deploy URL Vercel injects (`VERCEL_URL` is host-only,
// no scheme), then to localhost for tests / `next dev`.
export function getSiteUrl(): string {
  if (isProductionEnv()) {
    return readEnv('NEXT_PUBLIC_SITE_URL') ?? 'https://trainer-source.com';
  }
  const siteUrl = readEnv('NEXT_PUBLIC_SITE_URL');
  if (siteUrl) return siteUrl;
  const vercelUrl = readEnv('VERCEL_URL');
  if (vercelUrl) return `https://${vercelUrl}`;
  return 'http://localhost:3000';
}

/**
 * Fails loud if we're running in production with required email env vars
 * missing. Called from the send path so a misconfigured prod deploy crashes
 * the request (and logs a stack) instead of silently falling back to a
 * hard-coded default. The test suite drives this directly.
 */
export function assertProductionEmailReady(): void {
  if (!isProductionEnv()) return;
  const missing: string[] = [];
  if (!readEnv('RESEND_API_KEY')) missing.push('RESEND_API_KEY');
  if (!readEnv('RESEND_FROM')) missing.push('RESEND_FROM');
  if (!readEnv('RESEND_REPLY_TO')) missing.push('RESEND_REPLY_TO');
  if (!readEnv('NEXT_PUBLIC_SITE_URL')) missing.push('NEXT_PUBLIC_SITE_URL');
  if (missing.length > 0) {
    throw new Error(
      `[email] production email env not ready — missing: ${missing.join(', ')}`,
    );
  }
}

let resendClient: Resend | null = null;
let cachedApiKey: string | null = null;

function getClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  // Re-instantiate if the API key changed (e.g. in tests stubbing env vars).
  if (!resendClient || cachedApiKey !== apiKey) {
    resendClient = new Resend(apiKey);
    cachedApiKey = apiKey;
  }
  return resendClient;
}

type SendOptions = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

// Fire-and-forget. Email failures must NEVER break the parent request — they
// are best-effort notifications, not part of the order/commission contract.
// The handler returns immediately; any error is logged for observability.
//
// Exception: in production, missing env vars throw via `assertProductionEmailReady`
// before we even resolve the API client. That is intentional — a silent
// production fallback to hard-coded defaults is exactly the bug F-T2.20 fixes.
export async function sendEmail(opts: SendOptions): Promise<{ ok: boolean; id?: string; error?: string }> {
  assertProductionEmailReady();

  const from = getFrom();
  const replyTo = getReplyTo();

  if (!isProductionEnv()) {
    // Make it obvious in preview / dev / test that emails aren't prod-branded.
    console.warn('[email] non-production send', {
      vercelEnv: process.env.VERCEL_ENV ?? null,
      nodeEnv: process.env.NODE_ENV ?? null,
      to: opts.to,
      from,
      replyTo,
    });
  }

  const client = getClient();
  if (!client) {
    console.warn('[email] RESEND_API_KEY missing — skipping send to', opts.to);
    return { ok: false, error: 'no_api_key' };
  }

  try {
    const { data, error } = await client.emails.send({
      from,
      to: opts.to,
      replyTo,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    });
    if (error) {
      console.error('[email] send failed', { to: opts.to, error });
      return { ok: false, error: error.message };
    }
    return { ok: true, id: data?.id };
  } catch (err) {
    console.error('[email] threw', err);
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ---------- HTML escape ----------
//
// Every user-controlled string interpolated into an HTML template MUST go
// through this helper. The recipients of these emails are trainers, but the
// inputs (clientName, clientCity, etc.) come from the storefront gate form
// where any visitor can type anything. Without escaping, a value like
// `Alice"\n><img onerror=alert(1)>` lands in the trainer's inbox as live
// markup — some mail clients (e.g. Apple Mail) will execute the tag, and
// even those that don't will mis-render the layout.
//
// Mapping is the canonical OWASP set: & < > " ' — sufficient for HTML body
// text and attribute values whose surrounding quotes are double-quotes
// (which is how the templates below quote every href/src). The five-char
// approach avoids adding `he` or `escape-html` as a dependency.
//
// Plain-text bodies (when added) do NOT need to call this — entities would
// be visible as literal `&amp;` in text/plain.
export function htmlEscape(s: string): string {
  // Coerce defensively: callers pass strings, but `clientName ?? 'there'`
  // patterns can let `null`/`undefined` slip through in TS-loose call sites.
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---------- shared HTML shell ----------

function shell(headline: string, body: string, cta?: { label: string; href: string }): string {
  const ctaBlock = cta
    ? `<a href="${cta.href}" style="display:inline-block;background:#FF5722;color:#fff;text-decoration:none;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;font-size:13px;padding:14px 28px;border-radius:999px;margin-top:8px;">${cta.label}</a>`
    : '';
  return `<!doctype html>
<html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#f4faff;font-family:-apple-system,BlinkMacSystemFont,'Plus Jakarta Sans',Inter,sans-serif;color:#161c20;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4faff;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;padding:40px 32px;box-shadow:0 12px 32px rgba(45,79,103,0.08);">
        <tr><td>
          <p style="margin:0 0 8px 0;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#FF5722;font-weight:700;">TrainerSource</p>
          <h1 style="margin:0 0 16px 0;font-size:24px;line-height:1.25;color:#173041;font-weight:800;">${headline}</h1>
          ${body}
          ${ctaBlock}
        </td></tr>
      </table>
      <p style="margin:24px 0 0 0;font-size:11px;color:#41627b;text-align:center;">
        Sent by TrainerSource. Reply to this email and a human will see it.
      </p>
    </td></tr>
  </table>
</body></html>`;
}

// ---------- templates ----------

export function newClientJoinedEmail(input: {
  trainerName: string;
  clientName: string;
  clientEmail: string;
  clientCity: string;
  clientCountry: string;
}) {
  // Subject is a header — mail clients render it as plain text in their
  // chrome (inbox row, notification banner). HTML escaping it would surface
  // literal `&amp;` to the trainer. Headers have their own sanitisation
  // story (CRLF/folding handled by the Resend SDK) so we leave the raw
  // string here. The HTML body below is where user-controlled strings
  // become a vector — every interpolation goes through htmlEscape().
  const subject = `New client joined via your code — ${input.clientName}`;
  const trainerFirstName = htmlEscape(input.trainerName.split(' ')[0] ?? '');
  const clientName = htmlEscape(input.clientName);
  const clientEmail = htmlEscape(input.clientEmail);
  const clientCity = htmlEscape(input.clientCity);
  const clientCountry = htmlEscape(input.clientCountry);
  const body = `
    <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#2D4F67;">
      Hey ${trainerFirstName} — <strong>${clientName}</strong> just used your access code on Ultimate Peptides.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px 0;border-collapse:collapse;">
      <tr><td style="padding:6px 16px 6px 0;font-size:12px;color:#41627b;text-transform:uppercase;letter-spacing:0.12em;font-weight:700;">Email</td><td style="padding:6px 0;font-size:14px;color:#173041;">${clientEmail}</td></tr>
      <tr><td style="padding:6px 16px 6px 0;font-size:12px;color:#41627b;text-transform:uppercase;letter-spacing:0.12em;font-weight:700;">Location</td><td style="padding:6px 0;font-size:14px;color:#173041;">${clientCity}, ${clientCountry}</td></tr>
    </table>
    <p style="margin:0 0 24px 0;font-size:14px;line-height:1.6;color:#41627b;">
      They're now linked to you for life. Any order they place earns you commission, including reorders.
    </p>
  `;
  return {
    subject,
    html: shell('You have a new client.', body, { label: 'Open dashboard', href: `${getSiteUrl()}/dashboard` }),
  };
}

export function firstOrderEmail(input: {
  trainerName: string;
  clientName: string;
  orderTotal: number;
  commissionAmount: number;
  orderId: string;
}) {
  // Subject is a header — see comment in newClientJoinedEmail. orderId is
  // technically user-influenced via the BC webhook payload but BC IDs are
  // integers so they don't reach the template as HTML metacharacters. We
  // still escape it in the body for defence in depth (a future schema
  // change could let strings through).
  const subject = `Commission earned — $${input.commissionAmount.toFixed(2)} from ${input.clientName}`;
  const trainerFirstName = htmlEscape(input.trainerName.split(' ')[0] ?? '');
  const clientName = htmlEscape(input.clientName);
  const orderId = htmlEscape(input.orderId);
  const body = `
    <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#2D4F67;">
      Hey ${trainerFirstName} — <strong>${clientName}</strong> just placed their first order.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px 0;border-collapse:collapse;">
      <tr><td style="padding:6px 16px 6px 0;font-size:12px;color:#41627b;text-transform:uppercase;letter-spacing:0.12em;font-weight:700;">Order total</td><td style="padding:6px 0;font-size:14px;color:#173041;">$${input.orderTotal.toFixed(2)}</td></tr>
      <tr><td style="padding:6px 16px 6px 0;font-size:12px;color:#41627b;text-transform:uppercase;letter-spacing:0.12em;font-weight:700;">Your commission</td><td style="padding:6px 0;font-size:18px;color:#FF5722;font-weight:800;">$${input.commissionAmount.toFixed(2)}</td></tr>
      <tr><td style="padding:6px 16px 6px 0;font-size:12px;color:#41627b;text-transform:uppercase;letter-spacing:0.12em;font-weight:700;">Order ID</td><td style="padding:6px 0;font-size:13px;color:#173041;font-family:monospace;">${orderId}</td></tr>
    </table>
    <p style="margin:0 0 24px 0;font-size:14px;line-height:1.6;color:#41627b;">
      Pending until next payout cycle. Reorder commissions land at 10%.
    </p>
  `;
  return {
    subject,
    html: shell('Your first commission landed.', body, { label: 'View commissions', href: `${getSiteUrl()}/dashboard/commissions` }),
  };
}
