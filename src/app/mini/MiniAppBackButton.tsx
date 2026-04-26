'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

type BackButton = {
  show: () => void;
  hide: () => void;
  onClick: (cb: () => void) => void;
  offClick: (cb: () => void) => void;
};

type WebApp = { BackButton?: BackButton };

function getBackButton(): BackButton | undefined {
  if (typeof window === 'undefined') return undefined;
  const tg = (window as unknown as { Telegram?: { WebApp?: WebApp } }).Telegram
    ?.WebApp;
  return tg?.BackButton;
}

type Props = {
  /** Path to navigate to on back. Defaults to the Mini App launcher. */
  href?: string;
};

/**
 * Shows Telegram's native header BackButton while mounted. On tap it routes
 * to `href` (defaults to `/mini/launcher`). No-op outside Telegram.
 */
export default function MiniAppBackButton({ href = '/mini/launcher' }: Props) {
  const router = useRouter();

  useEffect(() => {
    const btn = getBackButton();
    if (!btn) return;

    const onBack = () => router.push(href);

    btn.onClick(onBack);
    btn.show();

    return () => {
      btn.offClick(onBack);
      btn.hide();
    };
  }, [router, href]);

  return null;
}
