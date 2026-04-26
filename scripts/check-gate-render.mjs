// Load ultimate-peptides.com in a fresh Playwright context (= incognito) and verify the access gate blocker renders.
import { chromium } from "file:///C:/Users/shrch/.claude/skills/gstack/node_modules/playwright/index.mjs";
import { mkdir, writeFile } from "node:fs/promises";

const OUT = "docs/stitch/gate-diag";
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, bypassCSP: true });
await ctx.route("**/*", (route) => {
  const headers = { ...route.request().headers(), "cache-control": "no-cache", pragma: "no-cache" };
  route.continue({ headers });
});
const page = await ctx.newPage();

const consoleEvents = [];
const requestLog = [];
page.on("console", (m) => consoleEvents.push({ type: m.type(), text: m.text() }));
page.on("pageerror", (e) => consoleEvents.push({ type: "pageerror", text: e.message, stack: e.stack }));
page.on("requestfinished", (r) => {
  const u = r.url();
  if (u.includes("trainersource-app.vercel.app") || u.includes("TRAINERSOURCE") || u.includes("access-gate")) {
    r.response().then((res) => requestLog.push({ method: r.method(), url: u, status: res?.status() })).catch(() => {});
  }
});

console.log("[1] navigate to https://ultimate-peptides.com/");
await page.goto("https://ultimate-peptides.com/", { waitUntil: "networkidle", timeout: 45000 });
await page.waitForTimeout(2000);

const blockerExists = await page.evaluate(() => {
  const ids = ["ts-access-gate-pre-blocker", "ts-access-gate", "access-gate-root", "access-gate"];
  const found = {};
  for (const id of ids) {
    const el = document.getElementById(id);
    found[id] = el ? { present: true, visible: el.offsetParent !== null, ariaHidden: el.getAttribute("aria-hidden"), display: getComputedStyle(el).display, innerTextLen: (el.innerText || "").length } : { present: false };
  }
  const overlays = Array.from(document.querySelectorAll("div, dialog")).filter((el) => {
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return (style.position === "fixed" || style.position === "absolute") && rect.width > 300 && rect.height > 200 && (style.zIndex === "" ? 0 : Number(style.zIndex)) > 10;
  });
  return { knownById: found, overlayCount: overlays.length, overlaySample: overlays.slice(0, 3).map((o) => ({ id: o.id, className: o.className, zIndex: getComputedStyle(o).zIndex, width: o.getBoundingClientRect().width, height: o.getBoundingClientRect().height })) };
});
console.log(`\n[2] Gate element check:\n${JSON.stringify(blockerExists, null, 2)}`);

const trainerSourceApiVar = await page.evaluate(() => ({
  TRAINERSOURCE_API: typeof window.TRAINERSOURCE_API !== "undefined" ? window.TRAINERSOURCE_API : "(not defined)",
  gateConfig: typeof window.__TS_GATE_CONFIG !== "undefined" ? window.__TS_GATE_CONFIG : "(not defined)",
}));
console.log(`\n[3] Window globals: ${JSON.stringify(trainerSourceApiVar)}`);

console.log(`\n[4] Requests to our API during page load:`);
for (const r of requestLog) console.log(`    ${r.method} ${r.url} → ${r.status}`);

const errors = consoleEvents.filter((e) => e.type === "error" || e.type === "pageerror");
console.log(`\n[5] JS errors: ${errors.length}`);
for (const e of errors.slice(0, 10)) console.log(`    [${e.type}] ${e.text.slice(0, 200)}`);

console.log(`\n[6] All console output (${consoleEvents.length} events):`);
for (const e of consoleEvents.slice(0, 30)) {
  if (!e.text.includes("Tracking") && !e.text.includes("Segment")) console.log(`    [${e.type}] ${e.text.slice(0, 160)}`);
}

await page.screenshot({ path: `${OUT}/storefront.png`, fullPage: true });
await writeFile(`${OUT}/diag.json`, JSON.stringify({ blockerExists, trainerSourceApiVar, requestLog, consoleEvents }, null, 2));

await browser.close();
console.log(`\nArtifacts: ${OUT}`);
