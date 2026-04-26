// Capture the full OTP request body to verify PKCE code_challenge is sent.
import { chromium } from "file:///C:/Users/shrch/.claude/skills/gstack/node_modules/playwright/index.mjs";

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();

let capturedBody = null;
let capturedHeaders = null;
await page.route("**/auth/v1/otp**", async (route, req) => {
  capturedBody = req.postData();
  capturedHeaders = req.headers();
  await route.continue();
});

await page.goto("https://trainersource-app.vercel.app/login", { waitUntil: "networkidle" });
await page.fill('input[type="email"]', "shrchauhan97@gmail.com");
await page.click('button:has-text("Send Magic Link")');
await page.waitForTimeout(5000);

console.log("--- OTP request body ---");
console.log(capturedBody);
console.log("\n--- Parsed ---");
try {
  const parsed = JSON.parse(capturedBody);
  console.log("keys:", Object.keys(parsed));
  console.log("code_challenge:", parsed.code_challenge ? parsed.code_challenge.slice(0, 30) + "..." : "(null)");
  console.log("code_challenge_method:", parsed.code_challenge_method);
  console.log("gotrue_meta_security:", parsed.gotrue_meta_security);
  console.log("create_user:", parsed.create_user);
} catch (e) {
  console.log("parse err:", e.message);
}

// Also check what was stored in cookies for code_verifier
const cookies = await ctx.cookies();
console.log("\n--- Cookies after submit ---");
for (const c of cookies) {
  console.log(`  ${c.name} (${c.domain}, httpOnly=${c.httpOnly}): ${c.value.slice(0, 50)}...`);
}

// Also check localStorage for code_verifier
const storage = await page.evaluate(() => {
  const out = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    out[k] = localStorage.getItem(k);
  }
  return out;
});
console.log("\n--- localStorage ---");
for (const [k, v] of Object.entries(storage)) {
  console.log(`  ${k}: ${v?.slice(0, 100)}`);
}

await browser.close();
