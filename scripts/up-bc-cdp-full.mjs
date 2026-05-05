// Final-attempt driver: attach via CDP, navigate to BC admin, handle login + optional
// 2FA (pass code via BC_2FA_CODE env var), then complete the two remaining tasks
// (disable test credit card + configure Bank Deposit for SGD).
import { chromium } from "file:///C:/Users/shrch/.claude/skills/gstack/node_modules/playwright/index.mjs";
import { mkdir } from "node:fs/promises";

const OUT = "docs/stitch/up-audit/paynow/cdp-drive";
await mkdir(OUT, { recursive: true });

const BC_EMAIL = "newhowl@gmail.com";
const BC_PASS = process.env.BC_ADMIN_PASS;
const CODE = process.env.BC_2FA_CODE;

const DISPLAY_NAME = "Bank Transfer (SG PayNow or International Wire)";
const INSTRUCTIONS = `SG customers — PayNow instant transfer:
• PayNow ID: 8228 9185 (recipient: Trainer Source)
• Reference: Order #%%OrderID%% (important — so we can match payment to your order)

International customers — bank wire:
• Bank: DBS Bank Singapore
• SWIFT/BIC: DBSSSGSG
• Account name: Trainer Source (beneficiary: Alexis Cruz)
• Account number: 1203371927
• Bank address: 12 Marina Boulevard, MBFC Tower 3, Singapore 018982
• Reference: Order #%%OrderID%%

Once payment lands (usually same-day for PayNow, 2–3 business days for international wires), we'll email order confirmation and shipping details. For questions, reach support@ultimate-peptides.com.`;

console.log("[1] Connect CDP");
const browser = await chromium.connectOverCDP("http://localhost:9222");
const ctx = browser.contexts()[0];
const page = ctx.pages().find(p => !p.url().startsWith("chrome-extension")) ?? await ctx.newPage();
await page.bringToFront();

let step = 1;
const shot = async (n, label) => {
  try {
    await page.screenshot({ path: `${OUT}/${String(n).padStart(2, "0")}-${label}.png`, fullPage: true });
    console.log(`  shot ${n}-${label} | url=${page.url().slice(0, 80)}`);
  } catch (e) { console.log(`  shot failed ${label}: ${e.message.slice(0, 80)}`); }
};

console.log("\n[2] Navigate to BC admin Payments");
await page.goto("https://store-yemcm3khpa.mybigcommerce.com/manage/settings/payments", { waitUntil: "domcontentloaded", timeout: 45000 });
await page.waitForTimeout(5000);
await shot(step++, "nav-1");

if (page.url().includes("login.bigcommerce.com")) {
  if (!BC_PASS) {
    console.log("  !! on login page — export BC_ADMIN_PASS and retry");
    await browser.close();
    process.exit(2);
  }
  console.log("\n[2a] Login");
  const emailIn = page.locator('input[type="email"], input[name*="email"]').first();
  await emailIn.fill(BC_EMAIL);
  const passIn = page.locator('input[type="password"]').first();
  await passIn.fill(BC_PASS);
  await shot(step++, "login-filled");
  await passIn.press("Enter");
  await page.waitForTimeout(5000);
  await shot(step++, "post-login");

  if (page.url().includes("device_verifications") || (await page.content()).includes("Verification Code")) {
    if (!CODE) {
      console.log("  !! 2FA challenge — set BC_2FA_CODE env var (get code from Tim's gmail) and retry");
      await browser.close();
      process.exit(3);
    }
    const codeIn = page.locator('input').filter({ hasNotText: "" }).first();
    await codeIn.fill(CODE);
    await codeIn.press("Enter");
    await page.waitForTimeout(5000);
    await shot(step++, "post-2fa");
  }
  // After login, navigate to Payments
  await page.goto("https://store-yemcm3khpa.mybigcommerce.com/manage/settings/payments", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(6000);
  await shot(step++, "payments-page");
}

// Persist storage state so future runs skip login
await ctx.storageState({ path: "docs/stitch/up-audit/paynow/bc-state.json" }).catch(() => {});

// TASK 1: Disable Test payment
console.log("\n[3] TASK 1: Disable 'Enable test credit card payments'");
try {
  const testText = page.getByText(/enable test credit card/i).first();
  await testText.waitFor({ state: "visible", timeout: 15000 });
  await testText.scrollIntoViewIfNeeded();
  await shot(step++, "test-visible");

  const checkboxes = await page.locator('input[type="checkbox"]').elementHandles();
  for (const cb of checkboxes) {
    const info = await cb.evaluate((el) => {
      const lbl = el.closest("label") || document.querySelector(`label[for="${el.id}"]`) || el.parentElement?.closest("label,[class*='Label']");
      return { text: (lbl?.textContent || "").toLowerCase(), checked: el.checked };
    });
    if (info.text.includes("test credit card")) {
      console.log(`  test checkbox: checked=${info.checked}`);
      if (info.checked) { await cb.click(); await page.waitForTimeout(1500); console.log("  → unchecked"); }
      break;
    }
  }
  await shot(step++, "test-after");

  const saveBtn = page.getByRole("button", { name: /^save$/i }).first();
  await saveBtn.click({ timeout: 4000 }).catch(() => console.log("  no Save button (may auto-save)"));
  await page.waitForTimeout(3000);
  await shot(step++, "test-saved");
} catch (e) {
  console.log("  !! TASK 1 failed:", e.message.slice(0, 200));
  await shot(step++, "task1-err");
}

// TASK 2: SGD Bank Deposit
console.log("\n[4] TASK 2: Switch to SGD, configure Bank Deposit");
try {
  const currencySel = page.locator('select').first();
  await currencySel.waitFor({ state: "visible", timeout: 10000 });
  await currencySel.selectOption({ label: "Singapore Dollar" });
  await page.waitForTimeout(5000);
  await shot(step++, "sgd-selected");

  const bankTab = page.getByRole("tab", { name: /bank deposit/i }).first();
  try {
    await bankTab.click({ timeout: 6000 });
  } catch {
    const bankTxt = page.getByText(/^bank deposit$/i).first();
    await bankTxt.click({ timeout: 6000 });
  }
  await page.waitForTimeout(3500);
  await shot(step++, "sgd-bank-tab");

  const displayInput = page.locator('input[type="text"]').first();
  await displayInput.waitFor({ state: "visible", timeout: 10000 });
  await displayInput.fill(DISPLAY_NAME);

  const ta = page.locator('textarea').first();
  await ta.fill(INSTRUCTIONS);
  await shot(step++, "sgd-filled");

  const saveBtn = page.getByRole("button", { name: /^save$/i }).first();
  await saveBtn.click({ timeout: 5000 });
  await page.waitForTimeout(6000);
  await shot(step++, "sgd-saved");
  console.log("  → SGD Bank Deposit saved");
} catch (e) {
  console.log("  !! TASK 2 failed:", e.message.slice(0, 300));
  await shot(step++, "task2-err");
}

console.log(`\n✓ Done — screenshots in ${OUT}`);
// Don't close the browser — keep user's Chrome alive
browser.close().catch(() => {});
