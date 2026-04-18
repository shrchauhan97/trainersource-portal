import Link from "next/link";

export default function Sidebar() {
  return (
    <aside className="w-full lg:w-1/3 lg:fixed lg:top-0 lg:bottom-0 lg:left-0 bg-clinical-slate text-white flex flex-col z-20">
      <div className="flex-1 overflow-y-auto p-6 md:p-12 lg:p-16 flex flex-col gap-12">
        <div className="font-heading font-extrabold text-2xl tracking-widest uppercase flex items-center gap-2">
          <div className="w-8 h-8 bg-hyrox-orange rounded flex items-center justify-center text-white text-sm">TS</div>
          TrainerSource
        </div>

        <h1 className="font-heading font-extrabold text-4xl md:text-5xl lg:text-6xl leading-tight uppercase tracking-tight">
          Delivering <br className="hidden lg:block" />
          The Products <br className="hidden lg:block" />
          Your Clients Need
        </h1>

        <div className="flex flex-col gap-4">
          <div className="bg-white/10 p-5 rounded-xl border border-white/20 backdrop-blur-sm flex items-start gap-4">
            <span className="material-symbols-outlined text-hyrox-orange text-3xl shrink-0">support_agent</span>
            <div>
              <h3 className="font-heading font-bold text-lg uppercase tracking-wide mb-1">Always-On Support</h3>
              <p className="text-white/80 text-sm font-body">Dedicated clinical guidance for you and your clients.</p>
            </div>
          </div>
          
          <div className="bg-white/10 p-5 rounded-xl border border-white/20 backdrop-blur-sm flex items-start gap-4">
            <span className="material-symbols-outlined text-hyrox-orange text-3xl shrink-0">storefront</span>
            <div>
              <h3 className="font-heading font-bold text-lg uppercase tracking-wide mb-1">Online Store</h3>
              <p className="text-white/80 text-sm font-body">Seamless purchasing experience via our platform.</p>
            </div>
          </div>
          
          <div className="bg-white/10 p-5 rounded-xl border border-white/20 backdrop-blur-sm flex items-start gap-4">
            <span className="material-symbols-outlined text-hyrox-orange text-3xl shrink-0">payments</span>
            <div>
              <h3 className="font-heading font-bold text-lg uppercase tracking-wide mb-1">Affiliate Codes</h3>
              <p className="text-white/80 text-sm font-body">Track referrals and earn commission automatically.</p>
            </div>
          </div>
        </div>

        <div className="mt-auto pt-8">
          <Link 
            href="/apply" 
            className="block w-full bg-hyrox-orange hover:bg-orange-600 text-white font-heading font-bold text-lg uppercase tracking-widest py-5 px-6 rounded-lg text-center transition-all shadow-lg hover:shadow-orange-500/20"
          >
            Join The Program
          </Link>
        </div>
      </div>
    </aside>
  );
}
