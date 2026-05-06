import Link from "next/link";

// Stitch's lh3.googleusercontent.com/aida URLs are tied to Stitch project
// auth and start returning 403 once the design session expires. Using local
// /public/assets/ images keeps the lockup live forever without external
// dependencies.
const LOGO_URL = "/assets/logo-graphic.png";

type SidebarFeature = {
  icon: string;
  title: string;
  caption: string;
};

// Verbatim from Stitch HTML — sub-copy preserved exactly so Tom & Moe
// recognise their own words in the live site.
const FEATURES: SidebarFeature[] = [
  { icon: "chat_bubble", title: "Always-On Support", caption: "Via Telegram Chat" },
  { icon: "credit_card", title: "Online Store", caption: "With Next-Day Delivery" },
  { icon: "lock", title: "Affiliate Codes", caption: "Made for each client" },
];

export default function Sidebar() {
  return (
    <aside className="z-50 flex w-full flex-col bg-[#2D4F67] text-white lg:fixed lg:bottom-0 lg:left-0 lg:top-0 lg:w-1/3">
      <div className="flex flex-1 flex-col p-6 md:p-12 overflow-y-auto">
        <div className="flex items-center gap-3 mb-12">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt="TS Logo"
            className="object-contain rounded-sm w-24 h-24"
            src={LOGO_URL}
          />
          <div className="flex items-center h-10">
            <span className="text-white font-body font-bold text-lg tracking-tight uppercase">
              TRAINERSOURCE
            </span>
          </div>
        </div>

        <h1 className="font-headline font-extrabold text-white leading-tight tracking-tighter uppercase mb-12 text-5xl lg:text-6xl">
          WHERE TRAINERS THRIVE
        </h1>

        <div className="mb-10">
          <p className="text-[10px] font-bold text-slate-300 tracking-[0.2em] mb-6 uppercase font-label">
            BRINGING TRAINERS
          </p>
          <div className="grid grid-cols-3 gap-3">
            {FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="bg-white/5 border border-white/10 p-3 rounded-lg flex flex-col items-start"
              >
                <span
                  className="material-symbols-outlined text-white text-xl mb-2"
                  style={{
                    fontVariationSettings: "'FILL' 1, 'wght' 300, 'GRAD' 0, 'opsz' 24",
                  }}
                >
                  {feature.icon}
                </span>
                <p className="text-white font-headline font-bold text-[10px] mb-1 leading-tight text-left">
                  {feature.title}
                </p>
                <p className="text-slate-400 text-[8px] font-label text-left">
                  {feature.caption}
                </p>
              </div>
            ))}
          </div>
        </div>

        <Link
          href="/apply"
          className="bg-[#FF5722] text-white font-label font-bold py-4 px-8 rounded-lg tracking-widest text-xs transition-transform active:scale-95 duration-200 w-full uppercase text-center mt-auto"
        >
          JOIN THE PROGRAM
        </Link>
      </div>
    </aside>
  );
}
