import Link from "next/link";

// TS brand mark from Stitch — same logo used in the sidebar, header, and
// footer for visual consistency. Hosted by Google's design CDN; appending
// `=s512` requests a 512px max edge so the logo stays sharp at retina sizes.
const LOGO_URL =
  "https://lh3.googleusercontent.com/aida/ADBb0uhuqn6jm0dzZBLKIx3NBoKunJZ2S5zC8X8zHDpAXrFB8hD8pIsnj7Qtb5I9GwEm3L2Y87-XDhg9-Z_8w_xcEQtCOx6JEFy48IJxL1ytoLO1-6Tjy_Ux-sKrbczecS2LKria36HZSHQfmo8vQT2cNyCMkY7kwUm398-4U23aRrdNe3lBjoFJcFQ7IB5yJ8IPMc_20urTNkEoNZb_EvfQ_UJ0x8Dw49idEdVryijByK0bjMFtDW2Cx_q7xcukBdccjcx_Xsfi16UO=s512";

type NavLink = {
  label: string;
  href: string;
};

const NAV_LINKS: NavLink[] = [
  { label: "Home", href: "/" },
  { label: "Affiliate", href: "/affiliate" },
  { label: "Apply", href: "/apply" },
];

export default function PublicTopNav() {
  return (
    <header className="sticky top-0 z-30 w-full border-b border-stitch-outline-variant/40 bg-stitch-surface/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 md:px-10">
        <Link href="/" className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt="TrainerSource"
            className="h-10 w-10 object-contain rounded-sm"
            src={LOGO_URL}
          />
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

        <div className="flex items-center gap-6">
          <Link
            href="/login"
            className="font-heading text-xs font-bold uppercase tracking-widest text-stitch-on-surface transition-colors hover:text-primary"
          >
            Log In
          </Link>
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
