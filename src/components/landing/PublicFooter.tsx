import Link from "next/link";

export default function PublicFooter() {
  return (
    <footer className="bg-[#121212] text-white px-6 py-12 md:px-16 md:py-16">
      <div className="mx-auto flex max-w-7xl flex-col gap-12 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-6">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded bg-hyrox-orange text-sm font-extrabold text-white">
              TS
            </div>
            <span className="font-heading text-xl font-extrabold uppercase tracking-widest text-white">
              TrainerSource
            </span>
          </Link>
          <p className="max-w-xs text-sm text-white/60">
            © {new Date().getFullYear()} TRAINERSOURCE PERFORMANCE LAB. ALL RIGHTS RESERVED.
          </p>
        </div>

        <nav className="grid grid-cols-2 gap-x-12 gap-y-3 font-heading text-sm uppercase tracking-widest md:grid-cols-1">
          <Link href="/#story" className="text-white/70 transition-colors hover:text-white">
            About
          </Link>
          <Link href="/affiliate" className="text-white/70 transition-colors hover:text-white">
            Affiliate
          </Link>
          <Link href="/apply" className="text-white/70 transition-colors hover:text-white">
            Apply
          </Link>
        </nav>

        <div className="flex flex-col items-start gap-4">
          <Link
            href="/apply"
            className="rounded bg-hyrox-orange px-7 py-3 font-heading text-xs font-bold uppercase tracking-widest text-white transition-all hover:bg-orange-600"
          >
            Apply Now
          </Link>
          <a
            href="mailto:hello@trainersource.app"
            className="rounded border border-white/30 px-7 py-3 font-heading text-xs font-bold uppercase tracking-widest text-white transition-all hover:border-white"
          >
            Contact Us
          </a>
        </div>
      </div>
    </footer>
  );
}
