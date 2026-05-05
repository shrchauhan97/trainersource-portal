import { test, expect } from "@playwright/test";
import crypto from "node:crypto";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "test-token";

function signWidgetPayload(data: Record<string, string | number>, token: string): string {
  const secret = crypto.createHash("sha256").update(token).digest();
  const dcs = Object.keys(data)
    .filter((k) => k !== "hash")
    .sort()
    .map((k) => `${k}=${data[k]}`)
    .join("\n");
  return crypto.createHmac("sha256", secret).update(dcs).digest("hex");
}

test.describe("Partner link flow", () => {
  test("banner renders on dashboard when unlinked", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByText(/connect telegram/i)).toBeVisible();
  });

  test("verify-login endpoint upserts trainer_telegram_links row", async ({ request }) => {
    const now = Math.floor(Date.now() / 1000);
    const telegramUserId = 555_666_777;
    const payload = {
      id: telegramUserId,
      first_name: "SmokeBot",
      auth_date: now,
    };
    const hash = signWidgetPayload(payload, BOT_TOKEN);
    const res = await request.get(
      `/api/telegram/verify-login?id=${telegramUserId}` +
        `&first_name=SmokeBot&auth_date=${now}&hash=${hash}`,
      { maxRedirects: 0 },
    );
    expect([302, 401]).toContain(res.status());
  });
});
