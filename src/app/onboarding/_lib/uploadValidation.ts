// Per-upload-kind allowlists for content type and file extension. Without
// these, a trainer could upload an SVG with embedded JS (XSS vector when an
// admin previews it via signed URL) or any active executable.

export type UploadKind = 'qualification' | 'selfie_video' | 'signed_agreement';

type Spec = {
  /** Mime types we'll accept. file.type is browser-supplied; we still trust it
   *  here because Supabase Storage doesn't sniff content. Pair with extension
   *  check + the storage-bucket non-public flag for defence in depth. */
  contentTypes: readonly string[];
  /** Lowercase extensions (no leading dot). Filename trust is limited — see
   *  sanitiseExtension below — but extension alignment with content type is a
   *  cheap consistency check. */
  extensions: readonly string[];
  /** Per-kind size cap. Selfie videos are bigger; cert PDFs and JPEG scans
   *  shouldn't be huge. */
  maxBytes: number;
  /** Folder prefix inside the trainer's storage folder. Hardcoded — never
   *  taken from user input — so we can never path-traverse out. */
  folderPrefix: string;
};

const MB = 1024 * 1024;

export const UPLOAD_SPECS: Record<UploadKind, Spec> = {
  qualification: {
    contentTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
    extensions: ['pdf', 'jpg', 'jpeg', 'png', 'webp'],
    maxBytes: 10 * MB,
    folderPrefix: 'qualification',
  },
  selfie_video: {
    contentTypes: ['video/mp4', 'video/quicktime', 'video/webm'],
    extensions: ['mp4', 'mov', 'webm'],
    maxBytes: 50 * MB,
    folderPrefix: 'selfie-video',
  },
  signed_agreement: {
    contentTypes: ['application/pdf'],
    extensions: ['pdf'],
    maxBytes: 10 * MB,
    folderPrefix: 'signed-agreement',
  },
};

// Strip path separators, control chars, and anything that isn't a-z0-9. The
// extension we end up using is the LAST canonical match against the spec —
// we don't trust file.name beyond reading the trailing token.
export function sanitiseExtension(filename: string, allowed: readonly string[]): string | null {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot < 0) return null;
  const raw = filename.slice(lastDot + 1).toLowerCase();
  // Strip anything that isn't a basic ASCII letter/digit. Stops "exe%00.pdf"
  // and similar tricks.
  const cleaned = raw.replace(/[^a-z0-9]/g, '');
  if (!cleaned) return null;
  return allowed.includes(cleaned) ? cleaned : null;
}

export type ValidationOk = { ok: true; extension: string };
export type ValidationFail = { ok: false; error: string };

// Single entry point. Returns a sanitised extension when the file passes;
// otherwise an error string safe to surface to the client (no internals).
export function validateUpload(file: File, kind: UploadKind): ValidationOk | ValidationFail {
  const spec = UPLOAD_SPECS[kind];
  if (file.size === 0) {
    return { ok: false, error: 'File is empty.' };
  }
  if (file.size > spec.maxBytes) {
    return { ok: false, error: `File too large. Maximum is ${spec.maxBytes / MB} MB.` };
  }
  if (file.type && !spec.contentTypes.includes(file.type)) {
    return {
      ok: false,
      error: `Unsupported file type. Allowed: ${spec.contentTypes.join(', ')}.`,
    };
  }
  const extension = sanitiseExtension(file.name, spec.extensions);
  if (!extension) {
    return {
      ok: false,
      error: `Unsupported extension. Allowed: ${spec.extensions.join(', ')}.`,
    };
  }
  return { ok: true, extension };
}
