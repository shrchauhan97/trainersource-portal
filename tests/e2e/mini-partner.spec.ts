// tests/e2e/mini-partner.spec.ts
import { test, expect, type Page } from '@playwright/test';

async function stubTelegram(page: Page) {
  // The layout loads telegram-web-app.js with strategy=beforeInteractive.
  // If we let that run, the real script overwrites our stub. Intercept the
  // script request and serve an empty body so our addInitScript wins.
  await page.route('**/telegram-web-app.js', (route) =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }),
  );
  await page.addInitScript(() => {
    const noop = () => {};
    (window as unknown as { Telegram: unknown }).Telegram = {
      WebApp: {
        initData: 'STUB_INIT_DATA',
        initDataUnsafe: {},
        themeParams: {},
        colorScheme: 'light',
        MainButton: {
          text: '',
          show: noop,
          hide: noop,
          enable: noop,
          disable: noop,
          showProgress: noop,
          hideProgress: noop,
          onClick: noop,
          offClick: noop,
          setText: noop,
        },
        ready: noop,
        expand: noop,
        close: noop,
        openLink: noop,
        switchInlineQuery: noop,
        onEvent: noop,
        showPopup: noop,
        showAlert: noop,
        HapticFeedback: { impactOccurred: noop, notificationOccurred: noop },
      },
    };
  });
}

test.describe('/mini/partner', () => {
  test('shows fallback when opened outside Telegram', async ({ page }) => {
    await page.goto('/mini/partner');
    await expect(page.getByText('Open from Telegram')).toBeVisible();
    await expect(page.getByText(/peptidebutlerbot/)).toBeVisible();
  });

  test('shows not-linked state on 403', async ({ page }) => {
    await stubTelegram(page);
    await page.route('**/api/mini/partner/summary', (route) =>
      route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: '{"error":"not_linked"}',
      }),
    );
    await page.goto('/mini/partner');
    await expect(page.getByText('Trainer account not linked')).toBeVisible();
    await expect(page.getByRole('button', { name: /open full portal/i })).toBeVisible();
  });

  test('renders dashboard on successful summary', async ({ page }) => {
    await stubTelegram(page);
    await page.route('**/api/mini/partner/summary', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          trainer: { id: 't1', name: 'Alex Chen', status: 'active' },
          earnings: { pending: 420, approved: 50, paid: 315 },
          codes: [
            {
              id: 'c1',
              code: 'SARAH-A7K2',
              displayStatus: 'active',
              consumedByName: null,
              created_at: '2026-04-01',
              expires_at: '2026-07-01',
            },
            {
              id: 'c2',
              code: 'MIKE-B9X1',
              displayStatus: 'active',
              consumedByName: 'Mike R.',
              created_at: '2026-04-10',
              expires_at: '2026-07-10',
            },
          ],
          activeCodeCount: 8,
          recruitment: { unlocked: false, consumedCount: 2, threshold: 5 },
        }),
      }),
    );
    await page.goto('/mini/partner');
    await expect(page.getByText('Alex Chen')).toBeVisible();
    await expect(page.getByText('$420')).toBeVisible();
    await expect(page.getByText('Active codes (8)')).toBeVisible();
    await expect(page.getByText('SARAH-A7K2')).toBeVisible();
    await expect(page.getByText(/\+ 6 more/)).toBeVisible();
    await expect(page.getByRole('button', { name: /open full portal/i })).toBeVisible();
  });
});
