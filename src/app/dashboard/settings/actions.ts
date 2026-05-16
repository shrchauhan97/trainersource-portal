'use server';

import { revalidatePath } from 'next/cache';
import { normalizeEmail } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export type TrainerProfileFormValues = {
  phone: string;
  social_media: string;
  niche: string;
  wise_account: string;
};

export type UpdateTrainerProfileActionState = {
  success: boolean;
  message: string | null;
};

function normalizeField(value: FormDataEntryValue | null) {
  return typeof value === 'string' ? value.trim() : '';
}

function toDatabaseValue(value: string) {
  return value.length > 0 ? value : null;
}

export async function updateTrainerProfile(
  _previousState: UpdateTrainerProfileActionState,
  formData: FormData
): Promise<UpdateTrainerProfileActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return {
      success: false,
      message: 'You must be signed in to update your profile.',
    };
  }

  // T2.13: case-insensitive — historic mixed-case trainer rows still resolve
  // against the lower-cased Supabase Auth session email.
  const sessionEmail = normalizeEmail(user.email) ?? user.email;
  const { data: trainer, error: trainerLookupError } = await supabase
    .from('trainers')
    .select('id')
    .ilike('email', sessionEmail)
    .single();

  if (trainerLookupError || !trainer) {
    return {
      success: false,
      message: 'Unable to find your trainer profile.',
    };
  }

  const updates = {
    phone: toDatabaseValue(normalizeField(formData.get('phone'))),
    social_media: toDatabaseValue(normalizeField(formData.get('social_media'))),
    niche: toDatabaseValue(normalizeField(formData.get('niche'))),
    wise_account: toDatabaseValue(normalizeField(formData.get('wise_account'))),
  };

  const { error } = await supabase.from('trainers').update(updates).eq('id', trainer.id);

  if (error) {
    return {
      success: false,
      message: error.message,
    };
  }

  revalidatePath('/dashboard/settings');

  return {
    success: true,
    message: 'Profile updated successfully.',
  };
}
