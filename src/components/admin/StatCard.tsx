export function StatCard({
  label,
  value,
  detail,
  accent = 'slate',
}: {
  label: string;
  value: string;
  detail: string;
  accent?: 'slate' | 'orange';
}) {
  return (
    <div className="relative overflow-hidden rounded-[1.8rem] border border-slate-200/70 bg-white p-6 shadow-[0_24px_60px_-42px_rgba(45,79,103,0.45)]">
      <div
        className={accent === 'orange'
          ? 'absolute inset-x-0 top-0 h-1.5 bg-hyrox-orange'
          : 'absolute inset-x-0 top-0 h-1.5 bg-clinical-slate'}
      />
      <p className="text-[0.72rem] font-semibold uppercase tracking-[0.32em] text-slate-400">{label}</p>
      <p className="mt-4 text-4xl font-black tracking-tight text-slate-950">{value}</p>
      <p className="mt-3 text-sm leading-6 text-slate-500">{detail}</p>
    </div>
  );
}
