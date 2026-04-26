// Verifies that the "Bank Transfer (SG PayNow or International Wire)" option
// renders on BC's checkout payment step. Stops BEFORE placing an order (we don't
// want to pollute BC with test orders).
//
// Usage: node scripts/up-verify-bank-deposit.mjs <code> <email>
import { chromium } from "file:///C:/Users/shrch/.claude/skills/gstack/node_modules/playwright/index.mjs";
import { mkdir } from "node:fs/promises";

const code = process.argv[2];
const email = process.argv[3];
if (!code || !email) { console.error("usage: node ... <code> <email>"); process.exit(1); }

const API_URL = "https://trainersource-app.vercel.app";
const STORE = "https://ultimate-peptides.com";
const OUT = "docs/stitch/up-audit/checkout-verify";
await mkdir(OUT, { recursive: true });

console.log("[1] mint session");
const vr = await fetch(`${API_URL}/api/codes/validate`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ code, email, name: "Checkout Tester", country: "United States", city: "Wilmington" }),
});
const s = await vr.json();
if (!s.valid) { console.error("bad code:", s); process.exit(1); }
console.log("  session minted");

const browser = await chromium.launch({ headless: true, slowMo: 150 });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(v => {
  localStorage.setItem("up_customer_id", String(v.cid));
  localStorage.setItem("up_session_token", String(v.tok));
  localStorage.setItem("up_customer_email", String(v.em));
}, { cid: s.customer_id, tok: s.session_token, em: email });
const page = await ctx.newPage();

const shot = async (n, label) => {
  await page.screenshot({ path: `${OUT}/${String(n).padStart(2, "0")}-${label}.png`, fullPage: true });
  console.log(`  shot ${n}-${label} | url=${page.url().slice(0, 80)}`);
};

let step = 1;
console.log("\n[2] Direct add-to-cart via BC's ?action=add URL (product_id=116 = TB-500)");
// BC accepts /cart.php?action=add&product_id=X for single-SKU products.
// product_id=116 variant_id=81 (TB-500, only variant)
await page.goto(`${STORE}/cart.php?action=add&product_id=116&variant_id=81&qty=1`, { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(2500);
await shot(step++, "after-add");

// Should now be on the cart page with 1 item
console.log("\n[3] Cart page");
if (!page.url().endsWith("/cart.php")) {
  await page.goto(`${STORE}/cart.php`, { waitUntil: "networkidle", timeout: 20000 });
  await page.waitForTimeout(1500);
}
await shot(step++, "cart");

console.log("\n[5] Proceed to checkout");
const checkoutBtn = page.locator('a:has-text("Proceed to Checkout"), button:has-text("Proceed to Checkout"), a.button:has-text("Checkout")').first();
await checkoutBtn.click();
try { await page.waitForLoadState("networkidle", { timeout: 20000 }); } catch {}
await page.waitForTimeout(3000);
await shot(step++, "checkout-landing");

console.log("\n[6] Fill customer email");
// BC Optimized Checkout first step is email capture
try {
  const emailIn = page.locator('input#email, input[name="email"]').first();
  await emailIn.waitFor({ state: "visible", timeout: 10000 });
  await emailIn.fill("verify@ultimate-peptides.com");
  const contBtn = page.locator('button:has-text("Continue")').first();
  await contBtn.click();
  await page.waitForTimeout(3000);
  await shot(step++, "after-email");
} catch (e) {
  console.log("  no email step OR already past it:", e.message.slice(0, 120));
}

console.log("\n[7] Fill billing/shipping address");
const fillIfVisible = async (sel, val) => {
  try {
    const el = page.locator(sel).first();
    if (await el.count() && await el.isVisible()) await el.fill(val);
  } catch {}
};
await fillIfVisible('input[name="firstName"], input#firstNameInput', "Test");
await fillIfVisible('input[name="lastName"], input#lastNameInput', "Checkout");
await fillIfVisible('input[name="address1"], input#addressLine1Input', "123 Test St");
await fillIfVisible('input[name="city"], input#cityInput', "Wilmington");
await fillIfVisible('input[name="postCode"], input[name="postalCode"], input#postCodeInput', "19801");
await fillIfVisible('input[name="phone"], input#phoneInput', "3025551234");
// Dropdown: Country
try {
  const countrySel = page.locator('select[name="countryCode"], select#countryCodeInput').first();
  if (await countrySel.count()) await countrySel.selectOption({ label: "United States" });
} catch {}
// Dropdown: State
await page.waitForTimeout(1200);
try {
  const stateSel = page.locator('select[name="stateOrProvince"], select[name="stateOrProvinceCode"], select#provinceCodeInput').first();
  if (await stateSel.count()) await stateSel.selectOption({ label: "Delaware" });
} catch {}
await shot(step++, "shipping-filled");

// Continue to shipping method
try {
  const contShip = page.locator('button:has-text("Continue")').first();
  await contShip.click();
  await page.waitForTimeout(4000);
  await shot(step++, "after-shipping-continue");
} catch (e) {
  console.log("  could not continue past shipping:", e.message.slice(0, 100));
}

// Shipping method selection
try {
  await page.waitForTimeout(2000);
  const contShip2 = page.locator('button:has-text("Continue")').first();
  await contShip2.click();
  await page.waitForTimeout(3500);
  await shot(step++, "after-shipping-method");
} catch {}

console.log("\n[8] Payment step — look for Bank Transfer option");
const paymentAudit = await page.evaluate(() => {
  const body = document.body?.innerText || "";
  const hasBankTransfer = body.includes("Bank Transfer") || body.includes("bank deposit") || body.toLowerCase().includes("bank transfer");
  const hasPayNow = body.includes("PayNow") || body.includes("8228 9185");
  const paymentMethodsVisible = Array.from(document.querySelectorAll('[data-test="payment-method"], [class*="paymentMethod"], [id*="payment"]')).map(e => e.textContent?.slice(0, 80).trim()).filter(Boolean).slice(0, 10);
  return { hasBankTransfer, hasPayNow, paymentMethodsVisible, bodyLen: body.length, urlHash: location.hash };
});
console.log("  payment step audit:", JSON.stringify(paymentAudit, null, 2));
await shot(step++, "payment-options");

await browser.close();
console.log("\n✓ stopped before order placement — check screenshots");
