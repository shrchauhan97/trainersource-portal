import Link from "next/link";

const LOGO_URL = "/assets/logo-graphic.png";

type NavLink = {
  label: string;
  href: string;
};

const NAV_LINKS: NavLink[] = [
  { label: "Home", href: "/" },
  { label: "Affiliate", href: "/affiliate" },
  { label: "Apply", href: "/apply" },
];

// Shared shape for Log In + Get Started so they read as a secondary/primary
// pair — same height, padding, radius. Ghost vs filled handles the hierarchy.
const CTA_BASE =
  "inline-flex h-10 items-center justify-center rounded-full px-5 font-heading text-xs font-bold uppercase tracking-widest transition-all";

export default function PublicTopNav() {
  return (
    <header className="sticky top-0 z-30 w-full border-b border-stitch-outline-variant/40 bg-stitch-surface/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 md:px-10 md:py-4">
        <Link href="/" className="flex items-center gap-2 md:gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt="TrainerSource"
            className="h-9 w-9 object-contain rounded-sm md:h-10 md:w-10"
            src={LOGO_URL}
          />
          <span className="font-heading text-base font-extrabold uppercase tracking-widest text-stitch-on-surface md:text-lg">
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

        <div className="flex items-center gap-2 md:gap-3">
          <Link
            href="/login"
            className={`${CTA_BASE} border border-stitch-on-surface/30 text-stitch-on-surface hover:border-stitch-on-surface hover:text-primary`}
          >
            Log In
          </Link>
          <Link
            href="/apply"
            className={`${CTA_BASE} bg-gradient-to-r from-[#FF5722] to-[#FF8A50] text-white shadow-md hover:shadow-lg hover:brightness-105`}
          >
            Get Started
          </Link>
        </div>
      </div>
    </header>
  );
}
