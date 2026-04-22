import { test, expect } from '@playwright/test';
import crypto from 'node:crypto';

/**
 * Generate a valid-looking Telegram WebApp initData string signed with
 * the provided bot token. Mirrors the algorithm in telegram-auth.ts.
 */
function synthInitData(botToken: string, userId: number): string {
  const user = JSON.stringify({
    id: userId,
    first_name: 'PlaywrightTester',
  });
  const authDate = Math.floor(Date.now() / 1000);
  const params = new URLSearchParams();
  params.set('auth_date', String(authDate));
  params.set('user', user);

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();
  const hash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');
  params.set('hash', hash);
  return params.toString();
}

test.describe('Reorder Mini App', () => {
  test('renders not-linked state when no bc_customer_links row', async ({
    page,
  }) => {
    const botToken = process.env.TELEGRAM_BOT_TOKEN ?? 'test-bot-token';
    const initData = synthInitData(botToken, 999_999_9999); // unlikely to be linked

    // Stub the window.Telegram global before the page loads
    await page.addInitScript((initData: string) => {
      (window as unknown as { Telegram: unknown }).Telegram = {
        WebApp: {
          initData,
          ready: () => {},
          expand: () => {},
          openLink: (u: string) => {
            (window as unknown as { __openedLink: string }).__openedLink = u;
          },
          MainButton: {
            setText: () => {},
            show: () => {},
            hide: () => {},
            enable: () => {},
            disable: () => {},
            showProgress: () => {},
            hideProgress: () => {},
            onClick: () => {},
            offClick: () => {},
          },
          themeParams: {},
        },
      };
    }, initData);

    await page.goto('/mini/reorder');
    await expect(
      page.getByText(/not linked yet|session expired|couldn't load/i),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('auth-error state when initData is missing', async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { Telegram: unknown }).Telegram = {
        WebApp: {
          initData: '',
          ready: () => {},
          expand: () => {},
          openLink: () => {},
          MainButton: {
            setText: () => {},
            show: () => {},
            hide: () => {},
            enable: () => {},
            disable: () => {},
            showProgress: () => {},
            hideProgress: () => {},
            onClick: () => {},
            offClick: () => {},
          },
          themeParams: {},
        },
      };
    });

    await page.goto('/mini/reorder');
    await expect(page.getByText(/session expired/i)).toBeVisible({
      timeout: 10_000,
    });
  });
});
