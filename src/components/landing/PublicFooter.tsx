import Link from "next/link";

// Same Stitch brand mark used in the sidebar and header — keeps the lockup
// consistent everywhere. `=s512` requests retina-sharp pixels.
const LOGO_URL = "/assets/logo-graphic.png";

const CTA_CLASSES =
  "inline-flex h-12 min-w-[180px] items-center justify-center rounded font-heading text-xs font-bold uppercase tracking-widest text-white transition-all";

export default function PublicFooter() {
  return (
    <footer className="bg-[#121212] text-white px-6 py-12 md:px-16 md:py-16">
      <div className="mx-auto flex max-w-7xl flex-col gap-12 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-6">
          <Link href="/" className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt="TrainerSource"
              className="h-10 w-10 object-contain rounded-sm"
              src={LOGO_URL}
            />
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

        {/* Equal-sized CTAs via shared min-w + h on inline-flex; APPLY NOW and
            CONTACT US render the same width regardless of label length. */}
        <div className="flex flex-col items-start gap-4">
          <Link
            href="/apply"
            className={`${CTA_CLASSES} bg-hyrox-orange hover:bg-orange-600`}
          >
            Apply Now
          </Link>
          <a
            href="mailto:hello@trainersource.app"
            className={`${CTA_CLASSES} border border-white/30 hover:border-white`}
          >
            Contact Us
          </a>
        </div>
      </div>
    </footer>
  );
}
