// src/app/mini/partner/telegram.d.ts
//
// Type augmentation for the Telegram WebApp surface we consume inside
// /mini/partner/*. Uses `TelegramWebAppM3` as an internal alias so it does not
// collide with the local type declared inside MiniAppThemeBridge.tsx (Plan 6
// shared infra).
declare global {
  interface TelegramMainButtonM3 {
    text: string;
    show(): void;
    hide(): void;
    enable(): void;
    disable(): void;
    showProgress(leaveActive?: boolean): void;
    hideProgress(): void;
    onClick(h: () => void): void;
    offClick(h: () => void): void;
    setText(t: string): void;
  }

  interface TelegramWebAppM3 {
    initData: string;
    initDataUnsafe: { user?: { id: number; first_name?: string; username?: string } };
    themeParams: Record<string, string | undefined>;
    colorScheme: 'light' | 'dark';
    MainButton: TelegramMainButtonM3;
    ready(): void;
    expand(): void;
    close(): void;
    openLink(url: string, options?: { try_instant_view?: boolean }): void;
    switchInlineQuery(query: string, chat_types?: string[]): void;
    onEvent(event: string, cb: () => void): void;
    showPopup(
      params: {
        title?: string;
        message: string;
        buttons?: Array<{ id?: string; type?: string; text?: string }>;
      },
      callback?: (buttonId: string) => void,
    ): void;
    showAlert(message: string, callback?: () => void): void;
    HapticFeedback?: {
      impactOccurred(style: 'light' | 'medium' | 'heavy'): void;
      notificationOccurred(type: 'success' | 'warning' | 'error'): void;
    };
  }
}
export {};
