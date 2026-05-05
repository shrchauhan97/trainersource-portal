'use server';

import { createServiceClient } from '@/lib/supabase/service';
import { COMMISSION_FIRST_SALE, COMMISSION_REORDER, MAX_CLIENTS_DEFAULT } from '@/lib/constants';

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

  const name = formData.get('name') as string;
  const email = formData.get('email') as string;
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
    const { data } = await supabase
      .from('trainers')
      .select('id')
      .eq('slug', slug)
      .single();
      
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

  return { success: true, data };
}
