// E2E prod test — admin flow
// Flow: admin.generateLink → hashed_token → verifyOtp (via @supabase/ssr with cookie capture) → inject cookies into Playwright → drive admin routes.
import { chromium } from "file:///C:/Users/shrch/.claude/skills/gstack/node_modules/playwright/index.mjs";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const envText = await readFile(".env.local", "utf8");
const env = Object.fromEntries(
  envText
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, "")];
    })
);

const BASE = process.env.E2E_URL || "https://trainersource-app.vercel.app";
const ADMIN_EMAIL = process.env.E2E_EMAIL || "shrchauhan97@gmail.com";
const LABEL = process.env.E2E_LABEL || "admin";
const OUT = `docs/stitch/e2e-prod/${LABEL}`;
await mkdir(OUT, { recursive: true });

// --- Step 1: admin mints a magic link and we grab the raw hashed_token ---
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
console.log(`[1/7] Minting magic link for ${ADMIN_EMAIL}...`);
const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
  type: "magiclink",
  email: ADMIN_EMAIL,
  options: { redirectTo: `${BASE}/auth/callback` },
});
if (linkErr) {
  console.error("FAIL generateLink:", linkErr);
  process.exit(1);
}
const tokenHash = linkData?.properties?.hashed_token;
if (!tokenHash) {
  console.error("FAIL no hashed_token in:", Object.keys(linkData?.properties || {}));
  process.exit(1);
}
console.log(`    hashed_token: ${tokenHash.slice(0, 24)}...`);

// --- Step 2: use @supabase/ssr with a Map-backed cookie store to verifyOtp; capture cookies ---
const cookieJar = new Map();
const ssr = createServerClient(env.SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  cookies: {
    getAll() {
      return Array.from(cookieJar.values());
    },
    setAll(list) {
      for (const c of list) cookieJar.set(c.name, c);
    },
  },
});
console.log(`[2/7] Exchanging token_hash for session via verifyOtp...`);
const { data: verifyData, error: verifyErr } = await ssr.auth.verifyOtp({
  token_hash: tokenHash,
  type: "magiclink",
});
if (verifyErr) {
  console.error("FAIL verifyOtp:", verifyErr);
  process.exit(1);
}
console.log(`    session.user.email: ${verifyData.user?.email}`);
console.log(`    captured ${cookieJar.size} auth cookies: ${[...cookieJar.keys()].join(", ")}`);

// --- Step 3: spin Playwright and inject cookies ---
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });

const domain = new URL(BASE).hostname;
const playwrightCookies = [...cookieJar.values()].map((c) => ({
  name: c.name,
  value: c.value,
  domain,
  path: c.options?.path || "/",
  httpOnly: c.options?.httpOnly ?? false,
  secure: c.options?.secure ?? true,
  sameSite: (c.options?.sameSite || "Lax").replace(/^[a-z]/, (s) => s.toUpperCase()),
  expires: c.options?.maxAge ? Math.floor(Date.now() / 1000) + c.options.maxAge : -1,
}));
await ctx.addCookies(playwrightCookies);

const page = await ctx.newPage();
const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];
page.on("pageerror", (e) => pageErrors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text());
});
page.on("requestfailed", (r) => {
  const url = r.url();
  if (url.includes("favicon") || url.startsWith("data:")) return;
  failedRequests.push(`${r.method()} ${url} → ${r.failure()?.errorText}`);
});

console.log(`[3/7] Loading /admin with injected cookies...`);
const resp = await page.goto(`${BASE}/admin`, { waitUntil: "networkidle", timeout: 30000 });
const landedUrl = page.url();
console.log(`    status=${resp.status()} url=${landedUrl}`);
await page.screenshot({ path: `${OUT}/00-admin-landing.png`, fullPage: true });

if (!landedUrl.includes("/admin")) {
  console.error("FAIL — cookie injection did not authenticate. Landed:", landedUrl);
  const h1 = await page.locator("h1").first().textContent().catch(() => "");
  console.error("    h1 on landed page:", h1);
  // Dump cookies sent by server response
  await browser.close();
  process.exit(1);
}

// --- Step 4: visit admin routes ---
const adminRoutes = [
  { name: "admin-home", path: "/admin" },
  { name: "admin-trainers", path: "/admin/trainers" },
  { name: "admin-codes", path: "/admin/codes" },
  { name: "admin-commissions", path: "/admin/commissions" },
  { name: "admin-orders", path: "/admin/orders" },
  { name: "admin-payouts", path: "/admin/payouts" },
];
const results = [];
console.log(`[4/7] Visiting ${adminRoutes.length} admin routes...`);
for (const route of adminRoutes) {
  const errsBefore = consoleErrors.length;
  const pageErrsBefore = pageErrors.length;
  const failsBefore = failedRequests.length;
  const t0 = Date.now();
  const r = await page.goto(`${BASE}${route.path}`, { waitUntil: "networkidle", timeout: 30000 });
  const loadMs = Date.now() - t0;
  const status = r.status();
  const landed = page.url();
  const h1 = (await page.locator("h1").first().textContent().catch(() => "")) || "";
  const bodyText = await page.evaluate(() => document.body?.innerText || "");
  const bodyHasError = /application error|internal server error|something went wrong/i.test(bodyText);
  await page.screenshot({ path: `${OUT}/${route.name}.png`, fullPage: true });

  const newConsole = consoleErrors.slice(errsBefore);
  const newPage = pageErrors.slice(pageErrsBefore);
  const newFails = failedRequests.slice(failsBefore);
  const pathMatch = new URL(landed).pathname === route.path;

  results.push({
    route: route.path,
    status,
    landedPath: new URL(landed).pathname,
    redirectedAway: !pathMatch,
    loadMs,
    h1: h1.trim().slice(0, 100),
    bodyError: bodyHasError,
    consoleErrors: newConsole,
    pageErrors: newPage,
    failedRequests: newFails,
  });
  const marks = [];
  if (!pathMatch) marks.push(`⚠ redir→${new URL(landed).pathname}`);
  if (bodyHasError) marks.push("⚠ body err");
  if (newConsole.length) marks.push(`⚠ ${newConsole.length} console`);
  if (newPage.length) marks.push(`⚠ ${newPage.length} page`);
  if (newFails.length) marks.push(`⚠ ${newFails.length} failed`);
  console.log(`    ${route.path}: ${status} ${loadMs}ms h1="${h1.trim().slice(0, 40)}" ${marks.join(" ")}`);
}

// --- Step 5: Test an admin action — generate a code ---
console.log(`[5/7] Testing admin action — generate a code on /admin/codes...`);
await page.goto(`${BASE}/admin/codes`, { waitUntil: "networkidle" });
const buttons = await page.locator("button").allTextContents();
const genLabels = buttons.filter((b) => /generate|create|new|add/i.test(b));
let codeAction = { buttonsFound: buttons.length, genButtonLabels: genLabels, attempted: false };
if (genLabels.length) {
  try {
    const btn = page.locator(`button:has-text("${genLabels[0]}")`).first();
    const textBefore = await page.locator("tbody").textContent().catch(() => "");
    await btn.click();
    await page.waitForTimeout(2500);
    const textAfter = await page.locator("tbody").textContent().catch(() => "");
    codeAction.attempted = true;
    codeAction.clickedLabel = genLabels[0];
    codeAction.tableChanged = textBefore !== textAfter;
    codeAction.bodyAfter = (await page.evaluate(() => document.body?.innerText || "")).slice(0, 300);
    await page.screenshot({ path: `${OUT}/codes-after-generate.png`, fullPage: true });
  } catch (e) {
    codeAction.clickError = e.message;
  }
}

// --- Step 6: API probe ---
console.log(`[6/7] Probing /api/session/check and /api/trainers...`);
const sessCheck = await page.request.get(`${BASE}/api/session/check`);
const trainersApi = await page.request.get(`${BASE}/api/trainers`);

// --- Step 7: Summary ---
const summary = {
  baseUrl: BASE,
  email: ADMIN_EMAIL,
  label: LABEL,
  timestamp: new Date().toISOString(),
  totalConsoleErrors: consoleErrors.length,
  totalPageErrors: pageErrors.length,
  totalFailedRequests: failedRequests.length,
  routes: results,
  apiProbe: {
    sessionCheck: sessCheck.status(),
    trainersApi: trainersApi.status(),
  },
  codeAction,
  allConsoleErrors: consoleErrors,
  allPageErrors: pageErrors,
  allFailedRequests: failedRequests,
};
await writeFile(`${OUT}/summary.json`, JSON.stringify(summary, null, 2));

const issues = results.filter(
  (r) => r.bodyError || r.pageErrors.length || r.redirectedAway || r.status >= 400
);
console.log("\n=== SUMMARY ===");
console.log(`Routes: ${results.length} tested, ${issues.length} with issues`);
console.log(`Console errors: ${consoleErrors.length} | Page errors: ${pageErrors.length} | Failed reqs: ${failedRequests.length}`);
console.log(`Session check HTTP ${sessCheck.status()}, /api/trainers HTTP ${trainersApi.status()}`);
if (codeAction.attempted) console.log(`Code gen action: clicked "${codeAction.clickedLabel}" — table changed: ${codeAction.tableChanged}`);
if (issues.length) {
  console.log("\nIssues:");
  for (const r of issues) {
    console.log(`  ${r.route}: status=${r.status} bodyErr=${r.bodyError} redir=${r.redirectedAway}→${r.landedPath}`);
  }
}
console.log(`\nArtifacts: ${OUT}`);

await browser.close();
