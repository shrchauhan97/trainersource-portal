import Image from "next/image";
import Link from "next/link";

type MainContentProps = {
  showAgeNotice?: boolean;
};

export default function MainContent({ showAgeNotice = false }: MainContentProps) {
  return (
    <main className="w-full lg:ml-[33.333%] lg:w-2/3 bg-surface text-on-surface">
      <nav className="sticky top-0 z-40 bg-white border-b border-slate-200 px-12 py-5 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="#three-options" className="text-[14px] font-bold uppercase tracking-wider text-slate-900 hover:text-clinical-slate transition-colors">Peptides</Link>
          <Link href="#ultimate-mission" className="text-[14px] font-bold uppercase tracking-wider text-slate-900 hover:text-clinical-slate transition-colors">About Us</Link>
        </div>
        <div className="flex items-center gap-6">
          <Link href="/login" className="text-[14px] font-bold uppercase tracking-wider text-slate-900 hover:text-clinical-slate transition-colors">Log In</Link>
          <Link href="/apply" className="text-[14px] font-bold uppercase tracking-wider border border-slate-900 px-5 py-2 rounded-sm hover:bg-slate-900 hover:text-white transition-all">Sign Up</Link>
        </div>
      </nav>

      <section id="program-partner" className="bg-white pb-12 px-12 pt-16">
        <div className="max-w-6xl mx-auto">
          {showAgeNotice ? (
            <span className="inline-block px-3 py-1 bg-green-100 text-green-900 text-[10px] font-bold tracking-widest uppercase mb-6 rounded-sm">
              TrainerSource Program Partner · Research Use Only · 21+
            </span>
          ) : (
            <span className="inline-block px-3 py-1 bg-green-100 text-green-900 text-[10px] font-bold tracking-widest uppercase mb-6 rounded-sm">
              TrainerSource Program Partner
            </span>
          )}
          <h2 className="text-5xl md:text-6xl font-heading font-bold text-slate-900 tracking-tighter mb-12">
            Ultimate Peptides: Confirmed Purity, Biggest Savings
          </h2>
          <div className="relative mx-auto w-full max-w-[1024px] aspect-square overflow-hidden rounded-lg bg-white">
            <Image
              src="/assets/ultimate-peptides-lineup.png"
              alt="Ultimate Peptides product vial lineup — BPC-157, TB-500, CJC-1295, Ipamorelin and more under clean laboratory lighting"
              width={1024}
              height={1024}
              quality={100}
              className="w-full h-full object-cover"
              priority
            />
          </div>
        </div>
      </section>

      <section id="ultimate-mission" className="px-24 bg-white pb-24 pt-12">
        <div className="max-w-4xl mx-auto text-center flex flex-col items-center">
          <h2 className="text-4xl md:text-5xl font-heading font-bold text-slate-900 tracking-tight mb-8">
            A Peptide Brand That Is More Than Just A Label.
          </h2>
          <p className="text-xl text-slate-600 leading-relaxed mb-12">
            With end-to-end production, always-on texting support and high-end packaging, Ultimate is how trainers keep their clients safe and happy.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center w-full">
            <Link
              href="/apply"
              className="bg-hyrox-orange text-white font-bold py-5 px-8 rounded-lg tracking-[0.2em] text-[10px] uppercase min-w-[220px] text-center transition-transform active:scale-95 duration-200"
            >
              Become An Affiliate
            </Link>
            <a
              href="https://ultimate-peptides.com"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-clinical-slate text-white font-bold py-5 px-8 rounded-lg tracking-[0.2em] text-[10px] uppercase min-w-[220px] text-center transition-transform active:scale-95 duration-200"
            >
              Visit Partner Site
            </a>
          </div>
        </div>
      </section>

      <section id="why-peptides" className="flex flex-col md:flex-row">
        <div className="w-full md:w-1/2 aspect-square relative overflow-hidden group">
          <Image
            src="/assets/why-peptides-trainer.png"
            alt="Personal trainer in discussion with older client in a high-end gym"
            fill
            sizes="(min-width: 768px) 33vw, 100vw"
            className="object-cover group-hover:scale-105 transition-transform duration-700"
          />
          <div className="absolute inset-0 bg-slate-900/40 flex items-center justify-center">
            <h3 className="text-white text-5xl font-heading font-bold tracking-tight">
              Why Peptides?
            </h3>
          </div>
        </div>
        <div className="w-full md:w-1/2 p-24 bg-slate-50 flex flex-col justify-center">
          <p className="text-slate-600 leading-relaxed text-xl max-w-md">
            Peptides are the most-requested product in every gym. Everyone wants them.. but many can&apos;t afford them.
          </p>
        </div>
      </section>

      <section id="three-options" className="flex flex-col md:flex-row-reverse bg-slate-100">
        <div className="w-full md:w-1/2 aspect-square relative overflow-hidden group">
          <Image
            src="/assets/three-options-labglass.png"
            alt="Laboratory glassware and scientific instruments"
            fill
            sizes="(min-width: 768px) 33vw, 100vw"
            className="object-cover group-hover:scale-105 transition-transform duration-700"
          />
          <div className="absolute inset-0 bg-slate-800/60 flex items-center justify-center">
            <h3 className="text-white font-heading font-bold tracking-tight text-3xl lg:text-4xl text-center px-12">
              Three Options: Prescription, Remote and Research-Only
            </h3>
          </div>
        </div>
        <div className="w-full md:w-1/2 p-24 flex flex-col justify-center">
          <div className="max-w-md text-slate-600 leading-relaxed text-lg space-y-4">
            <p>Weight loss peptides come in three options:</p>
            <ul className="list-disc ml-6 space-y-1">
              <li>Prescriptions (about $540/m),</li>
              <li>Remote ($350/m),</li>
              <li>Research-Only ($230/m).</li>
            </ul>
            <p>If cost drives clients to &apos;Research Only&apos;... what brand can they trust?</p>
          </div>
        </div>
      </section>

      <section id="solution" className="p-24 bg-white">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-4xl font-heading font-bold text-slate-900 mb-16 tracking-tighter">
            The TrainerSource Solution
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-start">
            <div className="space-y-4">
              <p className="text-clinical-slate text-[10px] font-bold uppercase tracking-[0.2em]">Program Partner:</p>
              <div className="border-b border-slate-200 pb-4 min-h-[4rem] flex items-center">
                <Image
                  src="/assets/ultimate-peptides-logo.jpg"
                  alt="Ultimate Peptides"
                  width={280}
                  height={118}
                  className="h-12 w-auto"
                />
              </div>
              <ul className="space-y-4 pt-4">
                <li className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-hyrox-orange text-sm mt-1">check_circle</span>
                  <span className="text-slate-600">Batch tested for &gt;99% purity</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-hyrox-orange text-sm mt-1">check_circle</span>
                  <span className="text-slate-600">End-to-end production</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-hyrox-orange text-sm mt-1">check_circle</span>
                  <span className="text-slate-600">Scannable COAs</span>
                </li>
              </ul>
            </div>
            <div className="space-y-4">
              <p className="text-clinical-slate text-[10px] font-bold uppercase tracking-[0.2em]">Supported By:</p>
              <h4 className="font-heading font-bold text-xl text-slate-800 border-b border-slate-200 pb-4 leading-tight min-h-[4rem]">
                TrainerSource<br />Peptide Program
              </h4>
              <ul className="space-y-4 pt-4">
                <li className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-hyrox-orange text-sm mt-1">check_circle</span>
                  <span className="text-slate-600">Always-on Concierge, via Telegram</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-hyrox-orange text-sm mt-1">check_circle</span>
                  <span className="text-slate-600">Dosing calculator, via web app</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-hyrox-orange text-sm mt-1">check_circle</span>
                  <span className="text-slate-600">Ecomm ordering, via credit card</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section id="client-journey">
        <div className="bg-clinical-slate py-16 px-24 text-center">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-5xl font-heading font-bold text-white mb-4 tracking-tighter">
              Client Peptide Journey
            </h2>
            <p className="text-slate-300 text-xl max-w-2xl mx-auto">
              Supporting &amp; Enabling Affiliates Sales
            </p>
          </div>
        </div>
        <div className="bg-white py-16 px-24">
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-12 text-left">
              <div className="space-y-4">
                <div className="text-6xl font-heading font-extrabold text-clinical-slate">01</div>
                <h5 className="text-slate-900 font-heading font-bold uppercase tracking-widest text-sm">Discovery</h5>
                <p className="text-slate-600 text-sm leading-relaxed">
                  Trainer refers clients to TrainerSource concierge (Telegram) and Ultimate (website).
                </p>
              </div>
              <div className="space-y-4">
                <div className="text-6xl font-heading font-extrabold text-clinical-slate">02</div>
                <h5 className="text-slate-900 font-heading font-bold uppercase tracking-widest text-sm">Educate</h5>
                <p className="text-slate-600 text-sm leading-relaxed">
                  Concierge offers links, tips and safe protocols.
                </p>
              </div>
              <div className="space-y-4">
                <div className="text-6xl font-heading font-extrabold text-clinical-slate">03</div>
                <h5 className="text-slate-900 font-heading font-bold uppercase tracking-widest text-sm">Purchase</h5>
                <p className="text-slate-600 text-sm leading-relaxed">
                  Clients buy via ecomm site, receive peptides in under three days.
                </p>
              </div>
              <div className="space-y-4">
                <div className="text-6xl font-heading font-extrabold text-clinical-slate">04</div>
                <h5 className="text-slate-900 font-heading font-bold uppercase tracking-widest text-sm">Train</h5>
                <p className="text-slate-600 text-sm leading-relaxed">
                  Clients enjoy better results, Trainers monitor progress.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="affiliate-program" className="flex flex-col md:flex-row bg-slate-50 border-t border-slate-200">
        <div className="w-full md:w-1/2 p-24 flex flex-col justify-center">
          <div className="max-w-md">
            <span className="inline-block px-3 py-1 bg-green-100 text-green-900 text-[10px] font-bold tracking-widest uppercase mb-6 rounded-sm">
              TrainerSource Affiliates
            </span>
            <h2 className="text-4xl font-heading font-bold text-slate-900 mb-8 tracking-tighter">
              Earning Income, Helping Clients
            </h2>
            <p className="text-slate-600 leading-relaxed mb-12">
              Earn lifetime commissions referring safe and affordable products. TrainerSource answers client questions, guides their journey and delivers products within three working days within Singapore, UAE and Japan. Every TrainerSource product is not only third-party tested... it&apos;s verified to the founder level.
            </p>
            <Link
              href="/apply"
              className="inline-block bg-hyrox-orange text-white font-bold py-5 px-10 rounded-sm tracking-[0.2em] text-xs uppercase transition-all hover:shadow-xl"
            >
              Apply Now
            </Link>
          </div>
        </div>
        <div className="w-full md:w-1/2 aspect-square relative overflow-hidden">
          <Image
            src="/assets/affiliate-trainer.png"
            alt="A smiling trainer sitting in a car"
            fill
            sizes="(min-width: 768px) 33vw, 100vw"
            className="object-cover"
          />
        </div>
      </section>

      <footer className="bg-[#121212] p-24 text-white">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-16">
          <div>
            <div className="flex items-center gap-2 mb-8">
              <Image
                src="/assets/logo-graphic.png"
                alt="TrainerSource logo"
                width={40}
                height={40}
                className="rounded-sm"
              />
              <span className="text-lg font-bold tracking-tighter font-heading">TRAINERSOURCE</span>
            </div>
            <p className="text-slate-500 text-[10px] font-bold tracking-widest uppercase leading-relaxed">
              © 2024 TRAINERSOURCE PERFORMANCE LAB. ALL RIGHTS RESERVED.
            </p>
          </div>
          <nav className="flex flex-col gap-4">
            <Link href="#three-options" className="text-slate-500 hover:text-orange-500 transition-colors text-[10px] font-bold tracking-widest uppercase">FAQ</Link>
            <Link href="#ultimate-mission" className="text-slate-500 hover:text-orange-500 transition-colors text-[10px] font-bold tracking-widest uppercase">About</Link>
            <Link href="#affiliate-program" className="text-slate-500 hover:text-orange-500 transition-colors text-[10px] font-bold tracking-widest uppercase">Affiliate Program</Link>
            <Link href="/login" className="text-slate-500 hover:text-orange-500 transition-colors text-[10px] font-bold tracking-widest uppercase">Trainer Login</Link>
          </nav>
          <div className="flex flex-col gap-6">
            <Link
              href="/apply"
              className="bg-orange-600 text-white font-bold py-4 rounded-sm tracking-[0.1em] text-xs uppercase text-center"
            >
              Apply Now
            </Link>
            <a
              href="mailto:hello@trainersource.com"
              className="border border-slate-700 text-slate-300 font-bold py-4 rounded-sm tracking-[0.1em] text-xs hover:bg-slate-800 transition-colors uppercase text-center"
            >
              Contact Us
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}
