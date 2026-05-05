import Link from "next/link";

type NavLink = {
  label: string;
  href: string;
};

const NAV_LINKS: NavLink[] = [
  { label: "Programs", href: "#programs" },
  { label: "Analytics", href: "#analytics" },
  { label: "Equipment", href: "#equipment" },
  { label: "Lab Reports", href: "#lab-reports" },
];

export default function PublicTopNav() {
  return (
    <header className="sticky top-0 z-30 w-full border-b border-stitch-outline-variant/40 bg-stitch-surface/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 md:px-10">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded bg-hyrox-orange text-sm font-extrabold text-white">
            TS
          </div>
          <span className="font-heading text-lg font-extrabold uppercase tracking-widest text-stitch-on-surface">
            TrainerSource
          </span>
        </Link>

        <nav className="hidden items-center gap-8 font-heading text-sm font-bold uppercase tracking-widest text-stitch-on-surface md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="transition-colors hover:text-primary"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-4">
          <button
            type="button"
            aria-label="Notifications"
            className="hidden h-10 w-10 items-center justify-center rounded-full text-stitch-on-surface-variant transition-colors hover:bg-stitch-surface-container md:flex"
          >
            <span className="material-symbols-outlined">notifications</span>
          </button>
          <button
            type="button"
            aria-label="Account"
            className="hidden h-10 w-10 items-center justify-center rounded-full text-stitch-on-surface-variant transition-colors hover:bg-stitch-surface-container md:flex"
          >
            <span className="material-symbols-outlined">account_circle</span>
          </button>
          <Link
            href="/apply"
            className="rounded-full bg-gradient-to-r from-[#FF5722] to-[#FF8A50] px-6 py-2.5 font-heading text-xs font-bold uppercase tracking-widest text-white shadow-md transition-all hover:shadow-lg hover:brightness-105"
          >
            Get Started
          </Link>
        </div>
      </div>
    </header>
  );
}
