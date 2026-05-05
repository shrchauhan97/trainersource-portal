// Drive Shaurya's live Chrome (attached via CDP on port 9222) to complete:
//   1. Disable "Enable test credit card payments" on the Payments page.
//   2. Configure Bank Deposit for SGD currency (same copy as USD).
// Inherits the user's cookies/session — no 2FA required.
import { chromium } from "file:///C:/Users/shrch/.claude/skills/gstack/node_modules/playwright/index.mjs";
import { mkdir } from "node:fs/promises";

const OUT = "docs/stitch/up-audit/paynow/cdp-drive";
await mkdir(OUT, { recursive: true });

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

const DISPLAY_NAME = "Bank Transfer (SG PayNow or International Wire)";

console.log("[1] Connecting to Chrome on localhost:9222");
const browser = await chromium.connectOverCDP("http://localhost:9222");
const contexts = browser.contexts();
console.log(`  contexts: ${contexts.length}`);
const ctx = contexts[0];
let page = ctx.pages()[0] ?? await ctx.newPage();

let step = 1;
const shot = async (n, label) => {
  await page.screenshot({ path: `${OUT}/${String(n).padStart(2, "0")}-${label}.png`, fullPage: true });
  console.log(`  shot ${n}-${label} | url=${page.url().slice(0, 80)}`);
};

console.log("\n[2] Navigate to BC admin Payments page");
await page.goto("https://store-yemcm3khpa.mybigcommerce.com/manage/settings/payments", { waitUntil: "domcontentloaded", timeout: 40000 });
await page.waitForTimeout(7000);
await shot(step++, "landing");

const state = await page.evaluate(() => ({
  bodyLen: (document.body?.innerText || "").length,
  url: location.href,
  loggedIn: !location.hostname.includes("login."),
  title: document.title,
}));
console.log(`  loggedIn=${state.loggedIn} | bodyLen=${state.bodyLen} | title="${state.title}"`);

if (!state.loggedIn) {
  console.log("  !! not authenticated — user's BC session cookie didn't persist. Aborting.");
  await browser.close();
  process.exit(1);
}

if (state.bodyLen < 200) {
  console.log("  !! SPA didn't hydrate. Waiting longer...");
  await page.waitForTimeout(5000);
  await shot(step++, "after-wait");
}

// TASK 1: Disable test credit card payments
console.log("\n[3] TASK 1: Disable test credit card payments");
try {
  // The text is usually "Enable test credit card payments"
  const testLabel = page.getByText(/test credit card payments/i).first();
  await testLabel.waitFor({ state: "visible", timeout: 15000 });
  await testLabel.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await shot(step++, "test-section-visible");

  // Find the checkbox adjacent to that label
  const checkboxes = await page.locator('input[type="checkbox"]').elementHandles();
  let flipped = false;
  for (const cb of checkboxes) {
    const context = await cb.evaluate((el) => {
      const label = el.closest("label") || document.querySelector(`label[for="${el.id}"]`) || el.parentElement?.closest("label,div");
      return { labelText: (label?.textContent || "").toLowerCase(), checked: el.checked, id: el.id };
    });
    if (context.labelText.includes("test credit card") || context.labelText.includes("test payment")) {
      console.log(`  test checkbox: id="${context.id}" checked=${context.checked} label="${context.labelText.slice(0, 80)}"`);
      if (context.checked) {
        await cb.click();
        flipped = true;
        console.log("  → clicked to uncheck");
        await page.waitForTimeout(1200);
      } else {
        console.log("  → already unchecked");
      }
      break;
    }
  }
  await shot(step++, "test-after-click");

  // Save (if a button exists)
  if (flipped) {
    try {
      const saveBtn = page.getByRole("button", { name: /^save$/i }).first();
      await saveBtn.click({ timeout: 4000 });
      console.log("  → clicked Save");
      await page.waitForTimeout(3000);
    } catch {
      console.log("  → no Save button found, changes likely auto-saved on toggle");
    }
    await shot(step++, "test-after-save");
  }
} catch (e) {
  console.log("  !! TASK 1 failed:", e.message.slice(0, 200));
  await shot(step++, "test-error");
}

// TASK 2: Switch currency to SGD + configure Bank Deposit
console.log("\n[4] TASK 2: Switch currency dropdown to Singapore Dollar");
try {
  // The "Show payment methods for" dropdown - usually the only top-level select
  const currencySel = page.locator('select').first();
  await currencySel.waitFor({ state: "visible", timeout: 10000 });
  const currentVal = await currencySel.inputValue();
  console.log(`  current currency: ${currentVal}`);
  await currencySel.selectOption({ label: "Singapore Dollar" });
  await page.waitForTimeout(4000);
  await shot(step++, "sgd-selected");

  // Click Bank Deposit tab
  const bankTab = page.getByRole("tab", { name: /bank deposit/i }).or(page.getByText(/^bank deposit$/i)).first();
  await bankTab.click({ timeout: 8000 });
  await page.waitForTimeout(3000);
  await shot(step++, "sgd-bank-tab");

  // Fill Display Name
  const displayInput = page.locator('input[type="text"]').first();
  await displayInput.waitFor({ state: "visible", timeout: 10000 });
  await displayInput.fill("");  // clear default
  await displayInput.fill(DISPLAY_NAME);
  await page.waitForTimeout(500);

  // Fill Account Information textarea
  const ta = page.locator('textarea').first();
  await ta.fill("");  // clear placeholder
  await ta.fill(INSTRUCTIONS);
  await shot(step++, "sgd-filled");

  // Save
  const saveBtn = page.getByRole("button", { name: /^save$/i }).first();
  await saveBtn.click({ timeout: 5000 });
  console.log("  → clicked Save for SGD Bank Deposit");
  await page.waitForTimeout(5000);
  await shot(step++, "sgd-saved");
} catch (e) {
  console.log("  !! TASK 2 failed:", e.message.slice(0, 300));
  await shot(step++, "sgd-error");
}

console.log(`\n✓ Drive complete — check screenshots in ${OUT}`);
await browser.close();
