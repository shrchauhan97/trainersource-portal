import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { UPLOAD_SPECS, validateUpload, type UploadKind } from './uploadValidation';

const BUCKET = 'onboarding-uploads';

export type UploadResult = { path: string } | { error: string };

// Uploads a File from a server-action FormData entry into the per-trainer
// folder. Per-kind content-type/extension/size validation happens in
// validateUpload — so callers just pass the kind discriminator and we
// guarantee a clean, sandboxed path or a safe error string.
export async function uploadOnboardingFile(
  trainerId: string,
  file: File,
  kind: UploadKind,
): Promise<UploadResult> {
  if (!(file instanceof File)) {
    return { error: 'No file provided.' };
  }

  // trainerId is server-supplied (always resolved from the auth session)
  // but defence-in-depth — refuse anything that could escape the bucket.
  if (!/^[0-9a-f-]{36}$/i.test(trainerId)) {
    return { error: 'Invalid trainer reference.' };
  }

  const validation = validateUpload(file, kind);
  if (!validation.ok) {
    return { error: validation.error };
  }

  const spec = UPLOAD_SPECS[kind];
  const path = `${trainerId}/${spec.folderPrefix}-${Date.now()}.${validation.extension}`;

  const supabase = await createClient();
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, {
      contentType: file.type,
      upsert: false,
    });

  if (error) {
    console.error('[storage] upload failed:', { kind, trainerId, error });
    return { error: 'We couldn’t save that file. Please try again.' };
  }
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
