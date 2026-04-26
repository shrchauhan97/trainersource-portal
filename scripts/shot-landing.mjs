import { chromium } from "file:///C:/Users/shrch/.claude/skills/gstack/node_modules/playwright/index.mjs";

const URL = "http://localhost:3000";
const OUT_DIR = "docs/stitch/shots";

const { mkdir } = await import("node:fs/promises");
await mkdir(OUT_DIR, { recursive: true });

const browser = await chromium.launch();

async function shot(width, height, name) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto(URL, { waitUntil: "networkidle", timeout: 30000 });
  const path = `${OUT_DIR}/${name}.png`;
  await page.screenshot({ path, fullPage: true });
  console.log(`${name}: ${path} (${errors.length} console errors)`);
  if (errors.length) console.log("  errors:", errors.slice(0, 3));
  await ctx.close();
}

await shot(1440, 900, "desktop");
await shot(375, 812, "mobile");
await shot(768, 1024, "tablet");

await browser.close();
console.log("Done.");
