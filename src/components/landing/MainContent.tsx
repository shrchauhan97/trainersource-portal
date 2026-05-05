import Link from "next/link";
import PublicFooter from "./PublicFooter";

const MISSION_HERO_IMAGE =
  "https://lh3.googleusercontent.com/aida/ADBb0uhIy8Vrh_NALhZLF632FHmAX4-Er6WOk7_NbQ9XltfXs2j6RCxEb8_UJ3Yiv5AQyMIOgtrK--DPd7pqR8dWk2BXT7ZIxylz0vprUGiGkitJ1bhmGaTb5QmJgEavLIdNsvWLL_YjrGBJ_Mq7lwm7c-pJsBaXfKDgcR9P71f0vMkV6_wi30A-__yk-JdkEgH9H4jiySMWCAbSzpHNWs5HIBm-U91SOwPfa9GYcxNAs0IaBHqX84xYQXI2TUiLMrccLRQ98irEhJvvCg";

const AFFILIATE_IMAGE =
  "https://lh3.googleusercontent.com/aida/ADBb0uhJl8AqMpwR0n3wBhjRtOXeTEMFakKuy9zpkHIxseJRA1_y-ysF8ilMTftl0-ILcCM3Z-QoI0OurQOHdrjVi1q6mfTkhBA0yfuNxbqewFJT4k88EMQTxsjBUqKBHqTC2D5EWt0tGaYO9wtIvsVoVQaA7TO2QrAMgauoXxc7pdCTfx2uHND7MbZ-IEL-4DcOUTlzP-Bkz8ebwGOMxnMNj8jKOFCVJzsqKWw8xx75CEyKoIsLNN-HlpOFAbj2e5Q45fBmFBdNoxFcDQ";

const FOUNDERS_IMAGE =
  "https://lh3.googleusercontent.com/aida/ADBb0ui7MyZ6_9idRL9ZWufA82-Cqii1FEU1RcJE64Dn2sqF8gr4ug7xJAuZCWOuTrTPxga1yt9D1BRldA8vH2TTtRiU8czPxwU8krghqXXoP9gxRXSDCxEY7YmiYdjgN_Ma6thI_IRJS03O2mbIqc4T5uTNgJggK4-W0Cfi_7yZkTozB3pmUHhtaX57XJVtBnsrThBl9Z9z1BKFJ2D7YBIga9g3B5_2QikSqcFAQm-la1WAiBPw_4wqxIRUMDcK9GHrpKIXFPdcQtPz";

// Icons + copy verbatim from Stitch HTML. Border colours per the original
// per-card accent (deep red for peptides, slate for apparel, deep green for
// recovery) so the design's clinical/categorical signal survives.
const PROGRAM_CARDS = [
  {
    icon: "diversity_2",
    iconColor: "#671800",
    accent: "#671800",
    title: "Peptides",
    description: "Pure, tested and trusted, delivered in three days.",
  },
  {
    icon: "checkroom",
    iconColor: "#41627b",
    accent: "#41627b",
    title: "Apparel",
    description: "Functional, stylish and made to support high-performance training.",
  },
  {
    icon: "medical_services",
    iconColor: "#0b5800",
    accent: "#0b5800",
    title: "Physical Therapy / Recovery",
    description: "Local credentialed professionals ready to assist in client recovery.",
  },
];

export default function MainContent() {
  return (
    <main className="flex-1 lg:ml-[33.333%] min-h-screen bg-[#f4faff]">
      <header className="flex justify-end items-center w-full px-12 py-8 sticky top-0 bg-[#f4faff]/80 backdrop-blur-md z-40">
        <nav className="flex space-x-12">
          <Link
            href="/"
            className="font-body text-sm text-[#671800] font-bold border-b-2 border-[#671800] pb-1"
          >
            Home
          </Link>
          <Link
            href="#peptides"
            className="font-body text-sm text-slate-600 hover:text-[#671800] transition-all opacity-80 hover:opacity-100"
          >
            Peptides
          </Link>
          <Link
            href="#about"
            className="font-body text-sm text-slate-600 hover:text-[#671800] transition-all opacity-80 hover:opacity-100"
          >
            About Us
          </Link>
        </nav>
        <Link
          href="/apply"
          className="ml-12 px-6 py-2 bg-gradient-to-br from-[#671800] to-[#8f2400] text-white font-headline font-bold text-[11px] uppercase tracking-wider rounded-sm hover:opacity-90 transition-opacity"
        >
          Get Started
        </Link>
      </header>

      {/* SECTION 1 — Our Mission */}
      <section className="px-12 py-24 space-y-12">
        <div className="max-w-4xl text-left">
          <span className="inline-block px-3 py-1 bg-[#39FF14] text-black font-headline font-bold tracking-[0.05em] uppercase text-[11px] mb-4">
            OUR MISSION
          </span>
          <h2 className="text-6xl font-black font-display tracking-tight text-[#161c20] mb-8 leading-[1.1]">
            Helping Professional Trainers Discover Professional Products
          </h2>
        </div>
        <div className="w-full aspect-[2.4/1] overflow-hidden rounded-lg shadow-sm max-w-5xl mx-auto">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt="Clinical Gym Environment"
            className="w-full h-full object-cover grayscale-[0.2] contrast-110"
            src={MISSION_HERO_IMAGE}
          />
        </div>
        <div className="max-w-3xl mx-auto text-center pt-12">
          <p className="text-xl leading-relaxed text-[#41627b] font-body">
            Your clients are searching for the right supplements, apparel and services. TrainerSource
            finds those brands and ensures your advice is rewarded.
          </p>
        </div>
      </section>

      {/* SECTION 2 — Categories */}
      <section id="peptides" className="bg-[#f0f4f8] px-12 pt-12 pb-32">
        <div className="mb-20 text-center">
          <h2 className="text-4xl font-extrabold font-display tracking-tight text-[#161c20] mb-2">
            What Do Your Clients Need?
          </h2>
          <p className="text-[#41627b] font-body">
            Three programs to support your clients and reward your referrals.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {PROGRAM_CARDS.map((card) => (
            <div
              key={card.title}
              className="bg-white p-12 rounded-sm shadow-sm flex flex-col items-start transition-transform hover:-translate-y-2 h-full border-b-4"
              style={{ borderBottomColor: card.accent }}
            >
              <div className="w-12 h-12 bg-slate-100 rounded-sm flex items-center justify-center mb-10">
                <span
                  className="material-symbols-outlined text-3xl"
                  style={{ color: card.iconColor }}
                >
                  {card.icon}
                </span>
              </div>
              <h3 className="text-xl font-black font-display mb-4 text-[#161c20] leading-tight">
                {card.title}
              </h3>
              <p className="text-slate-600 text-sm leading-relaxed mb-10 flex-grow">
                {card.description}
              </p>
              <Link
                href="/affiliate"
                className="text-[#671800] font-bold text-[10px] uppercase tracking-widest flex items-center group"
              >
                LEARN MORE{" "}
                <span className="ml-2 group-hover:translate-x-1 transition-transform">→</span>
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* SECTION 3 — TrainerSource Affiliates */}
      <section id="about" className="px-12 py-24 bg-[#f4faff]">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
          <div className="flex flex-col gap-6">
            <span className="font-headline font-bold tracking-[0.05em] uppercase text-[11px] text-[#0b5800] block">
              PARTNERSHIP OPPORTUNITY
            </span>
            <h2 className="text-4xl font-extrabold font-display tracking-tight text-[#161c20]">
              TrainerSource Affiliates
            </h2>
            <p className="text-lg text-[#41627b] font-body leading-relaxed max-w-md">
              Earn lifetime commissions by referring your clients to the premium products they
              already need.
            </p>
            <div className="pt-2">
              <Link
                href="/affiliate"
                className="inline-flex items-center gap-2 border-b-2 border-[#671800] text-[#671800] font-bold text-sm tracking-tight pb-1 hover:opacity-70 transition-all"
              >
                Learn More <span className="material-symbols-outlined text-sm">arrow_forward</span>
              </Link>
            </div>
          </div>
          <div className="relative aspect-square md:aspect-auto md:h-[500px] overflow-hidden rounded-lg group">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt="Affiliate Trainer"
              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 grayscale-[0.2]"
              src={AFFILIATE_IMAGE}
            />
          </div>
        </div>
      </section>

      {/* SECTION 4 — Story */}
      <section id="story" className="px-12 flex gap-16 items-start pb-32 pt-0 flex-col">
        <div className="w-full text-center mb-16">
          <h2 className="text-5xl font-black font-display tracking-tight text-[#161c20] leading-tight">
            The TrainerSource Story
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-start max-w-6xl mx-auto w-full">
          <div className="aspect-square rounded-sm overflow-hidden relative shadow-lg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt="TrainerSource Founders"
              className="w-full h-full object-cover"
              src={FOUNDERS_IMAGE}
            />
          </div>
          <div className="flex flex-col gap-8 pt-4">
            <div className="space-y-6 text-[#41627b] leading-relaxed font-body text-lg">
              <p>
                TrainerSource was founded in a Singapore gym in 2024. Tom &amp; Moe realized their
                trainers were trusted gatekeepers whose advice meant more than any advertising
                campaign.
              </p>
              <p>
                They saw a gap in the market: trainers were providing invaluable scientific and
                product advice without being recognized in the economic loop. Why not ensure that
                valuable advice was rewarded?
              </p>
            </div>
            <div className="pt-4">
              <Link
                href="/affiliate"
                className="inline-block px-10 py-5 bg-[#41627b] text-white font-headline font-bold text-[11px] uppercase tracking-[0.2em] rounded-sm hover:bg-[#2D4F67] transition-all shadow-md"
              >
                READ OUR STORY
              </Link>
            </div>
          </div>
        </div>
      </section>

      <PublicFooter />
    </main>
  );
}
