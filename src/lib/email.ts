import { Resend } from 'resend';

// Sender address. `notifications@` keeps order/commission alerts out of the
// general `hello@` inbox. Override per-environment via env if needed.
const FROM = process.env.RESEND_FROM ?? 'TrainerSource <notifications@trainersource.app>';
const REPLY_TO = process.env.RESEND_REPLY_TO ?? 'hello@trainersource.app';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://trainersource-app.vercel.app';

let resendClient: Resend | null = null;

function getClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  if (!resendClient) resendClient = new Resend(apiKey);
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
export async function sendEmail(opts: SendOptions): Promise<{ ok: boolean; id?: string; error?: string }> {
  const client = getClient();
  if (!client) {
    console.warn('[email] RESEND_API_KEY missing — skipping send to', opts.to);
    return { ok: false, error: 'no_api_key' };
  }

  try {
    const { data, error } = await client.emails.send({
      from: FROM,
      to: opts.to,
      replyTo: REPLY_TO,
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
  const subject = `New client joined via your code — ${input.clientName}`;
  const body = `
    <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#2D4F67;">
      Hey ${input.trainerName.split(' ')[0]} — <strong>${input.clientName}</strong> just used your access code on Ultimate Peptides.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px 0;border-collapse:collapse;">
      <tr><td style="padding:6px 16px 6px 0;font-size:12px;color:#41627b;text-transform:uppercase;letter-spacing:0.12em;font-weight:700;">Email</td><td style="padding:6px 0;font-size:14px;color:#173041;">${input.clientEmail}</td></tr>
      <tr><td style="padding:6px 16px 6px 0;font-size:12px;color:#41627b;text-transform:uppercase;letter-spacing:0.12em;font-weight:700;">Location</td><td style="padding:6px 0;font-size:14px;color:#173041;">${input.clientCity}, ${input.clientCountry}</td></tr>
    </table>
    <p style="margin:0 0 24px 0;font-size:14px;line-height:1.6;color:#41627b;">
      They're now linked to you for life. Any order they place earns you commission, including reorders.
    </p>
  `;
  return {
    subject,
    html: shell('You have a new client.', body, { label: 'Open dashboard', href: `${SITE_URL}/dashboard` }),
  };
}

export function firstOrderEmail(input: {
  trainerName: string;
  clientName: string;
  orderTotal: number;
  commissionAmount: number;
  orderId: string;
}) {
  const subject = `Commission earned — $${input.commissionAmount.toFixed(2)} from ${input.clientName}`;
  const body = `
    <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#2D4F67;">
      Hey ${input.trainerName.split(' ')[0]} — <strong>${input.clientName}</strong> just placed their first order.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px 0;border-collapse:collapse;">
      <tr><td style="padding:6px 16px 6px 0;font-size:12px;color:#41627b;text-transform:uppercase;letter-spacing:0.12em;font-weight:700;">Order total</td><td style="padding:6px 0;font-size:14px;color:#173041;">$${input.orderTotal.toFixed(2)}</td></tr>
      <tr><td style="padding:6px 16px 6px 0;font-size:12px;color:#41627b;text-transform:uppercase;letter-spacing:0.12em;font-weight:700;">Your commission</td><td style="padding:6px 0;font-size:18px;color:#FF5722;font-weight:800;">$${input.commissionAmount.toFixed(2)}</td></tr>
      <tr><td style="padding:6px 16px 6px 0;font-size:12px;color:#41627b;text-transform:uppercase;letter-spacing:0.12em;font-weight:700;">Order ID</td><td style="padding:6px 0;font-size:13px;color:#173041;font-family:monospace;">${input.orderId}</td></tr>
    </table>
    <p style="margin:0 0 24px 0;font-size:14px;line-height:1.6;color:#41627b;">
      Pending until next payout cycle. Reorder commissions land at 10%.
    </p>
  `;
  return {
    subject,
    html: shell('Your first commission landed.', body, { label: 'View commissions', href: `${SITE_URL}/dashboard/commissions` }),
  };
}
