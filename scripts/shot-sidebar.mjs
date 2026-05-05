import { chromium } from "file:///C:/Users/shrch/.claude/skills/gstack/node_modules/playwright/index.mjs";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1800, height: 1100 } });
const page = await ctx.newPage();
await page.goto("http://localhost:3000", { waitUntil: "networkidle" });

// Crop to sidebar (1/3 width = 600px)
await page.screenshot({
  path: "docs/stitch/shots/sidebar-closeup.png",
  clip: { x: 0, y: 0, width: 600, height: 1100 },
});

console.log("sidebar-closeup.png saved");
await browser.close();
