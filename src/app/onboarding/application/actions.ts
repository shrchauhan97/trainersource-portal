'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { checkApplicationDetails } from '../_lib/applicationValidation';
import { safeError } from '../_lib/errors';
import { advanceOnboardingStep } from '../_lib/state';
import { uploadOnboardingFile } from '../_lib/storage';

// Resolve the current trainer via the authenticated session. We never trust a
// client-supplied trainerId for writes — only the email match against the
// auth session decides which row the action mutates. Also returns the
// trainer's existing country / city so we can refuse silent jurisdiction
// changes mid-onboarding.
async function resolveTrainerForOnboarding(): Promise<
  | { error: string }
  | { trainerId: string; existingCountry: string | null; existingCity: string | null }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: 'You must be signed in.' };

  const { data: trainer, error } = await supabase
    .from('trainers')
    .select('id, status, country, city')
    .eq('email', user.email)
    .maybeSingle();
  if (error) return { error: safeError('resolveTrainerForOnboarding', error) };
  if (!trainer) return { error: 'Trainer not found.' };
  if (trainer.status !== 'onboarding') {
    return { error: 'Your onboarding session is no longer active.' };
  }
  return {
    trainerId: trainer.id,
    existingCountry: trainer.country ?? null,
    existingCity: trainer.city ?? null,
  };
}

function strOrNull(v: FormDataEntryValue | null): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s.length === 0 ? null : s;
}

function intOrNull(v: FormDataEntryValue | null): number | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (s.length === 0) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

export type ContactState = {
  ok: boolean;
  error?: string;
};

// Save the Contact tab. First/last name + onboarding-only fields land in
// trainer_application_details. Country/City update the canonical trainers
// row ONLY when the trainer doesn't already have one set — applied trainers
// have a jurisdiction locked at /apply time and shouldn't be able to flip it
// from the onboarding form.
export async function saveContactDetails(
  _prev: ContactState,
  formData: FormData,
): Promise<ContactState> {
  const session = await resolveTrainerForOnboarding();
  if ('error' in session) return { ok: false, error: session.error };
  const { trainerId, existingCountry, existingCity } = session;

  const supabase = await createClient();

  const first_name = strOrNull(formData.get('first_name'));
  const last_name = strOrNull(formData.get('last_name'));
  const country = strOrNull(formData.get('country'));
  const city = strOrNull(formData.get('city'));
  const zip = strOrNull(formData.get('zip'));
  const profession = strOrNull(formData.get('profession'));
  const experience_years = intOrNull(formData.get('experience_years'));
  const specialty = strOrNull(formData.get('specialty'));
  const years_in_current_city = intOrNull(formData.get('years_in_current_city'));
  const instagram = strOrNull(formData.get('instagram'));
  const facebook_or_other = strOrNull(formData.get('facebook_or_other'));
  const tiktok = strOrNull(formData.get('tiktok'));
  const linkedin = strOrNull(formData.get('linkedin'));

  // Backfill country/city ONLY when the trainers row doesn't have them
  // already. Locked-after-apply jurisdiction protects compliance posture.
  const trainerUpdate: Record<string, string> = {};
  if (!existingCountry && country) trainerUpdate.country = country;
  if (!existingCity && city) trainerUpdate.city = city;
  if (Object.keys(trainerUpdate).length > 0) {
    const { error: trainerErr } = await supabase
      .from('trainers')
      .update(trainerUpdate)
      .eq('id', trainerId);
    if (trainerErr) return { ok: false, error: safeError('saveContactDetails:trainers', trainerErr) };
  }

  const { error: appErr } = await supabase
    .from('trainer_application_details')
    .upsert(
      {
        trainer_id: trainerId,
        first_name,
        last_name,
        zip,
        profession,
        experience_years,
        specialty,
        years_in_current_city,
        instagram,
        facebook_or_other,
        tiktok,
        linkedin,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'trainer_id' },
    );
  if (appErr) return { ok: false, error: safeError('saveContactDetails:details', appErr) };

  revalidatePath('/onboarding/application');
  return { ok: true };
}

export type QualificationsState = {
  ok: boolean;
  error?: string;
};

// One-shot save for the qualifications table. Order of operations:
//   1. Upload all new files. If ANY upload fails we abort BEFORE deleting
//      the existing rows — that way a network blip mid-save never leaves
//      the trainer with zero qualifications.
//   2. Delete the existing rows.
//   3. Insert the new rows referencing the freshly uploaded paths.
// This is best-effort transactional; a crash between (2) and (3) still
// loses data but the upload-first ordering eliminates the most common
// failure mode.
export async function saveQualifications(
  _prev: QualificationsState,
  formData: FormData,
): Promise<QualificationsState> {
  const session = await resolveTrainerForOnboarding();
  if ('error' in session) return { ok: false, error: session.error };
  const { trainerId } = session;

  const supabase = await createClient();

  const names = formData.getAll('certificate_name[]');
  const bodies = formData.getAll('issuing_body[]');
  const dates = formData.getAll('date_of_issue[]');
  const uploads = formData.getAll('upload[]');

  const rows: Array<{
    certificate_name: string;
    issuing_body: string | null;
    date_of_issue: string | null;
    is_current: boolean;
    upload?: File;
  }> = [];

  const len = Math.max(names.length, bodies.length, dates.length, uploads.length);
  for (let i = 0; i < len; i++) {
    const name = strOrNull(names[i] ?? null);
    if (!name) continue;
    const body = strOrNull(bodies[i] ?? null);
    const date = strOrNull(dates[i] ?? null);
    const isCurrent = strOrNull(formData.get(`is_current_${i}`)) === 'on';
    const file = uploads[i];
    rows.push({
      certificate_name: name,
      issuing_body: body,
      date_of_issue: date,
      is_current: isCurrent,
      upload: file instanceof File && file.size > 0 ? file : undefined,
    });
  }

  // (1) Upload first. Bail before deleting on any failure.
  const inserts: Array<{
    trainer_id: string;
    certificate_name: string;
    issuing_body: string | null;
    date_of_issue: string | null;
    is_current: boolean;
    upload_path: string | null;
  }> = [];

  for (const row of rows) {
    let upload_path: string | null = null;
    if (row.upload) {
      const result = await uploadOnboardingFile(trainerId, row.upload, 'qualification');
      if ('error' in result) return { ok: false, error: result.error };
      upload_path = result.path;
    }
    inserts.push({
      trainer_id: trainerId,
      certificate_name: row.certificate_name,
      issuing_body: row.issuing_body,
      date_of_issue: row.date_of_issue,
      is_current: row.is_current,
      upload_path,
    });
  }

  // (2) Delete existing rows now that uploads succeeded.
  const { error: delErr } = await supabase
    .from('trainer_qualifications')
    .delete()
    .eq('trainer_id', trainerId);
  if (delErr) return { ok: false, error: safeError('saveQualifications:delete', delErr) };

  if (inserts.length === 0) {
    revalidatePath('/onboarding/application');
    return { ok: true };
  }

  // (3) Insert.
  const { error: insErr } = await supabase.from('trainer_qualifications').insert(inserts);
  if (insErr) return { ok: false, error: safeError('saveQualifications:insert', insErr) };

  revalidatePath('/onboarding/application');
  return { ok: true };
}

export type SalesGoalsState = {
  ok: boolean;
  error?: string;
};

// Sales Goals tab + selfie video upload. Video is optional.
export async function saveSalesGoals(
  _prev: SalesGoalsState,
  formData: FormData,
): Promise<SalesGoalsState> {
  const session = await resolveTrainerForOnboarding();
  if ('error' in session) return { ok: false, error: session.error };
  const { trainerId } = session;

  const supabase = await createClient();

  const client_base_per_month = intOrNull(formData.get('client_base_per_month'));
  const sales_goal_per_month = intOrNull(formData.get('sales_goal_per_month'));
  const heard_about_source = strOrNull(formData.get('heard_about_source'));

  const update: Record<string, unknown> = {
    trainer_id: trainerId,
    client_base_per_month,
    sales_goal_per_month,
    heard_about_source,
    updated_at: new Date().toISOString(),
  };

  const video = formData.get('selfie_video');
  if (video instanceof File && video.size > 0) {
    const result = await uploadOnboardingFile(trainerId, video, 'selfie_video');
    if ('error' in result) return { ok: false, error: result.error };
    update.selfie_video_path = result.path;
  }

  const { error: appErr } = await supabase
    .from('trainer_application_details')
    .upsert(update, { onConflict: 'trainer_id' });
  if (appErr) return { ok: false, error: safeError('saveSalesGoals', appErr) };

  revalidatePath('/onboarding/application');
  return { ok: true };
}

// Final advance — gated on minimum completeness so a trainer can't stamp
// application_submitted_at on a bare row and only learn at /go-live that
// they need to redo step 1.
export async function submitApplicationFinal(): Promise<void> {
  const session = await resolveTrainerForOnboarding();
  if ('error' in session) {
    throw new Error(session.error);
  }
  const { trainerId } = session;

  const supabase = await createClient();

  // Re-read the canonical trainers + details rows to validate completeness
  // server-side. Don't trust whatever the client showed us.
  const [{ data: trainer }, { data: details }] = await Promise.all([
    supabase
      .from('trainers')
      .select('country, city')
      .eq('id', trainerId)
      .maybeSingle(),
    supabase
      .from('trainer_application_details')
      .select('*')
      .eq('trainer_id', trainerId)
      .maybeSingle(),
  ]);

  if (!trainer?.country || !trainer.country.trim() || !trainer?.city || !trainer.city.trim()) {
    throw new Error('Country and city are required before submitting your application.');
  }

  const completeness = checkApplicationDetails(details ?? null);
  if (!completeness.ok) {
    const labels: Record<string, string> = {
      first_name: 'First name',
      last_name: 'Last name',
      profession: 'Profession',
    };
    const friendly = completeness.missing.map((k) => labels[k] ?? k).join(', ');
    throw new Error(`Fill these required fields before submitting: ${friendly}`);
  }

  await supabase
    .from('trainer_application_details')
    .upsert(
      {
        trainer_id: trainerId,
        application_submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'trainer_id' },
    );

  const advanceResult = await advanceOnboardingStep(trainerId, 'training');
  if (advanceResult.error) throw new Error(advanceResult.error);

  revalidatePath('/onboarding/application');
  revalidatePath('/onboarding/training');
  redirect('/onboarding/training');
}
