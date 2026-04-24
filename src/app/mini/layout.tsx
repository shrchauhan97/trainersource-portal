import Script from 'next/script';
import MiniAppThemeBridge from './MiniAppThemeBridge';

export const metadata = {
  title: 'Ultimate Peptides — Concierge',
};

// The root layout renders a global compliance footer. We hide it for mini routes
// so the WebView feels like a native Telegram sheet. We also pin the backdrop
// to Ultimate Peptides black so the brand holds regardless of the user's
// Telegram skin — the tg vars still apply to interactive surfaces.
const HIDE_ROOT_CHROME = `
  body > footer { display: none !important; }
  body { background: #0a0a0a !important; }
`;

export default function MiniAppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: HIDE_ROOT_CHROME }} />
      <Script
        src="https://telegram.org/js/telegram-web-app.js"
        strategy="beforeInteractive"
      />
      <MiniAppThemeBridge />
      <div className="min-h-screen bg-[#0a0a0a] text-[#f4e9cf] antialiased">
        {children}
      </div>
    </>
  );
}
