import Link from "next/link";

type SidebarFeature = {
  icon: string;
  title: string;
  description: string;
};

const FEATURES: SidebarFeature[] = [
  {
    icon: "support_agent",
    title: "Always-On Support",
    description: "Dedicated clinical guidance for you and your clients.",
  },
  {
    icon: "storefront",
    title: "Online Store",
    description: "Seamless purchasing experience via our platform.",
  },
  {
    icon: "payments",
    title: "Affiliate Codes",
    description: "Track referrals and earn commission automatically.",
  },
];

export default function Sidebar() {
  return (
    <aside className="z-20 flex w-full flex-col bg-clinical-slate text-white lg:fixed lg:bottom-0 lg:left-0 lg:top-0 lg:w-1/3">
      <div className="flex flex-1 flex-col gap-12 overflow-y-auto p-6 md:p-12 lg:p-16">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded bg-hyrox-orange text-sm font-extrabold text-white">
            TS
          </div>
          <span className="font-heading text-2xl font-extrabold uppercase tracking-widest">
            TrainerSource
          </span>
        </Link>

        <h1 className="font-heading text-4xl font-extrabold uppercase leading-none tracking-tight md:text-5xl lg:text-6xl">
          Where <br className="hidden lg:block" />
          Trainers <br className="hidden lg:block" />
          Thrive
        </h1>

        <div className="flex flex-col gap-4">
          <span className="font-heading text-xs font-bold uppercase tracking-[0.3em] text-hyrox-orange">
            Bringing Trainers
          </span>

          <div className="grid grid-cols-1 gap-3">
            {FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="flex items-start gap-4 rounded-xl border border-white/20 bg-white/10 p-5 backdrop-blur-sm"
              >
                <span className="material-symbols-outlined shrink-0 text-3xl text-hyrox-orange">
                  {feature.icon}
                </span>
                <div>
                  <h3 className="mb-1 font-heading text-base font-bold uppercase tracking-wide">
                    {feature.title}
                  </h3>
                  <p className="font-body text-sm text-white/80">
                    {feature.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-auto pt-8">
          <Link
            href="/apply"
            className="block w-full rounded-lg bg-hyrox-orange px-6 py-5 text-center font-heading text-lg font-bold uppercase tracking-widest text-white shadow-lg transition-all hover:bg-orange-600 hover:shadow-orange-500/20"
          >
            Join The Program
          </Link>
        </div>
      </div>
    </aside>
  );
}
