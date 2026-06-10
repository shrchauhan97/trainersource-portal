// Drive BigCommerce admin UI to enable the Bank Deposit offline payment method
// (customer-facing: "Bank Transfer (SG PayNow or International Wire)").
//
// Phase 1 (--explore): log in, navigate to Settings -> Payments, screenshot every step,
// verify the Offline Payment Methods section renders. Do NOT submit anything.
// Phase 2 (--apply): run the full form fill + enable + submit after exploration confirmed.
//
// Credentials come from handover_bc_bank_deposit.md: newhowl@gmail.com with Tim's password.
// Per that doc: "BC admin SPA didn't render under chrome-cdp programmatic navigation."
// Playwright sends real input events, so we retry with Playwright.
import { chromium } from "file:///C:/Users/shrch/.claude/skills/gstack/node_modules/playwright/index.mjs";
import { mkdir } from "node:fs/promises";

const mode = process.argv.includes("--apply") ? "apply" : "explore";
const BC_EMAIL = process.env.BC_ADMIN_EMAIL || "newhowl@gmail.com";
const BC_PASS = process.env.BC_ADMIN_PASS;  // MUST be exported, never hardcoded
if (!BC_PASS) {
  console.error("ERROR: export BC_ADMIN_PASS before running (from handover_bc_bank_deposit.md)");
  process.exit(1);
}

const STORE_HASH = "yemcm3khpa";
const ADMIN_URL = `https://store-${STORE_HASH}.mybigcommerce.com/manage/`;
const OUT = `docs/stitch/up-audit/paynow/${mode}`;
await mkdir(OUT, { recursive: true });

// Customer-facing copy from handover_bc_bank_deposit.md §"Customer-facing checkout copy"
const DISPLAY_NAME = "Bank Transfer (SG PayNow or International Wire)";
const INSTRUCTIONS = `SG customers — PayNow instant transfer:
• PayNow ID: 8228 9185 (recipient: Trainer Source)
• Reference: your Order # (important — so we can match payment to your order)

International customers — bank wire:
• Bank: DBS Bank Singapore
• SWIFT/BIC: DBSSSGSG
• Account name: Trainer Source (beneficiary: Alexis Cruz)
• Account number: 1203371927
• Bank address: 12 Marina Boulevard, MBFC Tower 3, Singapore 018982
• Reference: your Order #

Once payment lands (usually same-day for PayNow, 2–3 business days for international wires), we'll email order confirmation and shipping details. For questions, reach support@ultimate-peptides.com.`;

// Persist storage state so subsequent runs reuse the trusted-device cookie.
// Eliminates the "new 2FA code per run" churn.
import { existsSync } from "node:fs";
const STATE_PATH = "docs/stitch/up-audit/paynow/bc-state.json";
const browser = await chromium.launch({ headless: true, slowMo: 250 });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  storageState: existsSync(STATE_PATH) ? STATE_PATH : undefined,
});
const page = await ctx.newPage();
const shot = async (n) => {
  await page.screenshot({ path: `${OUT}/${String(n).padStart(2, "0")}.png`, fullPage: true });
  console.log(`  [shot] ${OUT}/${String(n).padStart(2, "0")}.png  url=${page.url().slice(0, 80)}  title=${(await page.title()).slice(0, 60)}`);
};

let step = 1;
console.log(`== mode=${mode} ==`);
console.log(`\n[1] Navigate to admin login`);
await page.goto(ADMIN_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(1500);
await shot(step++);

// Fill login form — BC uses a standard email/password flow
console.log(`\n[2] Filling login`);
const emailInput = page.locator('input[type="email"], input[name="user[email]"], input#user_email').first();
const passInput = page.locator('input[type="password"], input[name="user[password]"], input#user_password').first();
try {
  await emailInput.waitFor({ state: "visible", timeout: 10000 });
  await emailInput.fill(BC_EMAIL);
  await passInput.fill(BC_PASS);
  await shot(step++);
  const submitBtn = page.locator('button[type="submit"], input[type="submit"]').first();
  await submitBtn.click();
} catch (_e) {
  console.log(`  login form not as expected — screenshotting state and bailing`);
  await shot(step++);
  await browser.close();
  process.exit(2);
}

console.log(`\n[3] Waiting for post-login landing`);
try {
  await page.waitForLoadState("networkidle", { timeout: 25000 });
} catch {}
await page.waitForTimeout(3000);
await shot(step++);

// Check for 2FA / captcha
const bodyText = (await page.content()).toLowerCase();
if (bodyText.includes("verification code") || bodyText.includes("two-factor") || bodyText.includes("enter the code")) {
  const code = process.env.BC_2FA_CODE;
  if (!code) {
    console.log(`\n  !! 2FA challenge detected — export BC_2FA_CODE and retry`);
    await shot(step++);
    await browser.close();
    process.exit(3);
  }
  console.log(`\n[3a] Entering 2FA code ${code}`);
  const codeInput = page.locator('input[placeholder*="code" i], input[name*="code" i], input[type="text"]').first();
  await codeInput.waitFor({ state: "visible", timeout: 10000 });
  await codeInput.fill(code);
  await shot(step++);
  // Try button.click + fall back to Enter key
  try {
    await page.getByRole("button", { name: /verify/i }).click({ timeout: 6000 });
  } catch {
    console.log("  verify button click failed — trying Enter on code input");
    await codeInput.press("Enter");
  }
  try { await page.waitForLoadState("networkidle", { timeout: 25000 }); } catch {}
  await page.waitForTimeout(3500);
  await shot(step++);
  const stillBlocked = (await page.content()).toLowerCase().includes("verification code");
  if (stillBlocked) {
    console.log(`\n  !! 2FA code rejected or re-prompted`);
    await browser.close();
    process.exit(3);
  }
  console.log(`  2FA passed — continuing`);
  // Look for and check "Trust this device" / "Remember me" if present so we skip 2FA next time.
  try {
    const trustCheckbox = page.locator('input[type="checkbox"]').first();
    if (await trustCheckbox.count()) await trustCheckbox.check({ force: true });
  } catch {}
  // Persist the post-2FA storage so subsequent runs skip the whole login flow.
  await ctx.storageState({ path: STATE_PATH });
  console.log(`  saved storage state to ${STATE_PATH}`);
}

console.log(`\n[4] Navigate to Payment Settings`);
// Try a direct URL — known endpoint from handover: /manage/settings/payments
await page.goto(`${ADMIN_URL}settings/payments`, { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(4000);
await shot(step++);

// Render check — per handover doc, chrome-cdp got innerText.length === 0 here
const renderCheck = await page.evaluate(() => {
  return {
    bodyLen: (document.body?.innerText || "").length,
    headings: Array.from(document.querySelectorAll("h1,h2,h3")).map(h => h.textContent?.trim()).filter(Boolean).slice(0, 10),
    offline: (document.body?.innerText || "").toLowerCase().includes("offline"),
    bankDeposit: (document.body?.innerText || "").toLowerCase().includes("bank deposit"),
    url: location.href,
  };
});
console.log(`\n[5] Render check:`);
console.log(`    body length: ${renderCheck.bodyLen}`);
console.log(`    headings: ${JSON.stringify(renderCheck.headings)}`);
console.log(`    mentions "offline": ${renderCheck.offline}`);
console.log(`    mentions "bank deposit": ${renderCheck.bankDeposit}`);
console.log(`    url: ${renderCheck.url}`);

if (renderCheck.bodyLen < 100) {
  console.log(`\n  !! admin SPA failed to render (same symptom as chrome-cdp per handover doc)`);
  console.log(`  !! aborting — manual drive required`);
  await browser.close();
  process.exit(4);
}

if (mode === "explore") {
  console.log(`\n[6] Explore mode — not applying changes. Check screenshots then re-run with --apply.`);
  await browser.close();
  process.exit(0);
}

// PHASE 2: actually enable Bank Deposit
console.log(`\n[6] Looking for Bank Deposit entry`);
// BC's UI has an expandable Offline section. Try a few selectors.
const bankDepositCard = page.locator('text=/bank deposit/i').first();
try {
  await bankDepositCard.waitFor({ state: "visible", timeout: 10000 });
  await bankDepositCard.scrollIntoViewIfNeeded();
  await shot(step++);
} catch {
  console.log(`  !! Bank Deposit card not visible. May need to expand Offline section first.`);
  // Try expanding "Offline" heading
  const offlineToggle = page.locator('text=/offline payment methods/i').first();
  if (await offlineToggle.count()) {
    await offlineToggle.click();
    await page.waitForTimeout(1200);
    await shot(step++);
  }
}

console.log(`\n[7] Click Set up on Bank Deposit`);
const setupBtn = page.locator('button:has-text("Set up"), a:has-text("Set up")').first();
await setupBtn.click();
await page.waitForTimeout(2500);
await shot(step++);

console.log(`\n[8] Fill display name + payment instructions`);
const displayNameInput = page.locator('input[name*="display_name"], input[id*="display"], input[placeholder*="display" i]').first();
await displayNameInput.fill(DISPLAY_NAME);
const instructionsTextarea = page.locator('textarea[name*="instructions"], textarea[id*="instructions"], textarea').first();
await instructionsTextarea.fill(INSTRUCTIONS);
await shot(step++);

console.log(`\n[9] Save`);
const saveBtn = page.locator('button:has-text("Save"), button[type="submit"]:has-text("Update")').first();
await saveBtn.click();
await page.waitForTimeout(4000);
await shot(step++);

console.log(`\n✓ apply run complete — check final screenshot for success confirmation`);
await browser.close();
