import 'server-only';
import { createClient } from '@/lib/supabase/server';

const BUCKET = 'onboarding-uploads';
const MAX_BYTES = 50 * 1024 * 1024; // 50 MB cap (selfie videos can be large).

export type UploadResult = { path: string } | { error: string };

// Uploads a File from a server-action FormData entry into the per-trainer
// folder. Returns the storage path which gets stored in the matching detail
// table (selfie_video_path, signed_agreement_path, qualification.upload_path).
export async function uploadOnboardingFile(
  trainerId: string,
  file: File,
  filenamePrefix: string,
): Promise<UploadResult> {
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'No file provided.' };
  }
  if (file.size > MAX_BYTES) {
    return { error: `File too large. Maximum is ${MAX_BYTES / 1024 / 1024} MB.` };
  }

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin';
  const path = `${trainerId}/${filenamePrefix}-${Date.now()}.${ext}`;

  const supabase = await createClient();
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    });

  if (error) return { error: error.message };
  return { path };
}

// Generates a short-lived signed URL for displaying an uploaded file (e.g.
// the selfie video preview, or a qualification cert thumbnail) inside a
// server component.
export async function getSignedUploadUrl(path: string, expiresIn = 60 * 60): Promise<string | null> {
  if (!path) return null;
  const supabase = await createClient();
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresIn);
  return data?.signedUrl ?? null;
}
