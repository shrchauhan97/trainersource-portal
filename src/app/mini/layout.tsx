import Script from 'next/script';
import MiniAppThemeBridge from './MiniAppThemeBridge';

export const metadata = {
  title: 'Peptide Butler — Mini App',
};

// The root layout renders a global compliance footer. We hide it for mini routes
// so the WebView feels like a native Telegram sheet. When the user navigates
// away from /mini/*, this layout unmounts and the style override with it.
const HIDE_ROOT_CHROME = `
  body > footer { display: none !important; }
  body { background: var(--tg-bg, #0f1115) !important; }
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
      <div className="min-h-screen bg-[var(--tg-bg,#0f1115)] text-[var(--tg-fg,#ffffff)] antialiased">
        {children}
      </div>
    </>
  );
}
