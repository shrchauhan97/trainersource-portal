// Post-cleanup verification: confirms the contact page has 1 card (not 3), no powerpep references.
import { chromium } from "file:///C:/Users/shrch/.claude/skills/gstack/node_modules/playwright/index.mjs";
import { mkdir } from "node:fs/promises";

const code = process.argv[2];
const email = process.argv[3];
if (!code || !email) { console.error("usage: node up-verify-cleanup.mjs <code> <email>"); process.exit(1); }

const API_URL = "https://trainersource-app.vercel.app";
const STORE = "https://ultimate-peptides.com";
const OUT = "docs/stitch/up-audit/after";
await mkdir(OUT, { recursive: true });

const vr = await fetch(`${API_URL}/api/codes/validate`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ code, email, name: "Verify Script", country: "United States", city: "Wilmington" }),
});
const session = await vr.json();
if (!session.valid) { console.error("invalid:", session); process.exit(1); }

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(({ cid, tok, em }) => {
  window.localStorage.setItem("up_customer_id", String(cid));
  window.localStorage.setItem("up_session_token", String(tok));
  window.localStorage.setItem("up_customer_email", String(em));
}, { cid: session.customer_id, tok: session.session_token, em: email });
const page = await ctx.newPage();

for (const path of ["/", "/contact-us/", "/shipping-returns/", "/privacy-policy/", "/blog/"]) {
  await page.goto(STORE + path, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(1200);
  const name = path.replace(/\//g, "_") || "_home";
  await page.screenshot({ path: `${OUT}/${name.replace(/^_/, "")}.png`, fullPage: true });
  const audit = await page.evaluate(() => {
    const body = document.body?.innerText || "";
    const needDirectCards = document.querySelectorAll(".up-contact__sidebar, .up-contact__card, [class*='up-contact']").length;
    return {
      powerpep: body.includes("powerpepgroup"),
      hasUltimateEmail: body.includes("support@ultimate-peptides.com"),
      needDirectCards,
      title: document.title,
      metaDesc: document.querySelector('meta[name="description"]')?.content || "",
    };
  });
  console.log(path.padEnd(24), "powerpep:"+audit.powerpep, "| ult-email:"+audit.hasUltimateEmail, "| contact-elts:"+audit.needDirectCards, "| meta:"+(audit.metaDesc?audit.metaDesc.slice(0,40):'(none)'));
}
await browser.close();
console.log("\n✓ verification screenshots in", OUT);
