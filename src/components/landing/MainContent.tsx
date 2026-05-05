import Link from "next/link";
import PublicFooter from "./PublicFooter";

type ProgramCard = {
  icon: string;
  title: string;
  description: string;
  href: string;
};

const PROGRAM_CARDS: ProgramCard[] = [
  {
    icon: "science",
    title: "Peptides",
    description: "Premium research-grade compounds for performance and recovery.",
    href: "#peptides",
  },
  {
    icon: "checkroom",
    title: "Apparel",
    description: "Studio-ready training apparel built for professional athletes.",
    href: "#apparel",
  },
  {
    icon: "self_improvement",
    title: "Recovery",
    description: "Tools and protocols to keep your clients moving at their peak.",
    href: "#recovery",
  },
];

export default function MainContent() {
  return (
    <main className="flex w-full flex-col bg-surface text-slate-900 lg:ml-[33.333333%] lg:w-2/3">
      <nav className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-surface/90 px-6 py-4 backdrop-blur-md md:px-10">
        <div className="flex gap-6 font-heading text-sm font-bold uppercase tracking-widest">
          <Link href="/" className="transition-colors hover:text-primary">
            Home
          </Link>
          <Link href="#peptides" className="transition-colors hover:text-primary">
            Peptides
          </Link>
          <Link href="#about" className="transition-colors hover:text-primary">
            About Us
          </Link>
        </div>
        <Link
          href="/apply"
          className="rounded-full bg-gradient-to-r from-[#FF5722] to-[#FF8A50] px-6 py-2.5 font-heading text-xs font-bold uppercase tracking-widest text-white shadow-md transition-all hover:shadow-lg hover:brightness-105"
        >
          Get Started
        </Link>
      </nav>

      <div className="flex flex-col gap-24 p-6 md:p-12 lg:p-16">
        {/* Section 1: Our Mission */}
        <section id="mission" className="flex flex-col gap-8">
          <span className="inline-flex w-fit items-center rounded-full bg-emerald-100 px-4 py-2 font-heading text-xs font-bold uppercase tracking-[0.25em] text-emerald-800">
            Our Mission
          </span>
          <h2 className="font-heading text-4xl font-extrabold uppercase leading-tight tracking-tight text-primary md:text-5xl lg:text-6xl">
            Helping Professional Trainers Discover Professional Products
          </h2>
          <div
            className="h-[400px] w-full rounded-2xl bg-slate-300"
            role="img"
            aria-label="Hero image of professional trainer"
          />
          <p className="mx-auto max-w-3xl text-center text-lg leading-relaxed text-slate-600">
            We partner with the best in the industry so trainers can offer their clients premium
            products with confidence — backed by clinical guidance, transparent sourcing, and a
            platform built for professionals.
          </p>
        </section>

        {/* Section 2: What Do Your Clients Need? */}
        <section id="programs" className="flex flex-col gap-10">
          <h2 className="font-heading text-3xl font-extrabold uppercase tracking-tight text-primary md:text-4xl">
            What Do Your Clients Need?
          </h2>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {PROGRAM_CARDS.map((card) => (
              <Link
                key={card.title}
                href={card.href}
                className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg"
              >
                <span className="material-symbols-outlined text-4xl text-hyrox-orange">
                  {card.icon}
                </span>
                <h3 className="font-heading text-xl font-bold uppercase tracking-wide text-clinical-slate">
                  {card.title}
                </h3>
                <p className="text-sm text-slate-600">{card.description}</p>
                <span className="mt-auto inline-flex items-center gap-2 font-heading text-xs font-bold uppercase tracking-widest text-primary">
                  Learn More
                  <span className="material-symbols-outlined text-base">arrow_forward</span>
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* Section 3: TrainerSource Affiliates */}
        <section
          id="affiliates"
          className="grid grid-cols-1 items-center gap-12 rounded-2xl bg-white p-8 shadow-sm md:grid-cols-2 md:p-12"
        >
          <div
            className="h-[320px] w-full rounded-xl bg-slate-300"
            role="img"
            aria-label="Trainer working with client"
          />
          <div className="flex flex-col gap-6">
            <span className="font-heading text-xs font-bold uppercase tracking-[0.3em] text-hyrox-orange">
              Partnership Opportunity
            </span>
            <h2 className="font-heading text-3xl font-extrabold uppercase tracking-tight text-primary md:text-4xl">
              TrainerSource Affiliates
            </h2>
            <p className="text-lg leading-relaxed text-slate-600">
              Earn lifetime recurring commission on every client you refer. Our affiliate program
              gives you the tools, tracking, and creative assets to grow a passive revenue stream
              alongside your training business.
            </p>
            <Link
              href="/affiliate"
              className="inline-flex w-fit items-center gap-2 rounded bg-hyrox-orange px-7 py-4 font-heading text-sm font-bold uppercase tracking-widest text-white transition-all hover:bg-orange-600"
            >
              Learn More
              <span className="material-symbols-outlined text-base">arrow_forward</span>
            </Link>
          </div>
        </section>

        {/* Section 4: TrainerSource Story */}
        <section id="about" className="grid grid-cols-1 items-center gap-12 md:grid-cols-2">
          <div
            className="h-[400px] w-full rounded-2xl bg-slate-300"
            role="img"
            aria-label="The TrainerSource team"
          />
          <div className="flex flex-col gap-6">
            <h2 className="font-heading text-3xl font-extrabold uppercase tracking-tight text-primary md:text-4xl">
              The TrainerSource Story
            </h2>
            <p className="text-lg leading-relaxed text-slate-600">
              TrainerSource was founded by trainers who were frustrated with the lack of
              professional-grade products available to their clients. We saw the gap between
              clinical-grade research and the consumer market — and built a platform to bridge it.
            </p>
            <p className="text-lg leading-relaxed text-slate-600">
              Today we partner with industry-leading labs to deliver verified products, backed by
              transparent reporting and dedicated support, so trainers can recommend with
              confidence.
            </p>
            <Link
              href="#story"
              className="inline-flex w-fit items-center gap-2 rounded border-2 border-primary px-7 py-4 font-heading text-sm font-bold uppercase tracking-widest text-primary transition-all hover:bg-primary hover:text-white"
            >
              Read Our Story
              <span className="material-symbols-outlined text-base">arrow_forward</span>
            </Link>
          </div>
        </section>
      </div>

      <PublicFooter />
    </main>
  );
}
