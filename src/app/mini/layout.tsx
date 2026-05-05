import Script from 'next/script';
import MiniAppThemeBridge from './MiniAppThemeBridge';

export const metadata = {
  title: 'Ultimate Peptides — Concierge',
};

// The root layout renders a global compliance footer. We hide it for mini routes
// so the WebView feels like a native Telegram sheet. Backdrop pins to UP deep
// slate (#14202b) — a darker relative of the storefront's #2F3C4E — so the
// content card reads as a premium floating panel over the chat context.
const HIDE_ROOT_CHROME = `
  body > footer { display: none !important; }
  body { background: #14202b !important; }
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
      <div className="min-h-screen bg-[#14202b] text-[#e8eefa] antialiased">
        {children}
      </div>
    </>
  );
}
