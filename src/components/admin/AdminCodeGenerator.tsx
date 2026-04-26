'use client';

import { useState } from 'react';

type AdminCodeType = 'founder' | 'organic';

type GeneratedCode = {
  code: string;
  expires_at: string;
};

type GenerateCodesResponse = {
  codes?: GeneratedCode[];
  error?: string;
};

function formatExpiry(value: string) {
  return new Date(value).toLocaleString();
}

export function AdminCodeGenerator() {
  const [type, setType] = useState<AdminCodeType>('founder');
  const [count, setCount] = useState(1);
  const [codes, setCodes] = useState<GeneratedCode[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copiedValue, setCopiedValue] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function copyText(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedValue(value);
      setError(null);
    } catch {
      setError('Unable to copy to clipboard right now.');
    }
  }

  const handleSubmit: NonNullable<React.ComponentProps<'form'>['onSubmit']> = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setCopiedValue(null);

    try {
      const response = await fetch('/api/admin/codes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type,
          count,
        }),
      });

      const payload = (await response.json()) as GenerateCodesResponse;

      if (!response.ok) {
        setCodes([]);
        setError(payload.error ?? 'Unable to generate codes.');
        return;
      }

      setCodes(payload.codes ?? []);
    } catch (submissionError) {
      console.error(submissionError);
      setCodes([]);
      setError('Unable to generate codes right now.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-5 rounded-[1.8rem] border border-slate-200 bg-slate-50/80 p-5">
      <div>
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.32em] text-slate-400">Generate codes</p>
        <h3 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">Direct traffic inventory</h3>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <select
          value={type}
          onChange={(event) => setType(event.target.value as AdminCodeType)}
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-clinical-slate"
        >
          <option value="founder">Founder code</option>
          <option value="organic">Organic code</option>
        </select>
        <input
          value={count}
          onChange={(event) => {
            const nextValue = Number(event.target.value);
            setCount(Number.isFinite(nextValue) ? Math.max(1, Math.min(10, Math.trunc(nextValue))) : 1);
          }}
          type="number"
          min="1"
          max="10"
          step="1"
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-clinical-slate"
        />
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex w-full items-center justify-center rounded-2xl bg-hyrox-orange px-4 py-3 text-sm font-semibold uppercase tracking-[0.22em] text-white transition hover:bg-[#e64b1b] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? 'Generating codes' : 'Generate codes'}
        </button>
      </form>

      <div className="rounded-[1.5rem] border border-hyrox-orange/15 bg-hyrox-orange/8 p-5 text-sm leading-6 text-slate-600">
        Founder and organic codes stay unattached to trainer accounts so admin can support private launch campaigns and direct acquisition.
      </div>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      {codes.length ? (
        <div className="space-y-3 rounded-[1.5rem] border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Generated codes</p>
            <button
              type="button"
              onClick={() => copyText(codes.map((entry) => entry.code).join('\n'))}
              className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
            >
              Copy all
            </button>
          </div>

          <div className="space-y-2">
            {codes.map((entry) => (
              <div
                key={entry.code}
                className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-semibold uppercase tracking-[0.18em] text-slate-900">{entry.code}</p>
                  <p className="text-xs text-slate-500">Expires {formatExpiry(entry.expires_at)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => copyText(entry.code)}
                  className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600 transition hover:border-slate-300 hover:bg-white"
                >
                  {copiedValue === entry.code ? 'Copied' : 'Copy'}
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
