import Link from "next/link";

type MainContentProps = {
  showAgeNotice?: boolean;
};

export default function MainContent({ showAgeNotice = false }: MainContentProps) {
  return (
    <main className="w-full lg:w-2/3 lg:ml-[33.333333%] flex flex-col bg-surface min-h-screen text-slate-900">
      <nav className="sticky top-0 z-30 bg-surface/90 backdrop-blur-md border-b border-slate-200 px-6 py-4 flex justify-between items-center">
        <div className="flex gap-6 font-heading font-bold text-sm tracking-widest uppercase">
          <Link href="#peptides" className="hover:text-primary transition-colors">Peptides</Link>
          <Link href="#about" className="hover:text-primary transition-colors">About Us</Link>
        </div>
        <div className="flex items-center gap-4 font-heading font-bold text-sm tracking-widest uppercase">
          <Link href="/login" className="hover:text-primary transition-colors">Log In</Link>
          <Link href="/apply" className="bg-primary text-white px-5 py-2 rounded hover:bg-red-900 transition-colors">Sign Up</Link>
        </div>
      </nav>

      <div className="p-6 md:p-12 lg:p-16 flex flex-col gap-24">
        <section id="hero" className="flex flex-col gap-6">
          {showAgeNotice ? (
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-hyrox-orange/30 bg-hyrox-orange/10 px-4 py-2 text-xs font-heading font-bold uppercase tracking-[0.2em] text-primary">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-hyrox-orange text-white">21+</span>
              Research use only • adults 21+
            </div>
          ) : null}
          <h2 className="font-heading font-extrabold text-4xl md:text-5xl lg:text-6xl text-primary leading-tight uppercase tracking-tight">
            Ultimate Peptides: <br />
            Confirmed Purity, <br />
            Biggest Savings
          </h2>
          <div className="w-full h-[400px] bg-slate-300 rounded-lg" role="img" aria-label="Hero Image showing peptides"></div>
        </section>

        <section id="about" className="flex flex-col items-start gap-8 bg-white p-8 md:p-12 rounded-xl shadow-sm border border-slate-100">
          <h2 className="font-heading font-extrabold text-3xl md:text-4xl text-primary uppercase tracking-tight">
            A Peptide Brand That Is More Than Just A Label
          </h2>
          <p className="text-lg text-slate-600 max-w-3xl leading-relaxed">
            We partner with the best in the industry to ensure your clients receive the highest quality products. 
            Our commitment goes beyond just supplying; we educate, support, and help you grow your business.
          </p>
          <div className="flex flex-wrap gap-4">
            <Link href="/apply" className="bg-hyrox-orange hover:bg-orange-600 text-white font-heading font-bold text-sm uppercase tracking-widest py-4 px-8 rounded transition-all">
              Become An Affiliate
            </Link>
            <a href="https://ultimate-peptides.com" target="_blank" rel="noopener noreferrer" className="border-2 border-primary text-primary hover:bg-primary hover:text-white font-heading font-bold text-sm uppercase tracking-widest py-4 px-8 rounded transition-all">
              Visit Partner Site
            </a>
          </div>
        </section>

        <section id="why" className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <div className="w-full h-[300px] bg-slate-300 rounded-lg" role="img" aria-label="Image explaining why peptides"></div>
          <div className="flex flex-col gap-6">
            <h2 className="font-heading font-extrabold text-3xl text-primary uppercase tracking-tight">
              Why Peptides?
            </h2>
            <p className="text-lg text-slate-600 leading-relaxed">
              Peptides are transforming the fitness and wellness industry by accelerating recovery, supporting lean muscle growth, and optimizing overall health. Providing your clients with reliable access to premium peptides sets you apart as a forward-thinking trainer.
            </p>
          </div>
        </section>

        <section id="options" className="flex flex-col gap-10">
          <h2 className="font-heading font-extrabold text-3xl text-primary uppercase tracking-tight text-center">
            Three Options: Prescription, Remote and Research-Only
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-8 rounded-xl shadow-sm border-t-4 border-hyrox-orange flex flex-col gap-4 text-center">
              <h3 className="font-heading font-bold text-xl uppercase tracking-wide">Prescription</h3>
              <div className="text-4xl font-extrabold text-clinical-slate">$540</div>
              <p className="text-slate-500 mt-2">Full clinical oversight and dedicated pharmacy fulfillment.</p>
            </div>
            <div className="bg-white p-8 rounded-xl shadow-sm border-t-4 border-hyrox-orange flex flex-col gap-4 text-center">
              <h3 className="font-heading font-bold text-xl uppercase tracking-wide">Remote</h3>
              <div className="text-4xl font-extrabold text-clinical-slate">$350</div>
              <p className="text-slate-500 mt-2">Telehealth consultation with streamlined delivery.</p>
            </div>
            <div className="bg-white p-8 rounded-xl shadow-sm border-t-4 border-hyrox-orange flex flex-col gap-4 text-center">
              <h3 className="font-heading font-bold text-xl uppercase tracking-wide">Research-Only</h3>
              <div className="text-4xl font-extrabold text-clinical-slate">$230</div>
              <p className="text-slate-500 mt-2">Direct access for qualified research purposes.</p>
            </div>
          </div>
        </section>

        <section id="solution" className="flex flex-col gap-10 bg-clinical-slate text-white p-8 md:p-12 rounded-xl">
          <h2 className="font-heading font-extrabold text-3xl uppercase tracking-tight text-center">
            The TrainerSource Solution
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mt-4">
            <div className="flex flex-col gap-6">
              <h3 className="font-heading font-bold text-xl uppercase tracking-wide text-hyrox-orange border-b border-white/20 pb-4">Ultimate Peptides</h3>
              <ul className="flex flex-col gap-4">
                <li className="flex items-center gap-3"><span className="material-symbols-outlined text-hyrox-orange">check_circle</span> Industry-leading purity</li>
                <li className="flex items-center gap-3"><span className="material-symbols-outlined text-hyrox-orange">check_circle</span> Rigorous third-party testing</li>
                <li className="flex items-center gap-3"><span className="material-symbols-outlined text-hyrox-orange">check_circle</span> Direct-to-consumer pricing</li>
              </ul>
            </div>
            <div className="flex flex-col gap-6">
              <h3 className="font-heading font-bold text-xl uppercase tracking-wide text-hyrox-orange border-b border-white/20 pb-4">TrainerSource</h3>
              <ul className="flex flex-col gap-4">
                <li className="flex items-center gap-3"><span className="material-symbols-outlined text-hyrox-orange">check_circle</span> Automated commission tracking</li>
                <li className="flex items-center gap-3"><span className="material-symbols-outlined text-hyrox-orange">check_circle</span> Marketing resources & assets</li>
                <li className="flex items-center gap-3"><span className="material-symbols-outlined text-hyrox-orange">check_circle</span> Dedicated account management</li>
              </ul>
            </div>
          </div>
        </section>

        <section id="journey" className="flex flex-col gap-10">
          <h2 className="font-heading font-extrabold text-3xl text-primary uppercase tracking-tight text-center">
            Client Peptide Journey
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="flex flex-col items-center text-center gap-4">
              <div className="w-16 h-16 rounded-full bg-surface border-4 border-primary text-primary flex items-center justify-center font-bold text-xl">1</div>
              <h3 className="font-heading font-bold uppercase tracking-wide text-lg">Discovery</h3>
              <p className="text-sm text-slate-500">Client identifies a need for enhanced recovery or performance.</p>
            </div>
            <div className="flex flex-col items-center text-center gap-4">
              <div className="w-16 h-16 rounded-full bg-surface border-4 border-primary text-primary flex items-center justify-center font-bold text-xl">2</div>
              <h3 className="font-heading font-bold uppercase tracking-wide text-lg">Educate</h3>
              <p className="text-sm text-slate-500">You provide clinical insights and recommend the right approach.</p>
            </div>
            <div className="flex flex-col items-center text-center gap-4">
              <div className="w-16 h-16 rounded-full bg-surface border-4 border-primary text-primary flex items-center justify-center font-bold text-xl">3</div>
              <h3 className="font-heading font-bold uppercase tracking-wide text-lg">Purchase</h3>
              <p className="text-sm text-slate-500">Client uses your affiliate link to buy premium products.</p>
            </div>
            <div className="flex flex-col items-center text-center gap-4">
              <div className="w-16 h-16 rounded-full bg-surface border-4 border-primary text-primary flex items-center justify-center font-bold text-xl">4</div>
              <h3 className="font-heading font-bold uppercase tracking-wide text-lg">Train</h3>
              <p className="text-sm text-slate-500">Improved outcomes lead to better training and retention.</p>
            </div>
          </div>
        </section>

        <section id="affiliate" className="bg-primary text-white p-10 md:p-16 rounded-xl flex flex-col items-center text-center gap-8 shadow-xl">
          <h2 className="font-heading font-extrabold text-3xl md:text-4xl uppercase tracking-tight">
            Earning Income, Helping Clients
          </h2>
          <p className="text-lg text-white/80 max-w-2xl">
            Join the most rewarding affiliate program in the industry. Equip your clients with the best tools while building a passive revenue stream for your business.
          </p>
          <Link href="/apply" className="bg-white text-primary hover:bg-slate-100 font-heading font-bold text-lg uppercase tracking-widest py-5 px-10 rounded shadow-lg transition-all mt-4">
            Apply Now
          </Link>
        </section>

      </div>

      <footer className="bg-slate-900 text-white mt-auto p-12 md:p-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
          <div className="flex flex-col gap-4">
            <div className="font-heading font-extrabold text-xl tracking-widest uppercase flex items-center gap-2">
              <div className="w-6 h-6 bg-hyrox-orange rounded flex items-center justify-center text-white text-xs">TS</div>
              TrainerSource
            </div>
            <p className="text-sm text-slate-400 mt-2 max-w-xs">
              © 2024 TRAINERSOURCE PERFORMANCE LAB. ALL RIGHTS RESERVED.
            </p>
          </div>
          <div className="flex flex-col gap-3 font-heading text-sm tracking-widest uppercase">
            <Link href="#peptides" className="text-slate-300 hover:text-white transition-colors">Peptides</Link>
            <Link href="#about" className="text-slate-300 hover:text-white transition-colors">About Us</Link>
            <Link href="/apply" className="text-slate-300 hover:text-white transition-colors">Affiliate Program</Link>
            <Link href="/login" className="text-slate-300 hover:text-white transition-colors">Trainer Portal</Link>
          </div>
          <div className="flex flex-col items-start gap-4">
            <Link href="/apply" className="bg-hyrox-orange hover:bg-orange-600 text-white font-heading font-bold text-xs uppercase tracking-widest py-3 px-6 rounded transition-all">
              Apply Today
            </Link>
            <Link href="/login" className="border border-slate-600 hover:border-white text-white font-heading font-bold text-xs uppercase tracking-widest py-3 px-6 rounded transition-all">
              Log In
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
