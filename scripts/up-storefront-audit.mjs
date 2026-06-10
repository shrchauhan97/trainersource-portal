// End-to-end storefront audit for ultimate-peptides.com.
// Authenticates the access gate once, then walks key pages capturing screenshots +
// structural issues (missing images, broken links, JS errors, console noise).
// Usage: node scripts/up-storefront-audit.mjs <access_code> <email>
import { chromium } from "file:///C:/Users/shrch/.claude/skills/gstack/node_modules/playwright/index.mjs";
import { mkdir, writeFile } from "node:fs/promises";

const API_URL = "https://trainersource-app.vercel.app";
const STORE = "https://ultimate-peptides.com";
const OUT = "docs/stitch/up-audit/storefront";
await mkdir(OUT, { recursive: true });

const code = process.argv[2];
const email = process.argv[3];
if (!code || !email) { console.error("Usage: node scripts/up-storefront-audit.mjs <code> <email>"); process.exit(1); }

console.log("[1] minting session via /api/codes/validate");
const vr = await fetch(`${API_URL}/api/codes/validate`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ code, email, name: "Audit Script", country: "United States", city: "Wilmington" }),
});
const session = await vr.json();
if (!session.valid) { console.error("invalid code:", session); process.exit(1); }
console.log("  customer_id:", session.customer_id, "| session_token:", session.session_token?.slice(0, 16) + "…");

const pages = [
  { path: "/", name: "home", type: "landing" },
  { path: "/buy-research-peptides/", name: "category", type: "category" },
  { path: "/semaglutide/", name: "pdp-sema", type: "product" },
  { path: "/bpc-157-tb-500/", name: "pdp-bpc", type: "product" },
  { path: "/contact-us/", name: "contact", type: "page" },
  { path: "/faq/", name: "faq", type: "page" },
  { path: "/shipping-returns/", name: "shipping-returns", type: "page" },
  { path: "/why-us/", name: "why-us", type: "page" },
  { path: "/research-insights/", name: "research-insights", type: "page" },
  { path: "/privacy-policy/", name: "privacy", type: "page" },
  { path: "/terms-conditions/", name: "terms", type: "page" },
  { path: "/blog/", name: "blog", type: "blog-index" },
  { path: "/cart.php", name: "cart", type: "cart" },
  { path: "/login.php", name: "login", type: "login" },
];

const viewports = [
  { w: 1440, h: 900, name: "desktop" },
  { w: 375, h: 812, name: "mobile" },
];

const browser = await chromium.launch();
const findings = {};

for (const vp of viewports) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
  const page = await ctx.newPage();

  // Inject gate-bypass localStorage before first navigation
  await page.addInitScript(({ cid, tok, em }) => {
    try {
      window.localStorage.setItem("up_customer_id", String(cid));
      window.localStorage.setItem("up_session_token", String(tok));
      window.localStorage.setItem("up_customer_email", String(em));
    } catch {}
  }, { cid: session.customer_id, tok: session.session_token, em: email });

  for (const p of pages) {
    const errs = [], warns = [], failedRequests = [];
    page.removeAllListeners("console");
    page.removeAllListeners("pageerror");
    page.removeAllListeners("requestfailed");
    page.on("pageerror", (e) => errs.push({ msg: e.message, stack: (e.stack || "").slice(0, 300) }));
    page.on("console", (m) => {
      const entry = { type: m.type(), text: m.text().slice(0, 400) };
      if (m.type() === "error") errs.push(entry);
      else if (m.type() === "warning") warns.push(entry);
    });
    page.on("requestfailed", (r) => failedRequests.push({ url: r.url(), err: r.failure()?.errorText }));

    const start = Date.now();
    let status = 0;
    try {
      const resp = await page.goto(STORE + p.path, { waitUntil: "networkidle", timeout: 30000 });
      status = resp?.status() ?? 0;
    } catch (e) {
      errs.push({ type: "nav", text: e.message });
    }
    const loadMs = Date.now() - start;
    await page.waitForTimeout(800);

    await page.screenshot({ path: `${OUT}/${vp.name}-${p.name}.png`, fullPage: true });

    const audit = await page.evaluate(() => {
      const imgs = Array.from(document.images);
      const brokenImgs = imgs.filter(i => !i.complete || i.naturalWidth === 0).map(i => ({ src: i.src.slice(0, 120), alt: i.alt }));
      const missingAlt = imgs.filter(i => !i.hasAttribute("alt") || i.alt === "").length;
      const anchors = Array.from(document.querySelectorAll("a[href]"));
      const emptyLinks = anchors.filter(a => { const h = a.getAttribute("href"); return h === "" || h === "#"; }).length;
      const mailtos = anchors.filter(a => (a.getAttribute("href") || "").startsWith("mailto:")).map(a => a.getAttribute("href"));
      const hasH1 = document.querySelectorAll("h1").length;
      const title = document.title;
      const metaDesc = document.querySelector('meta[name="description"]')?.content || "";
      const gateVisible = !!document.getElementById("ts-access-gate-pre-blocker") || !!document.getElementById("ts-access-gate") || !!document.querySelector('[id*="access-gate"]');
      const bodyText = document.body?.innerText || "";
      const dayMatches = [...bodyText.matchAll(/\d+\s*(?:business\s+)?days?/gi)].map(m => m[0]).slice(0, 12);
      const powerpep = bodyText.includes("powerpepgroup");
      const bodyLen = bodyText.length;
      return { brokenImgs: brokenImgs.slice(0, 10), brokenImgCount: brokenImgs.length, missingAlt, emptyLinks, mailtos: [...new Set(mailtos)], hasH1, title, metaDesc, gateVisible, dayMatches, powerpep, bodyLen };
    });

    const key = `${vp.name}-${p.name}`;
    findings[key] = { path: p.path, status, loadMs, errs: errs.slice(0, 8), warnCount: warns.length, failedRequests: failedRequests.slice(0, 5), ...audit };
    const _issueCount = errs.length + audit.brokenImgCount + (audit.gateVisible ? 1 : 0) + (audit.hasH1 !== 1 ? 1 : 0) + (audit.powerpep ? 1 : 0);
    console.log(`[${vp.name}] ${p.path.padEnd(30)} ${status} ${loadMs}ms  errs:${errs.length} brokenImg:${audit.brokenImgCount} h1s:${audit.hasH1} gate:${audit.gateVisible} powerpep:${audit.powerpep}`);
  }
  await ctx.close();
}

await browser.close();
await writeFile(`${OUT}/_findings.json`, JSON.stringify(findings, null, 2));
console.log("\n✓ done — screenshots + findings in", OUT);
