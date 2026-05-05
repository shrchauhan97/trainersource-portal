// src/app/mini/partner/CodesList.tsx
'use client';

type Code = {
  id: string;
  code: string;
  displayStatus: 'active' | 'consumed' | 'expired';
  consumedByName: string | null;
  created_at: string;
  expires_at: string;
};

type Props = {
  codes: Code[];
  total: number;
};

const VISIBLE_LIMIT = 4;

export default function CodesList({ codes, total }: Props) {
  const visible = codes.slice(0, VISIBLE_LIMIT);
  const remainder = Math.max(0, total - visible.length);

  return (
    <section className="rounded-2xl border border-[#243444] bg-[#1a2a3a] p-4">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#cc8218]">
        Active codes ({total})
      </h2>
      {visible.length === 0 ? (
        <p className="mt-3 text-sm text-[#94a3b8]">
          No active codes yet. Tap the MainButton below to issue your first.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {visible.map((c) => (
            <li key={c.id} className="flex items-center justify-between text-sm">
              <span className="font-mono tracking-wide text-[#e6c875]">{c.code}</span>
              <span className="text-xs text-[#94a3b8]">
                {c.consumedByName ? (
                  <>
                    <span className="text-[#2db5a3]">→</span> {c.consumedByName}
                  </>
                ) : (
                  'unused'
                )}
              </span>
            </li>
          ))}
          {remainder > 0 && (
            <li className="text-xs text-[#94a3b8] pt-1">
              + {remainder} more (see full portal)
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
