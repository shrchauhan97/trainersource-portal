'use client';

import { useEffect } from 'react';

type ThemeParams = Partial<{
  bg_color: string;
  text_color: string;
  hint_color: string;
  link_color: string;
  button_color: string;
  button_text_color: string;
  secondary_bg_color: string;
}>;

type TelegramWebApp = {
  ready: () => void;
  expand: () => void;
  colorScheme: 'light' | 'dark';
  themeParams: ThemeParams;
  onEvent: (event: string, cb: () => void) => void;
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export default function MiniAppThemeBridge() {
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (!tg) return;

    const applyTheme = () => {
      const tgApp = window.Telegram?.WebApp;
      if (!tgApp) return;
      const p = tgApp.themeParams;
      const root = document.documentElement;
      if (p.bg_color) root.style.setProperty('--tg-bg', p.bg_color);
      if (p.text_color) root.style.setProperty('--tg-fg', p.text_color);
      if (p.hint_color) root.style.setProperty('--tg-hint', p.hint_color);
      if (p.link_color) root.style.setProperty('--tg-link', p.link_color);
      if (p.button_color) root.style.setProperty('--tg-btn', p.button_color);
      if (p.button_text_color)
        root.style.setProperty('--tg-btn-fg', p.button_text_color);
      if (p.secondary_bg_color)
        root.style.setProperty('--tg-bg-2', p.secondary_bg_color);
      root.dataset.tgColorScheme = tgApp.colorScheme;
    };

    tg.ready();
    tg.expand();
    applyTheme();
    tg.onEvent('themeChanged', applyTheme);
  }, []);

  return null;
}
