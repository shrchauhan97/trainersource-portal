import Link from "next/link";
import PublicTopNav from "@/components/landing/PublicTopNav";
import PublicFooter from "@/components/landing/PublicFooter";

type Metric = {
  value: string;
  label: string;
  caption: string;
};

const METRICS: Metric[] = [
  {
    value: "15%",
    label: "Lifetime",
    caption: "Recurring",
  },
  {
    value: "30",
    label: "Days",
    caption: "Automated Settlement",
  },
  {
    value: "SG",
    label: "Active",
    caption: "Region Only",
  },
  {
    value: "07",
    label: "Days",
    caption: "Rapid Integration",
  },
];

const SUPPORT_BULLETS: string[] = [
  "Dedicated affiliate manager for onboarding and growth.",
  "Real-time commission tracking and transparent payouts.",
  "Marketing assets and clinical resources at your fingertips.",
];

export default function AffiliatePage() {
  return (
    <div className="flex min-h-screen w-full flex-col bg-stitch-surface text-stitch-on-surface">
      <PublicTopNav />

      <main className="flex flex-col">
        {/* Hero */}
        <section className="px-6 py-16 md:px-10 md:py-24 lg:py-32">
          <div className="mx-auto flex max-w-7xl flex-col gap-10">
            <span className="inline-flex w-fit items-center rounded-full bg-stitch-tertiary-fixed px-4 py-2 font-heading text-xs font-bold uppercase tracking-[0.3em] text-stitch-on-surface">
              Program Description
            </span>
            <h1 className="font-heading text-5xl font-extrabold uppercase leading-[0.95] tracking-tight text-primary md:text-7xl lg:text-8xl">
              Become A <br />
              TrainerSource <br />
              Affiliate.
            </h1>
            <div
              className="h-[420px] w-full rounded-2xl bg-slate-300"
              role="img"
              aria-label="Hero image of trainer reviewing affiliate dashboard"
            />
            <p className="max-w-3xl text-lg leading-relaxed text-stitch-on-surface-variant md:text-xl">
              Join the most rewarding affiliate program in professional training. Equip your
              clients with premium products while building a recurring revenue stream — backed by
              transparent tracking, dedicated support, and clinical-grade resources.
            </p>
            <Link
              href="/apply"
              className="inline-flex w-fit items-center gap-3 rounded-full bg-hyrox-orange px-9 py-5 font-heading text-base font-bold uppercase tracking-widest text-white shadow-lg transition-all hover:bg-orange-600 hover:shadow-orange-500/30"
            >
              Apply Now
              <span className="material-symbols-outlined">arrow_forward</span>
            </Link>
          </div>
        </section>

        {/* Telemetry grid */}
        <section className="border-y border-stitch-outline-variant/40 bg-stitch-surface-container px-6 py-16 md:px-10 md:py-20">
          <div className="mx-auto grid max-w-7xl grid-cols-2 gap-8 md:grid-cols-4 md:gap-12">
            {METRICS.map((metric) => (
              <div
                key={`${metric.value}-${metric.caption}`}
                className="flex flex-col gap-2 border-l-4 border-hyrox-orange pl-5"
              >
                <div className="font-heading text-5xl font-extrabold tracking-tight text-primary md:text-6xl">
                  {metric.value}
                </div>
                <div className="font-heading text-sm font-bold uppercase tracking-widest text-stitch-on-surface">
                  {metric.label}
                </div>
                <div className="text-sm text-stitch-on-surface-variant">{metric.caption}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Asymmetric detail */}
        <section className="px-6 py-16 md:px-10 md:py-24">
          <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <div
                className="h-[420px] w-full rounded-2xl bg-slate-300 lg:h-[520px]"
                role="img"
                aria-label="Affiliate manager assisting trainer"
              />
            </div>
            <div className="flex flex-col gap-6 lg:col-span-5">
              <span className="font-heading text-xs font-bold uppercase tracking-[0.3em] text-hyrox-orange">
                Affiliate Support
              </span>
              <h2 className="font-heading text-3xl font-extrabold uppercase tracking-tight text-primary md:text-4xl lg:text-5xl">
                Support Systems, For Both Clients and Trainers
              </h2>
              <ul className="flex flex-col gap-4">
                {SUPPORT_BULLETS.map((bullet) => (
                  <li key={bullet} className="flex items-start gap-3">
                    <span className="material-symbols-outlined mt-0.5 text-hyrox-orange">
                      check_circle
                    </span>
                    <span className="text-base leading-relaxed text-stitch-on-surface-variant md:text-lg">
                      {bullet}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
