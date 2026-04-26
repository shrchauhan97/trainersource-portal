import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const OUT_DIR = process.argv[2] ?? path.join(process.cwd(), "..", "docs", "screenshots-2026-04-22");
fs.mkdirSync(OUT_DIR, { recursive: true });

const BASE = "https://trainersource-app.vercel.app";

// Stub window.Telegram so Mini App shells don't hang waiting for initData.
const TELEGRAM_STUB = `
window.Telegram = {
  WebApp: {
    initData: "",
    initDataUnsafe: { user: { id: 999, first_name: "Preview" } },
    ready: () => {},
    expand: () => {},
    onEvent: () => {},
    offEvent: () => {},
    themeParams: { bg_color: "#ffffff", text_color: "#000000" },
    colorScheme: "light",
    MainButton: {
      setText: () => {}, show: () => {}, hide: () => {},
      onClick: () => {}, offClick: () => {}, enable: () => {}, disable: () => {}, setParams: () => {},
    },
    BackButton: { show: () => {}, hide: () => {}, onClick: () => {}, offClick: () => {} },
    HapticFeedback: { impactOccurred: () => {}, notificationOccurred: () => {} },
    close: () => {}, sendData: () => {}, switchInlineQuery: () => {},
    version: "7.0", platform: "web",
  },
};
`;

const VIEWPORTS = [
  { w: 390, h: 844, tag: "mobile" }, // Telegram iOS Mini App default
];

const ROUTES = [
  { path: "/", name: "home-landing" },
  { path: "/login", name: "login" },
  { path: "/apply", name: "apply" },
  { path: "/mini/launcher", name: "mini-launcher", stub: true },
  { path: "/mini/calc", name: "mini-calc", stub: true },
  { path: "/mini/partner", name: "mini-partner", stub: true },
  { path: "/mini/reorder", name: "mini-reorder", stub: true },
];

const browser = await chromium.launch();
const errors = [];
const consoleLogs = {};

try {
  for (const { w, h, tag } of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
    for (const r of ROUTES) {
      const logs = [];
      const page = await ctx.newPage();
      page.on("console", (msg) => {
        if (["error", "warning"].includes(msg.type())) {
          logs.push(`[${msg.type()}] ${msg.text()}`);
        }
      });
      page.on("pageerror", (err) => logs.push(`[pageerror] ${err.message}`));
      page.on("requestfailed", (req) => logs.push(`[reqfail] ${req.url()} — ${req.failure()?.errorText}`));

      if (r.stub) await page.addInitScript(TELEGRAM_STUB);

      let status = "ok";
      try {
        const resp = await page.goto(`${BASE}${r.path}`, { waitUntil: "networkidle", timeout: 20000 });
        status = resp ? `${resp.status()}` : "no-response";
      } catch (e) {
        status = `navfail: ${e.message.slice(0, 120)}`;
      }

      const file = path.join(OUT_DIR, `${r.name}-${tag}.png`);
      try { await page.screenshot({ path: file, fullPage: true }); } catch (_) {}

      consoleLogs[r.name] = { status, logs };
      console.log(`[${tag}] ${r.path.padEnd(20)} → ${status} ${logs.length ? `(${logs.length} console)` : ""}`);
      await page.close();
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}

fs.writeFileSync(path.join(OUT_DIR, "console-logs.json"), JSON.stringify(consoleLogs, null, 2));

const anyError = Object.values(consoleLogs).some(({ logs }) => logs.some((l) => l.startsWith("[pageerror]") || l.startsWith("[reqfail]")));
console.log(anyError ? "\nERRORS detected — see console-logs.json" : "\nClean.");
