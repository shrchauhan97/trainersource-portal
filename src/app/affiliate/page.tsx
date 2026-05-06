import Link from "next/link";
import PublicTopNav from "@/components/landing/PublicTopNav";
import PublicFooter from "@/components/landing/PublicFooter";

// Local /assets/ images — Stitch's lh3.googleusercontent.com/aida URLs
// went 403 once the Stitch design session expired.
const HERO_IMAGE = "/assets/affiliate-trainer.png";
const SUPPORT_IMAGE = "/assets/three-options-labglass.png";

// Verbatim from Stitch HTML — labels include the typo "INITAL" preserved
// from the source so design QA matches exactly. Fix in copy review later.
const METRICS = [
  { label: "INITAL Commission Rate", value: "15", suffix: "%", caption: "Lifetime Recurring" },
  { label: "Payout Cycle", value: "30", suffix: "DAYS", caption: "Automated Settlement" },
  { label: "Territory", value: "SG", suffix: "", caption: "Active Region Only" },
  { label: "Onboarding", value: "07", suffix: "DAYS", caption: "Rapid Integration" },
];

const SUPPORT_BULLETS = [
  "Customized Referral CODES",
  "Real-Time Commission Tracking",
  "PRODUCT DISCOUNTS FOR ACTIVE TRAINERS",
];

export default function AffiliatePage() {
  return (
    <div className="min-h-screen bg-[#f4faff] text-[#161c20]">
      <PublicTopNav />

      <main className="pt-16 min-h-screen">
        {/* Hero */}
        <section className="relative bg-[#f4faff] py-24 px-8 overflow-hidden">
          <div className="max-w-screen-xl mx-auto flex flex-col items-center text-center">
            <div className="inline-block bg-[#79ff5b] text-[#022100] px-3 py-1 mb-8">
              <span className="font-headline font-bold text-[11px] tracking-[0.05em] uppercase">
                PROGRAM DESCRIPTION
              </span>
            </div>
            <h1 className="text-6xl md:text-8xl font-headline font-bold text-[#161c20] tracking-[-0.02em] mb-12 max-w-4xl leading-[0.95]">
              Become A TrainerSource Affiliate.
            </h1>
            <div className="w-full max-w-5xl aspect-video rounded-lg overflow-hidden bg-[#e9eff4] mb-16 shadow-[0px_12px_32px_rgba(45,79,103,0.08)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt="TrainerSource Affiliate Hero"
                className="w-full h-full object-cover object-top grayscale contrast-125 mix-blend-multiply opacity-90"
                src={HERO_IMAGE}
              />
            </div>
            <div className="max-w-2xl mx-auto">
              <p className="text-xl md:text-2xl text-[#41627b] leading-relaxed font-body mb-12">
                TrainerSource affiliates earn generous lifetime commissions on all referred client
                sales, with monthly payments and easy-to-track codes. Currently operating in
                Singapore only, we are seeking sports professionals with an established client base.
                Apply below and start working with us within a week!
              </p>
              <Link
                href="/apply"
                className="inline-block text-white px-12 py-5 rounded-lg text-lg font-bold tracking-wider hover:opacity-90 transition-all shadow-xl active:scale-[0.98]"
                style={{ backgroundColor: "#FF5722" }}
              >
                APPLY NOW
              </Link>
            </div>
          </div>
        </section>

        {/* Telemetry / metrics grid */}
        <section className="bg-[#eef4f9] py-24 px-8">
          <div className="max-w-screen-xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-1">
              {METRICS.map((metric) => (
                <div
                  key={metric.label}
                  className="bg-white p-8 border border-[#c2c7cd]/10"
                >
                  <span className="block font-headline font-bold text-[11px] text-[#41627b] tracking-[0.05em] uppercase mb-4">
                    {metric.label}
                  </span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-5xl font-headline font-bold text-[#161c20]">
                      {metric.value}
                    </span>
                    {metric.suffix ? (
                      <span className="text-xl font-headline font-bold text-[#671800]">
                        {metric.suffix}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-4 text-xs text-[#41627b]/60 font-body uppercase tracking-widest">
                    {metric.caption}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Asymmetric detail */}
        <section className="bg-[#f4faff] py-32 px-8">
          <div className="max-w-screen-xl mx-auto grid md:grid-cols-12 gap-16 items-center">
            <div className="md:col-span-7">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="w-full h-[500px] object-cover rounded-lg"
                alt="State-of-the-art performance laboratory"
                src={SUPPORT_IMAGE}
              />
            </div>
            <div className="md:col-span-5">
              <span className="block font-headline font-bold text-[11px] text-[#671800] tracking-[0.05em] uppercase mb-6">
                AFFILIATE SUPPORT
              </span>
              <h2 className="text-4xl font-headline font-bold text-[#161c20] leading-tight mb-8">
                Support Systems, For Both Clients and Trainers
              </h2>
              <p className="text-[#41627b] font-body leading-relaxed mb-8">
                Our affiliate program is designed for success. We don&apos;t just provide links;
                our trainers are enabled with personalized portals, easy-to-generate codes and the
                best products, starting with Research Peptides.
              </p>
              <div className="space-y-4">
                {SUPPORT_BULLETS.map((bullet) => (
                  <div
                    key={bullet}
                    className="flex items-center gap-4 py-3 border-b border-[#c2c7cd]/10"
                  >
                    <span
                      className="material-symbols-outlined text-[#671800] text-sm"
                      style={{ fontVariationSettings: "'FILL' 1" }}
                    >
                      check_circle
                    </span>
                    <span className="text-sm font-headline font-bold uppercase tracking-wider text-[#161c20]">
                      {bullet}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
