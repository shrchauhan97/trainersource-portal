// Drive BC admin by launching Playwright with Chrome (channel:"chrome") against
// a COPY of the user's Default Chrome profile. This inherits all cookies (including
// BC admin session) without touching the user's running Chrome.
//
// Two tasks:
//   1. Settings -> Payment methods -> bottom -> uncheck "Enable test credit card payments"
//   2. Same page -> top dropdown to "Singapore Dollar" -> Bank Deposit tab -> paste same config as USD
//
// Usage: node scripts/up-bc-drive-via-profile-copy.mjs
import { chromium } from "file:///C:/Users/shrch/.claude/skills/gstack/node_modules/playwright/index.mjs";
import { mkdir, cp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const HOME = process.env.USERPROFILE || process.env.HOME;
const SRC_PROFILE = path.join(HOME, "AppData", "Local", "Google", "Chrome", "User Data");
const COPY_ROOT = "docs/stitch/up-audit/paynow/chrome-profile-copy";
const OUT = "docs/stitch/up-audit/paynow/drive";
await mkdir(OUT, { recursive: true });

// Fresh copy
if (existsSync(COPY_ROOT)) { console.log("cleaning previous profile copy"); await rm(COPY_ROOT, { recursive: true, force: true }); }
console.log("[1] Copying Chrome Default profile → " + COPY_ROOT);
await mkdir(COPY_ROOT, { recursive: true });

// Only copy what we need — Default folder has cookies, login state, plus a ton of junk.
// Minimum set for session persistence: Default/Cookies, Default/Network/Cookies, Default/Preferences, Default/Login Data, Local State.
const items = ["Default/Cookies", "Default/Network", "Default/Preferences", "Default/Login Data", "Default/Login Data For Account", "Local State"];
for (const rel of items) {
  const src = path.join(SRC_PROFILE, rel);
  const dst = path.join(COPY_ROOT, rel);
  if (existsSync(src)) {
    await mkdir(path.dirname(dst), { recursive: true });
    try {
      await cp(src, dst, { recursive: true });
      console.log("  copied", rel);
    } catch (e) {
      console.log("  ! skipped", rel, "-", e.code);
    }
  }
}

console.log("\n[2] Launching Playwright against Chrome with copied profile");
const ctx = await chromium.launchPersistentContext(path.resolve(COPY_ROOT), {
  channel: "chrome",  // uses system Chrome, not Playwright's chromium
  headless: false,
  viewport: { width: 1440, height: 900 },
  args: ["--profile-directory=Default"],
  slowMo: 200,
});

const page = ctx.pages()[0] ?? await ctx.newPage();
const shot = async (n, label) => {
  await page.screenshot({ path: `${OUT}/${String(n).padStart(2, "0")}-${label}.png`, fullPage: true });
  console.log(`  shot ${n}-${label} | url=${page.url().slice(0, 80)}`);
};

let step = 1;

console.log("\n[3] Navigate to BC admin Payments page");
await page.goto("https://store-yemcm3khpa.mybigcommerce.com/manage/settings/payments", { waitUntil: "domcontentloaded", timeout: 40000 });
await page.waitForTimeout(6000);  // SPA hydration
await shot(step++, "landing");

const hydrated = await page.evaluate(() => ({ bodyLen: (document.body?.innerText || "").length, url: location.href, loggedIn: !location.hostname.includes("login.") }));
console.log(`  body len=${hydrated.bodyLen}, loggedIn=${hydrated.loggedIn}, url=${hydrated.url.slice(0, 90)}`);
if (!hydrated.loggedIn || hydrated.bodyLen < 200) {
  console.log("  !! not authenticated or SPA not hydrated — aborting, screenshots should show the state");
  await ctx.close();
  process.exit(1);
}

// TASK 1: Uncheck "Enable test credit card payments"
console.log("\n[4] Looking for Test payment toggle");
try {
  const testToggle = page.getByText(/test credit card/i).first();
  await testToggle.scrollIntoViewIfNeeded();
  await shot(step++, "test-toggle-visible");
  // Find the checkbox/toggle near this text
  const _toggleHandle = page.locator('input[type="checkbox"]').filter({ has: page.getByText(/test/i) }).first();
  const checkboxes = await page.locator('input[type="checkbox"]').elementHandles();
  let flipped = false;
  for (const cb of checkboxes) {
    const label = await cb.evaluate((el) => {
      const lbl = el.closest("label") || document.querySelector(`label[for="${el.id}"]`);
      return (lbl?.textContent || "").toLowerCase();
    });
    if (label.includes("test")) {
      const checked = await cb.evaluate((el) => el.checked);
      console.log(`  test checkbox found — checked=${checked}, label="${label.slice(0, 60)}"`);
      if (checked) {
        await cb.click();
        flipped = true;
        console.log("  clicked to uncheck");
      } else {
        console.log("  already unchecked — skipping");
      }
      break;
    }
  }
  await shot(step++, "test-toggle-after");
  if (flipped) {
    // Find Save button
    const saveBtn = page.getByRole("button", { name: /save/i }).first();
    await saveBtn.click({ timeout: 5000 }).catch(() => console.log("  save click failed — auto-save may apply"));
    await page.waitForTimeout(2500);
    await shot(step++, "test-toggle-saved");
  }
} catch (e) {
  console.log("  !! test toggle step failed:", e.message.slice(0, 200));
  await shot(step++, "test-toggle-error");
}

// TASK 2: Switch currency to SGD + configure Bank Deposit
console.log("\n[5] Switching currency dropdown to Singapore Dollar");
try {
  // The "Show payment methods for" dropdown at the top
  const currencySel = page.locator('select').first();
  await currencySel.waitFor({ state: "visible", timeout: 10000 });
  await currencySel.selectOption({ label: "Singapore Dollar" });
  await page.waitForTimeout(3000);
  await shot(step++, "sgd-selected");

  // Click Bank Deposit tab
  const bankTab = page.getByText(/^bank deposit$/i).first();
  await bankTab.click();
  await page.waitForTimeout(2500);
  await shot(step++, "sgd-bank-deposit-tab");

  // Fill Display Name
  const _displayName = page.locator('input').filter({ hasText: "" }).first();
  // Better selector
  const displayInput = page.locator('input[type="text"]').first();
  await displayInput.fill("Bank Transfer (SG PayNow or International Wire)");

  // Fill Account Information textarea
  const instructions = `SG customers — PayNow instant transfer:
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

  const ta = page.locator('textarea').first();
  await ta.fill(instructions);
  await shot(step++, "sgd-filled");

  const saveBtn = page.getByRole("button", { name: /save/i }).first();
  await saveBtn.click();
  await page.waitForTimeout(4000);
  await shot(step++, "sgd-saved");
} catch (e) {
  console.log("  !! SGD Bank Deposit step failed:", e.message.slice(0, 300));
  await shot(step++, "sgd-error");
}

console.log(`\n✓ Done — check screenshots in ${OUT}`);
await page.waitForTimeout(3000);
await ctx.close();
