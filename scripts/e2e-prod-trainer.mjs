// E2E prod test — trainer flow
// Seeds a disposable trainer (status=active), runs dashboard walkthrough, cleans up.
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

const BASE = "https://trainersource-app.vercel.app";
const TEST_EMAIL = `e2e-trainer-${Date.now()}@trainersource.local`;
const OUT = "docs/stitch/e2e-prod/trainer";
await mkdir(OUT, { recursive: true });

const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// --- Setup: create auth user + trainer row ---
console.log(`[setup] Creating auth user ${TEST_EMAIL}...`);
const { data: userData, error: userErr } = await admin.auth.admin.createUser({
  email: TEST_EMAIL,
  email_confirm: true,
});
if (userErr) {
  console.error("FAIL createUser:", userErr);
  process.exit(1);
}
const authUserId = userData.user.id;
console.log(`    auth user id: ${authUserId}`);

console.log(`[setup] Inserting trainer row (status=active)...`);
const { data: trainerRow, error: trainerErr } = await admin
  .from("trainers")
  .insert({
    name: "E2E Test Trainer",
    email: TEST_EMAIL,
    country: "Singapore",
    city: "Singapore",
    niche: "HYROX",
    slug: `e2e-trainer-${Date.now()}`,
    tier: "trainer",
    status: "active",
    commission_rate: 0.2,
    reorder_commission_rate: 0.1,
  })
  .select("*")
  .single();
if (trainerErr) {
  console.error("FAIL trainer insert:", trainerErr);
  await admin.auth.admin.deleteUser(authUserId);
  process.exit(1);
}
const trainerId = trainerRow.id;
console.log(`    trainer id: ${trainerId}`);

// Wrap the rest in try/finally for cleanup
let browser;
try {
  // --- Mint magic link + exchange for session ---
  console.log(`[1/4] Minting magic link...`);
  const { data: l } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: TEST_EMAIL,
    options: { redirectTo: `${BASE}/auth/callback` },
  });
  const tokenHash = l.properties.hashed_token;

  const jar = new Map();
  const ssr = createServerClient(env.SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => Array.from(jar.values()),
      setAll: (list) => {
        for (const c of list) jar.set(c.name, c);
      },
    },
  });
  const { error: vErr } = await ssr.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
  if (vErr) throw vErr;
  console.log(`    captured ${jar.size} cookies`);

  // --- Playwright ---
  browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const domain = new URL(BASE).hostname;
  await ctx.addCookies(
    [...jar.values()].map((c) => ({
      name: c.name,
      value: c.value,
      domain,
      path: c.options?.path || "/",
      httpOnly: c.options?.httpOnly ?? false,
      secure: c.options?.secure ?? true,
      sameSite: (c.options?.sameSite || "Lax").replace(/^[a-z]/, (s) => s.toUpperCase()),
      expires: c.options?.maxAge ? Math.floor(Date.now() / 1000) + c.options.maxAge : -1,
    }))
  );
  const page = await ctx.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
  page.on("requestfailed", (r) => {
    const u = r.url();
    if (u.includes("favicon") || u.startsWith("data:") || u.includes("_rsc=")) return;
    failedRequests.push(`${r.method()} ${u} → ${r.failure()?.errorText}`);
  });

  console.log(`[2/4] Loading /dashboard with injected cookies...`);
  const resp = await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle", timeout: 30000 });
  console.log(`    status=${resp.status()} url=${page.url()}`);
  await page.screenshot({ path: `${OUT}/00-dashboard-landing.png`, fullPage: true });
  if (!page.url().includes("/dashboard")) {
    throw new Error(`Not authenticated as trainer; landed on ${page.url()}`);
  }

  const routes = [
    { name: "dash-home", path: "/dashboard" },
    { name: "dash-clients", path: "/dashboard/clients" },
    { name: "dash-codes", path: "/dashboard/codes" },
    { name: "dash-commissions", path: "/dashboard/commissions" },
    { name: "dash-settings", path: "/dashboard/settings" },
  ];
  const results = [];
  console.log(`[3/4] Visiting ${routes.length} trainer routes...`);
  for (const route of routes) {
    const eBefore = consoleErrors.length;
    const pBefore = pageErrors.length;
    const fBefore = failedRequests.length;
    const t0 = Date.now();
    const r = await page.goto(`${BASE}${route.path}`, { waitUntil: "networkidle", timeout: 30000 });
    const loadMs = Date.now() - t0;
    const status = r.status();
    const landed = new URL(page.url()).pathname;
    const h1 = (await page.locator("h1").first().textContent().catch(() => "")) || "";
    const body = await page.evaluate(() => document.body?.innerText || "");
    const bodyErr = /application error|internal server error|something went wrong/i.test(body);
    await page.screenshot({ path: `${OUT}/${route.name}.png`, fullPage: true });
    const nC = consoleErrors.slice(eBefore);
    const nP = pageErrors.slice(pBefore);
    const nF = failedRequests.slice(fBefore);
    results.push({
      route: route.path,
      status,
      landedPath: landed,
      redirectedAway: landed !== route.path,
      loadMs,
      h1: h1.trim().slice(0, 80),
      bodyError: bodyErr,
      consoleErrors: nC,
      pageErrors: nP,
      failedRequests: nF,
    });
    const marks = [];
    if (landed !== route.path) marks.push(`⚠ redir→${landed}`);
    if (bodyErr) marks.push("⚠ body err");
    if (nC.length) marks.push(`⚠ ${nC.length} console`);
    if (nP.length) marks.push(`⚠ ${nP.length} page`);
    if (nF.length) marks.push(`⚠ ${nF.length} failed`);
    console.log(`    ${route.path}: ${status} ${loadMs}ms h1="${h1.trim().slice(0, 40)}" ${marks.join(" ")}`);
  }

  // Summary
  const summary = {
    baseUrl: BASE,
    email: TEST_EMAIL,
    trainerId,
    timestamp: new Date().toISOString(),
    totalConsoleErrors: consoleErrors.length,
    totalPageErrors: pageErrors.length,
    totalFailedRequests: failedRequests.length,
    routes: results,
    allConsoleErrors: consoleErrors,
    allPageErrors: pageErrors,
    allFailedRequests: failedRequests,
  };
  await writeFile(`${OUT}/summary.json`, JSON.stringify(summary, null, 2));

  const issues = results.filter((r) => r.bodyError || r.pageErrors.length || r.redirectedAway || r.status >= 400);
  console.log(`[4/4] Summary`);
  console.log(`    Routes: ${results.length} tested, ${issues.length} with issues`);
  console.log(`    Console errs: ${consoleErrors.length} | Page errs: ${pageErrors.length} | Failed reqs: ${failedRequests.length}`);
  if (issues.length) {
    console.log("\nIssues:");
    for (const r of issues) {
      console.log(`  ${r.route}: status=${r.status} bodyErr=${r.bodyError} redir=${r.redirectedAway}→${r.landedPath}`);
    }
  }
  if (failedRequests.length) {
    console.log("\nFailed requests:");
    for (const f of failedRequests.slice(0, 10)) console.log(`  ${f}`);
  }
  console.log(`\nArtifacts: ${OUT}`);
} finally {
  if (browser) await browser.close();
  // Cleanup
  console.log(`\n[cleanup] Deleting test trainer + auth user...`);
  await admin.from("trainers").delete().eq("id", trainerId);
  await admin.auth.admin.deleteUser(authUserId);
  console.log(`    cleanup ok`);
}
