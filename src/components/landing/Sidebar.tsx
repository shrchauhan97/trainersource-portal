import Image from "next/image";
import Link from "next/link";

export default function Sidebar() {
  return (
    <aside className="w-full lg:fixed lg:left-0 lg:top-0 lg:bottom-0 lg:w-1/3 bg-clinical-slate text-white flex flex-col p-12 z-50 overflow-y-auto">
      <div className="flex-grow">
        <div className="flex items-center gap-4 mb-12">
          <Image
            src="/assets/logo-graphic.png"
            alt="TrainerSource logo"
            width={80}
            height={80}
            quality={100}
            className="rounded-md"
            priority
          />
          <div className="text-3xl lg:text-4xl font-bold tracking-tighter text-white font-heading">
            TRAINERSOURCE
          </div>
        </div>

        <div className="space-y-12">
          <div className="pt-8">
            <h1 className="text-5xl lg:text-6xl font-heading font-extrabold text-white leading-tight tracking-tighter uppercase mb-12">
              Delivering the products your clients need
            </h1>

            <div className="mb-10">
              <p className="text-xs font-bold text-slate-300 tracking-[0.2em] mb-6 uppercase">
                Our Offering:
              </p>
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-white/5 border border-white/10 p-5 rounded-lg flex flex-col">
                  <span className="material-symbols-outlined text-white text-3xl mb-3">smartphone</span>
                  <p className="text-white font-heading font-bold text-sm mb-2 leading-tight">Always-On Support</p>
                  <ul className="text-slate-400 text-xs list-disc ml-4 space-y-0.5">
                    <li>Via Telegram Chat</li>
                  </ul>
                </div>
                <div className="bg-white/5 border border-white/10 p-5 rounded-lg flex flex-col">
                  <span className="material-symbols-outlined text-white text-3xl mb-3">storefront</span>
                  <p className="text-white font-heading font-bold text-sm mb-2 leading-tight">Online Store</p>
                  <ul className="text-slate-400 text-xs list-disc ml-4 space-y-0.5">
                    <li>with Next-Day Delivery</li>
                  </ul>
                </div>
                <div className="bg-white/5 border border-white/10 p-5 rounded-lg flex flex-col">
                  <span className="material-symbols-outlined text-white text-3xl mb-3">payments</span>
                  <p className="text-white font-heading font-bold text-sm mb-2 leading-tight">Affiliate Codes</p>
                  <ul className="text-slate-400 text-xs list-disc ml-4 space-y-0.5">
                    <li>Persistent</li>
                    <li>Simple</li>
                    <li>Rewarding</li>
                  </ul>
                </div>
              </div>
            </div>

            <Link
              href="/apply"
              className="block w-full bg-hyrox-orange text-white font-bold py-4 px-8 rounded-lg tracking-widest text-xs uppercase transition-transform active:scale-95 duration-200 text-center"
            >
              Join the Program
            </Link>
          </div>
        </div>
      </div>
    </aside>
  );
}
