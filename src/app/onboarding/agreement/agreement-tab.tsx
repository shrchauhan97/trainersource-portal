'use client';

import { useActionState } from 'react';
import type { TrainerAgreement } from '../_lib/types';
import { uploadSignedAgreement } from './actions';

type UploadState = { error?: string; success?: boolean } | null;

async function uploadAction(_prev: UploadState, formData: FormData): Promise<UploadState> {
  return uploadSignedAgreement(formData);
}

// Tab 2 of Step 3. Static copy + agreement icon placeholder + a download
// link to the unsigned PDF + a single file input that uploads the signed PDF.
// The NEXT button lives on the parent screen so it can also gate on Tab 1.
export function AgreementTab({
  trainerId,
  pdfUrl,
  agreement,
}: {
  trainerId: string;
  pdfUrl: string | null;
  agreement: TrainerAgreement | null;
}) {
  const [uploadState, formAction, pending] = useActionState<UploadState, FormData>(
    uploadAction,
    null,
  );

  const alreadyUploaded = Boolean(agreement?.signed_agreement_path);
  const signedAt = agreement?.signed_at;

  return (
    <div className="space-y-8">
      <p className="text-sm leading-6 text-[#173041]">
        We&apos;re so excited. You&apos;re almost there. Just fill this out, digitally sign and upload.
      </p>

      <div className="flex flex-col items-start gap-5 rounded-[1rem] border border-[#41627B]/20 bg-[#eff6fb] p-6 sm:flex-row sm:items-center sm:gap-6">
        <div
          aria-hidden
          className="flex h-20 w-16 shrink-0 items-center justify-center rounded-md border border-[#41627B]/30 bg-white text-[10px] font-bold uppercase tracking-[0.16em] text-[#2D4F67]/72 shadow-[0_8px_18px_rgba(45,79,103,0.1)]"
        >
          PDF
        </div>
        <div className="flex-1 space-y-2">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#173041]">Trainer agreement</p>
          <p className="text-sm text-[#2D4F67]/80">
            Download the agreement, digitally sign it, then upload the signed copy below.
          </p>
          {pdfUrl ? (
            <a
              href={pdfUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-[0.16em] text-[#FF5722] hover:text-[#d8431a]"
            >
              Download agreement PDF
              <span aria-hidden>↓</span>
            </a>
          ) : (
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#2D4F67]/56">
              Agreement PDF link not configured.
            </p>
          )}
        </div>
      </div>

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="trainerId" value={trainerId} />
        <div className="overflow-hidden rounded-[0.75rem] border border-[#41627B]/30">
          <div className="grid grid-cols-1 sm:grid-cols-[200px_minmax(0,1fr)]">
            <div className="flex h-full items-center bg-[#173041] px-4 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-white">
              Signed Agreement
            </div>
            <div className="bg-white p-4">
              <input
                type="file"
                name="signed_agreement"
                accept="application/pdf,image/*"
                required
                className="block w-full text-sm text-[#173041] file:mr-4 file:rounded-full file:border-0 file:bg-[#bfe1fe] file:px-4 file:py-2 file:text-xs file:font-bold file:uppercase file:tracking-[0.16em] file:text-[#173041] hover:file:bg-[#a8cbe7]"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm">
            {uploadState?.error ? (
              <span className="font-semibold text-[#b3261e]">{uploadState.error}</span>
            ) : uploadState?.success ? (
              <span className="font-semibold text-[#1d6f42]">Signed agreement uploaded.</span>
            ) : alreadyUploaded ? (
              <span className="font-semibold text-[#1d6f42]">
                Signed agreement on file{signedAt ? ` (${new Date(signedAt).toLocaleDateString()})` : ''}.
              </span>
            ) : null}
          </div>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center justify-center rounded-full border border-[#41627B]/30 bg-white px-6 py-2.5 text-xs font-bold uppercase tracking-[0.18em] text-[#173041] transition hover:bg-[#bfe1fe]/60 disabled:opacity-60"
          >
            {pending ? 'Uploading…' : alreadyUploaded ? 'Replace upload' : 'Upload signed agreement'}
          </button>
        </div>
      </form>
    </div>
  );
}
