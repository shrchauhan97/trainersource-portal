// Verify the real user login form: drive /login, submit email, inspect the PKCE request.
import { chromium } from "file:///C:/Users/shrch/.claude/skills/gstack/node_modules/playwright/index.mjs";
import { mkdir } from "node:fs/promises";

const BASE = "https://trainersource-app.vercel.app";
const EMAIL = "shrchauhan97@gmail.com";
const OUT = "docs/stitch/e2e-prod/login-form";
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

const otpRequests = [];
page.on("request", async (req) => {
  if (req.url().includes("/auth/v1/otp")) {
    otpRequests.push({
      method: req.method(),
      url: req.url(),
      postData: req.postData(),
      headers: req.headers(),
    });
  }
});
const otpResponses = [];
page.on("response", async (res) => {
  if (res.url().includes("/auth/v1/otp")) {
    otpResponses.push({
      status: res.status(),
      url: res.url(),
      body: await res.text().catch(() => "(unreadable)"),
    });
  }
});

console.log(`[1/3] Opening /login...`);
await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.screenshot({ path: `${OUT}/01-login-form.png` });

console.log(`[2/3] Typing ${EMAIL} and submitting...`);
await page.fill('input[type="email"]', EMAIL);
await page.click('button:has-text("Send Magic Link")');

// Wait for either success or error
await page.waitForTimeout(4000);
await page.screenshot({ path: `${OUT}/02-after-submit.png`, fullPage: true });

const successText = await page.locator("text=Check your email").count();
const errorText = await page.locator("text=error,text=failed").count();

console.log(`\n[3/3] Results`);
console.log(`  OTP requests observed: ${otpRequests.length}`);
for (const req of otpRequests) {
  console.log(`    ${req.method} ${req.url}`);
  let parsedPostData = {};
  try { parsedPostData = JSON.parse(req.postData() || "{}"); } catch {}
  const keys = Object.keys(parsedPostData);
  console.log(`    post keys: [${keys.join(", ")}]`);
  console.log(`    has code_challenge: ${!!parsedPostData.code_challenge}`);
  console.log(`    code_challenge_method: ${parsedPostData.code_challenge_method || "(absent)"}`);
  console.log(`    email: ${parsedPostData.email}`);
  console.log(`    gotrue_meta_security / options:`, JSON.stringify(parsedPostData.gotrue_meta_security || parsedPostData.options || {}).slice(0, 200));
}
console.log(`  OTP responses: ${otpResponses.length}`);
for (const res of otpResponses) {
  console.log(`    ${res.status} body="${res.body.slice(0, 100)}"`);
}
console.log(`\n  UI state:`);
console.log(`    "Check your email" shown: ${successText > 0 ? "YES ✓" : "NO"}`);
console.log(`    error indicator shown: ${errorText > 0 ? "YES ⚠" : "NO"}`);

await browser.close();
