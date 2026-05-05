// Verify the +alias trainer login works via admin-API cookie injection.
// Skips email delivery entirely — tests the auth.users + trainers lookup + /dashboard render chain.
import { chromium } from "file:///C:/Users/shrch/.claude/skills/gstack/node_modules/playwright/index.mjs";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { readFile } from "node:fs/promises";

const env = Object.fromEntries(
  (await readFile(".env.local", "utf8")).split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, "")]; })
);

const BASE = "https://trainersource-app.vercel.app";
const EMAIL = "shrchauhan97+trainer@gmail.com";

const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

console.log(`[1/4] Ensure auth user exists, then mint magic link for ${EMAIL}...`);
// admin.generateLink auto-creates but then the token type becomes 'signup' — create explicitly so 'magiclink' works.
const { data: existingUsers } = await admin.auth.admin.listUsers();
const existing = existingUsers.users.find((u) => u.email === EMAIL);
if (!existing) {
  const { error: createErr } = await admin.auth.admin.createUser({ email: EMAIL, email_confirm: true });
  if (createErr && !createErr.message.includes("already been registered")) {
    console.error("FAIL createUser:", createErr);
    process.exit(1);
  }
  console.log(`    created auth user`);
} else {
  console.log(`    auth user already exists (${existing.id})`);
}
const { data: l, error: linkErr } = await admin.auth.admin.generateLink({
  type: "magiclink",
  email: EMAIL,
  options: { redirectTo: `${BASE}/auth/callback` },
});
if (linkErr) {
  console.error("FAIL generateLink:", linkErr);
  process.exit(1);
}
const tokenHash = l.properties.hashed_token;
console.log(`    authUser.id: ${l.user?.id}, email echoed by Supabase: ${l.user?.email}`);

const jar = new Map();
const ssr = createServerClient(env.SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  cookies: {
    getAll: () => Array.from(jar.values()),
    setAll: (list) => { for (const c of list) jar.set(c.name, c); },
  },
});
console.log(`[2/4] verifyOtp...`);
const { data: verifyData, error: vErr } = await ssr.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
if (vErr) { console.error("FAIL verifyOtp:", vErr); process.exit(1); }
console.log(`    session.user.email: ${verifyData.user?.email}  (confirms Supabase did NOT normalize the +alias)`);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const domain = new URL(BASE).hostname;
await ctx.addCookies(
  [...jar.values()].map((c) => ({
    name: c.name, value: c.value, domain, path: c.options?.path || "/",
    httpOnly: c.options?.httpOnly ?? false, secure: c.options?.secure ?? true,
    sameSite: (c.options?.sameSite || "Lax").replace(/^[a-z]/, (s) => s.toUpperCase()),
    expires: c.options?.maxAge ? Math.floor(Date.now() / 1000) + c.options.maxAge : -1,
  }))
);
const page = await ctx.newPage();
const errs = []; page.on("pageerror", (e) => errs.push(e.message));

console.log(`[3/4] Loading /dashboard with injected cookies...`);
const resp = await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle", timeout: 30000 });
const landed = page.url();
const h1 = (await page.locator("h1").first().textContent().catch(() => "")) || "";
console.log(`    status=${resp.status()} url=${landed}`);
console.log(`    h1="${h1.trim()}"`);

if (!landed.includes("/dashboard")) {
  console.error("FAIL — +alias login did not route to trainer dashboard. Landed:", landed);
  process.exit(1);
}
if (!h1.includes("Shaurya (preview)")) {
  console.error("FAIL — /dashboard didn't lookup the +alias trainer. h1:", h1);
  process.exit(1);
}
console.log(`[4/4] VERIFIED — +alias trainer login works end-to-end. Page errors: ${errs.length}`);
await browser.close();
