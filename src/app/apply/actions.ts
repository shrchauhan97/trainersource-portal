'use server';

import { createServiceClient } from '@/lib/supabase/service';
import { COMMISSION_FIRST_SALE, COMMISSION_REORDER, MAX_CLIENTS_DEFAULT } from '@/lib/constants';

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
    return { error: 'Missing required fields' };
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
    return { error: error.message };
  }

  return { success: true, data };
}
