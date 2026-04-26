type StatCardProps = {
  label: string;
  value: string;
  accent: string;
};

export function StatCard({ label, value, accent }: StatCardProps) {
  return (
    <div className="relative overflow-hidden rounded-[1.75rem] border border-[#2D4F67]/12 bg-white px-5 py-6 shadow-[0_24px_60px_rgba(45,79,103,0.10)]">
      <div
        className="absolute inset-x-5 top-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent 0%, ${accent} 50%, transparent 100%)` }}
      />
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#2D4F67]/58">{label}</p>
        <p className="text-3xl font-black tracking-tight text-[#173041]">{value}</p>
      </div>
      <div
        className="absolute -right-10 -top-10 h-28 w-28 rounded-full blur-2xl"
        style={{ backgroundColor: `${accent}22` }}
      />
    </div>
  );
}
