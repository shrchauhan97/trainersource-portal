'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { saveQualifications, type QualificationsState } from './actions';
import type { TrainerOnboardingState, TrainerQualification } from '../_lib/types';
import { TextInput } from './contact-form';

const initial: QualificationsState = { ok: false };

type RowDraft = {
  certificate_name: string;
  issuing_body: string;
  date_of_issue: string;
  is_current: boolean;
  // Keep a stable id so React reconciliation doesn't drop file inputs as
  // the user adds/removes rows.
  uid: string;
};

function emptyRow(): RowDraft {
  return {
    certificate_name: '',
    issuing_body: '',
    date_of_issue: '',
    is_current: false,
    uid: Math.random().toString(36).slice(2),
  };
}

function fromExisting(q: TrainerQualification): RowDraft {
  return {
    certificate_name: q.certificate_name ?? '',
    issuing_body: q.issuing_body ?? '',
    date_of_issue: q.date_of_issue ?? '',
    is_current: !!q.is_current,
    uid: q.id,
  };
}

// QUALIFICATIONS tab. Fully optional per PDF copy. We render at least 3 empty
// rows on first visit, plus an "Add row" button. The server action wipes and
// re-inserts (delete-and-insert) rather than per-row CRUD — simpler for v1.
export function QualificationsForm({
  initial: state,
  onSaved,
  onBack,
}: {
  initial: TrainerOnboardingState;
  onSaved: () => void;
  onBack: () => void;
}) {
  const [actionState, formAction] = useActionState(saveQualifications, initial);
  const [rows, setRows] = useState<RowDraft[]>(() => {
    const existing = state.qualifications.map(fromExisting);
    while (existing.length < 3) existing.push(emptyRow());
    return existing;
  });
  const previousOk = useRef(false);

  useEffect(() => {
    if (actionState.ok && !previousOk.current) {
      previousOk.current = true;
      onSaved();
    }
    if (!actionState.ok) previousOk.current = false;
  }, [actionState, onSaved]);

  function updateRow(idx: number, patch: Partial<RowDraft>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setRows((prev) => [...prev, emptyRow()]);
  }
  function removeRow(idx: number) {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  }

  return (
    <form action={formAction} className="space-y-5">
      <p className="text-sm leading-6 text-[#2D4F67]/80">
        Fill out the below to share any relevant professional qualifications.{' '}
        <strong className="font-semibold text-[#173041]">NOTE:</strong> these are not required for
        personal trainers.
      </p>

      <div className="overflow-hidden rounded-xl border border-[#41627B]/20">
        <div className="grid grid-cols-12 gap-px bg-[#41627B]/15 text-[10px] font-bold uppercase tracking-[0.18em] text-white">
          <div className="col-span-3 bg-[#173041] px-3 py-2">Certificate</div>
          <div className="col-span-3 bg-[#173041] px-3 py-2">Issuing body</div>
          <div className="col-span-2 bg-[#173041] px-3 py-2">Date of issue</div>
          <div className="col-span-1 bg-[#173041] px-3 py-2 text-center">Current?</div>
          <div className="col-span-2 bg-[#173041] px-3 py-2">Upload</div>
          <div className="col-span-1 bg-[#173041] px-3 py-2" aria-hidden />
        </div>

        {rows.map((row, idx) => (
          <div
            key={row.uid}
            className="grid grid-cols-12 gap-px border-t border-[#41627B]/10 bg-[#41627B]/10"
          >
            <div className="col-span-3 bg-[#eff6fb] px-3 py-2">
              <TextInput
                name="certificate_name[]"
                value={row.certificate_name}
                onChange={(e) => updateRow(idx, { certificate_name: e.target.value })}
                placeholder="e.g. Sports Nutritionist"
              />
            </div>
            <div className="col-span-3 bg-[#eff6fb] px-3 py-2">
              <TextInput
                name="issuing_body[]"
                value={row.issuing_body}
                onChange={(e) => updateRow(idx, { issuing_body: e.target.value })}
                placeholder="e.g. NASM"
              />
            </div>
            <div className="col-span-2 bg-[#eff6fb] px-3 py-2">
              <TextInput
                type="date"
                name="date_of_issue[]"
                value={row.date_of_issue}
                onChange={(e) => updateRow(idx, { date_of_issue: e.target.value })}
              />
            </div>
            <div className="col-span-1 flex items-center justify-center bg-[#eff6fb] px-3 py-2">
              <input
                type="checkbox"
                // Indexed name dodges the FormData "unchecked omitted" bug
                // that would break parallel arrays. Server reads
                // `is_current_<idx>` for each row.
                name={`is_current_${idx}`}
                checked={row.is_current}
                onChange={(e) => updateRow(idx, { is_current: e.target.checked })}
                className="h-4 w-4 accent-[#173041]"
              />
            </div>
            <div className="col-span-2 bg-[#eff6fb] px-3 py-2">
              <input
                type="file"
                name="upload[]"
                accept="image/*,.pdf"
                className="block w-full text-xs text-[#173041]"
              />
            </div>
            <div className="col-span-1 flex items-center justify-center bg-[#eff6fb] px-3 py-2">
              <button
                type="button"
                onClick={() => removeRow(idx)}
                className="rounded text-xs font-bold uppercase tracking-[0.16em] text-[#2D4F67]/60 hover:text-[#FF5722]"
                aria-label={`Remove row ${idx + 1}`}
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={addRow}
          className="rounded-full border border-[#41627B]/30 bg-white px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-[#173041] transition hover:bg-[#eff6fb]"
        >
          + Add row
        </button>
      </div>

      {actionState.error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{actionState.error}</p>
      ) : null}

      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={onBack}
          className="rounded-full border border-[#41627B]/30 bg-white px-5 py-2.5 text-xs font-bold uppercase tracking-[0.18em] text-[#173041] transition hover:bg-[#eff6fb]"
        >
          Back
        </button>
        <NextButton />
      </div>
    </form>
  );
}

function NextButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center justify-center rounded-full bg-[#173041] px-7 py-3 text-sm font-bold uppercase tracking-[0.18em] text-white transition hover:bg-[#0f2230] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? 'Saving…' : 'Next'}
    </button>
  );
}
