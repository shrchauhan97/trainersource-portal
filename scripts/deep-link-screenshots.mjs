import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const OUT_DIR = process.argv[2] ?? path.join(process.cwd(), "..", "docs", "screenshots-2026-04-22", "deep-links");
fs.mkdirSync(OUT_DIR, { recursive: true });

const BASE = "https://trainersource-app.vercel.app";
const TELEGRAM_STUB = `
window.Telegram = {
  WebApp: {
    initData: "",
    initDataUnsafe: { user: { id: 999, first_name: "Preview" } },
    ready: () => {}, expand: () => {}, onEvent: () => {}, offEvent: () => {},
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

const DEEP_LINKS = [
  { path: "/mini/calc", name: "calc-default" },
  { path: "/mini/calc?sku=UP-SEMA&dose=500", name: "calc-sema-500" },
  { path: "/mini/calc?sku=UP-BPC157-TB500&dose=500&water=3", name: "calc-combo-deeplink" },
  { path: "/mini/launcher?app=calc", name: "launcher-redirect-calc" },
  { path: "/mini/launcher?app=reorder", name: "launcher-redirect-reorder" },
  { path: "/mini/launcher?app=unknown", name: "launcher-unknown-coming-soon" },
  { path: "/dashboard", name: "dashboard-anon-redirect" },
  { path: "/admin", name: "admin-anon-redirect" },
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = {};

try {
  for (const r of DEEP_LINKS) {
    const logs = [];
    const page = await ctx.newPage();
    page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
    page.on("console", (m) => { if (m.type() === "error") logs.push(`[console.error] ${m.text()}`); });

    await page.addInitScript(TELEGRAM_STUB);

    let status = "ok";
    try {
      const resp = await page.goto(`${BASE}${r.path}`, { waitUntil: "networkidle", timeout: 15000 });
      status = resp ? `${resp.status()} final=${page.url().replace(BASE, "")}` : "no-response";
    } catch (e) {
      status = `navfail: ${e.message.slice(0, 100)}`;
    }

    const file = path.join(OUT_DIR, `${r.name}.png`);
    try { await page.screenshot({ path: file, fullPage: true }); } catch (_) {}

    errors[r.name] = { status, logs };
    console.log(`${r.path.padEnd(55)} → ${status}${logs.length ? ` (${logs.length} err)` : ""}`);
    await page.close();
  }
} finally {
  await ctx.close();
  await browser.close();
}

fs.writeFileSync(path.join(OUT_DIR, "deep-link-logs.json"), JSON.stringify(errors, null, 2));
const anyError = Object.values(errors).some(({ logs }) => logs.length > 0);
console.log(anyError ? "\nJS errors found — see deep-link-logs.json" : "\nClean.");
