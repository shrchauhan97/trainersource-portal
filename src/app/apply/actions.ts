'use server';

import { after } from 'next/server';

import { newTrainerApplicationEmail, sendEmail } from '@/lib/email';
import { createServiceClient } from '@/lib/supabase/service';
import { COMMISSION_FIRST_SALE, COMMISSION_REORDER, MAX_CLIENTS_DEFAULT } from '@/lib/constants';

// Fire-and-forget admin fan-out. Failures must never break /apply — the
// application row is the source of truth; email is a courtesy ping. We
// schedule via next/server `after()` so the runtime keeps the lambda
// alive until the sends resolve (a plain `void notifyAdmins(...)` after
// the action returns can be cut off when Vercel freezes the instance).
async function notifyAdminsOfApplication(payload: {
  trainerName: string;
  trainerEmail: string;
  city: string;
  country: string;
  niche?: string | null;
  socialMedia?: string | null;
}): Promise<void> {
  try {
    const supabase = createServiceClient();
    const { data: admins, error } = await supabase.from('admins').select('email');
    if (error) {
      console.error('[apply] could not load admin list', error);
      return;
    }
    if (!admins?.length) {
      console.warn('[apply] no admins to notify of new application');
      return;
    }

    const recipients = admins
      .map((a) => (a.email as string | null)?.trim())
      .filter((addr): addr is string => Boolean(addr));
    if (recipients.length === 0) {
      console.warn('[apply] admins table has rows but no usable email column');
      return;
    }

    const { subject, html } = newTrainerApplicationEmail(payload);

    // Resend free tier = 2 req/s. Send sequentially with a 600ms gap
    // to stay under the limit. Retry once on 429 (rate-limit).
    const SEND_GAP_MS = 600;
    const RATE_LIMIT_RETRY_MS = 1000;
    const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

    let succeeded = 0;
    let failed = 0;

    for (let i = 0; i < recipients.length; i++) {
      const to = recipients[i];
      if (i > 0) await delay(SEND_GAP_MS);

      let result = await sendEmail({ to, subject, html });

      if (!result.ok && result.error?.includes('Too many requests')) {
        console.warn(`[apply] rate-limited for ${to}, retrying in ${RATE_LIMIT_RETRY_MS}ms`);
        await delay(RATE_LIMIT_RETRY_MS);
        result = await sendEmail({ to, subject, html });
      }

      if (result.ok) {
        succeeded++;
      } else {
        failed++;
        console.error(`[apply] email FAILED to ${to}:`, result.error);
      }
    }

    if (failed > 0) {
      console.error('[apply] admin notification partial failure', { succeeded, failed, total: recipients.length });
    } else {
      console.info('[apply] admin notification delivered to all', succeeded, 'admin(s)');
    }
  } catch (err) {
    console.error('[apply] notifyAdminsOfApplication threw', err);
  }
}

// Maps raw Postgres errors to copy that doesn't leak schema details to
// applicants. Anything not in this table gets a generic retry message —
// the original Postgres error still hits the server log for debugging.
function friendlyDbError(error: { code?: string; message?: string; details?: string | null }): string {
  // 23505 = unique constraint violation. The constraint name tells us which
  // field collided so we can be specific without exposing table internals.
  if (error.code === '23505') {
    const target = `${error.message ?? ''} ${error.details ?? ''}`.toLowerCase();
    if (target.includes('trainers_email_key') || target.includes('(email)')) {
      return 'We already have an application on file for this email. If you applied earlier, check your inbox for next steps — or reach out to hello@trainersource.app and we\'ll find your record.';
    }
    if (target.includes('trainers_phone_key') || target.includes('(phone)')) {
      return 'We already have an application on file for this phone number. Reach out to hello@trainersource.app if you think this is wrong.';
    }
    return 'Looks like part of this application matches an existing record. Reach out to hello@trainersource.app and we\'ll sort it out.';
  }

  // 23514 = check constraint violation (e.g. country/city blank when required).
  if (error.code === '23514') {
    return 'One of the fields didn\'t pass validation. Double-check the required fields and try again.';
  }

  return 'Something went wrong submitting your application. Please try again in a moment, or email hello@trainersource.app if it keeps happening.';
}

// Service role: this action runs BEFORE the applicant has a login (they
// don't have an auth session yet), so the user-scoped SSR client would
// hit RLS as `anon` and be denied. Fine to use service role here because
// the form fields are the only inputs and the resulting row is always
// inserted with status='applied', which requires admin action to move
// forward.
export async function submitApplication(formData: FormData) {
  const supabase = createServiceClient();

  const name = (formData.get('name') as string)?.trim();
  const email = (formData.get('email') as string)?.trim().toLowerCase();
  const phone = formData.get('phone') as string;
  const country = formData.get('country') as string;
  const city = formData.get('city') as string;
  const niche = formData.get('niche') as string;
  const social_media = formData.get('socialMedia') as string;
  
  if (!name || !email || !country || !city) {
    const missing = [
      !name && 'Full name',
      !email && 'Email address',
      !country && 'Country',
      !city && 'City',
    ].filter(Boolean).join(', ');
    return { error: `Please fill in: ${missing}.` };
  }

  // Catch obvious email typos before hitting the DB so the user gets a
  // direct field-level message instead of a generic insert failure.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: 'That email address doesn\'t look right. Please check and try again.' };
  }

  const baseSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  let slug = baseSlug || 'trainer';
  
  let isUnique = false;
  let counter = 1;

  while (!isUnique) {
    // `.single()` returns error code PGRST116 when no row matches — that
    // case is "slug is free, take it". Any other error code is a real DB
    // failure (timeout, RLS, network) and we must NOT silently treat the
    // empty result as "unique" or we risk inserting a duplicate slug.
    const { data, error } = await supabase
      .from('trainers')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();

    if (error) {
      console.error('[apply] slug uniqueness probe failed', {
        slug,
        code: error.code,
        message: error.message,
      });
      return {
        error:
          'We hit a snag checking your profile slug. Please try again in a moment, or email hello@trainersource.app.',
      };
    }

    if (!data) {
      isUnique = true;
    } else {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }
  }

  const { data, error } = await supabase
    .from('trainers')
    .insert({
      name,
      email,
      phone: phone || null,
      country,
      city,
      niche: niche || null,
      social_media: social_media || null,
      slug,
      tier: 'trainer',
      status: 'applied',
      commission_rate: COMMISSION_FIRST_SALE,
      reorder_commission_rate: COMMISSION_REORDER,
      max_clients: MAX_CLIENTS_DEFAULT
    })
    .select()
    .single();

  if (error) {
    console.error('Error inserting application:', error);
    return { error: friendlyDbError(error) };
  }

  // Best of both worlds: after() keeps Vercel production responses fast
  // (async fire-and-forget), while the catch fallback awaits the sends
  // synchronously so emails always fire in local dev / environments where
  // after() is not available or gets torn down early.
  const notifyPayload = {
    trainerName: name,
    trainerEmail: email,
    city,
    country,
    niche: niche || null,
    socialMedia: social_media || null,
  };
  try {
    after(() => notifyAdminsOfApplication(notifyPayload));
  } catch {
    // after() is not available (e.g. local next dev) — await directly.
    // notifyAdminsOfApplication is fully try/caught internally so this
    // never throws and never breaks the response.
    await notifyAdminsOfApplication(notifyPayload);
  }

  return { success: true, data };
}
