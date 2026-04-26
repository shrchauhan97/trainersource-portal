import { chromium } from "file:///C:/Users/shrch/.claude/skills/gstack/node_modules/playwright/index.mjs";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1800, height: 1100 } });
const page = await ctx.newPage();
await page.goto("http://localhost:3000", { waitUntil: "networkidle" });

// Crop to main content (right 2/3, first 1100px)
await page.screenshot({
  path: "docs/stitch/shots/hero-closeup.png",
  clip: { x: 600, y: 0, width: 1200, height: 1100 },
});

console.log("hero-closeup.png saved");
await browser.close();
