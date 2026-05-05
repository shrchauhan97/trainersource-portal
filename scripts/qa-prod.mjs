import { chromium } from "file:///C:/Users/shrch/.claude/skills/gstack/node_modules/playwright/index.mjs";
import { mkdir } from "node:fs/promises";

const URL = process.env.QA_URL || "https://trainersource-app.vercel.app";
const OUT = "docs/stitch/qa";
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const issues = [];

async function audit(w, h, name) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  const errs = [];
  const warns = [];
  const requests = [];
  page.on("pageerror", (e) => errs.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errs.push(`console: ${m.text()}`);
    if (m.type() === "warning") warns.push(m.text());
  });
  page.on("requestfailed", (r) => requests.push(`${r.url()} → ${r.failure()?.errorText}`));

  const start = Date.now();
  await page.goto(URL, { waitUntil: "networkidle", timeout: 45000 });
  const loadMs = Date.now() - start;

  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });

  // Accessibility / structural checks
  const h1Count = await page.locator("h1").count();
  const imgsMissingAlt = await page.locator("img:not([alt])").count();
  const brokenLinks = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("a[href]")).filter(a => {
      const h = a.getAttribute("href");
      return h === "" || h === "#";
    }).length;
  });
  const heroImgLoaded = await page.locator('img[alt*="Ultimate Peptides product vial"]').first().evaluate(img => img.complete && img.naturalWidth > 0).catch(() => false);
  const logoLoaded = await page.locator('img[alt*="TrainerSource logo"]').first().evaluate(img => img.complete && img.naturalWidth > 0).catch(() => false);

  console.log(`\n=== ${name} (${w}x${h}) ===`);
  console.log(`  load: ${loadMs}ms | h1s: ${h1Count} | imgs missing alt: ${imgsMissingAlt} | broken links: ${brokenLinks}`);
  console.log(`  hero loaded: ${heroImgLoaded} | logo loaded: ${logoLoaded}`);
  console.log(`  js errors: ${errs.length} | warnings: ${warns.length} | failed requests: ${requests.length}`);
  if (errs.length) console.log("  ", errs.slice(0, 3));
  if (requests.length) console.log("  failed:", requests.slice(0, 3));

  issues.push({
    viewport: name,
    loadMs,
    h1Count,
    imgsMissingAlt,
    brokenLinks,
    heroLoaded: heroImgLoaded,
    logoLoaded,
    jsErrors: errs.length,
    warnings: warns.length,
    failedRequests: requests.length,
    errors: errs.slice(0, 5),
    failed: requests.slice(0, 5),
  });

  // Test a nav click: About Us should scroll to ultimate-mission section
  await page.locator('a[href="#ultimate-mission"]').first().click().catch(() => {});
  await page.waitForTimeout(1000);
  const scrollY = await page.evaluate(() => window.scrollY);
  console.log(`  about-click scrollY: ${scrollY}`);
  issues[issues.length - 1].aboutScrollY = scrollY;

  await ctx.close();
}

await audit(1440, 900, "desktop-1440");
await audit(1800, 1100, "desktop-1800");
await audit(375, 812, "mobile");
await audit(768, 1024, "tablet");

await browser.close();

console.log("\n=== SUMMARY ===");
console.log(JSON.stringify(issues, null, 2));
