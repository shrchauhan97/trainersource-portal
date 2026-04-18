import { cn } from '@/components/admin/shared';

export function AdminSection({
  title,
  eyebrow,
  description,
  children,
  className,
}: {
  title: string;
  eyebrow?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'overflow-hidden rounded-[2rem] border border-slate-200/70 bg-white/95 shadow-[0_24px_80px_-42px_rgba(45,79,103,0.55)] backdrop-blur-sm',
        className,
      )}
    >
      <div className="border-b border-slate-200/80 px-6 py-5 sm:px-8">
        {eyebrow ? (
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.35em] text-slate-400">
            {eyebrow}
          </p>
        ) : null}
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h2>
            {description ? <p className="mt-2 max-w-3xl text-sm text-slate-500">{description}</p> : null}
          </div>
        </div>
      </div>
      <div className="px-6 py-6 sm:px-8">{children}</div>
    </section>
  );
}
