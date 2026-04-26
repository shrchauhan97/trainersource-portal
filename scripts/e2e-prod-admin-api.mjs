// Focused API test: use authenticated cookies to POST /api/admin/codes and confirm a code row is inserted.
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { readFile } from "node:fs/promises";

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
const EMAIL = "shrchauhan97@gmail.com";

const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: l } = await admin.auth.admin.generateLink({
  type: "magiclink",
  email: EMAIL,
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
await ssr.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });

const cookieHeader = [...jar.values()].map((c) => `${c.name}=${c.value}`).join("; ");
console.log(`Authenticated as ${EMAIL}, cookie header: ${cookieHeader.slice(0, 60)}...\n`);

// --- Test 1: count existing founder codes ---
const beforeRes = await fetch(`${BASE}/api/admin/codes?type=founder`, {
  headers: { cookie: cookieHeader },
});
console.log(`GET /api/admin/codes?type=founder → ${beforeRes.status}`);

// --- Test 2: POST to generate a founder code ---
const genRes = await fetch(`${BASE}/api/admin/codes`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    cookie: cookieHeader,
  },
  body: JSON.stringify({ type: "founder", count: 1 }),
});
const genJson = await genRes.json().catch(() => ({ err: "not json" }));
console.log(`POST /api/admin/codes {type:founder,count:1} → ${genRes.status}`);
console.log(`  response:`, JSON.stringify(genJson).slice(0, 300));

// --- Test 3: GET /api/trainers ---
const trainersRes = await fetch(`${BASE}/api/trainers`, {
  headers: { cookie: cookieHeader },
});
const trainersJson = await trainersRes.json().catch(() => ({ err: "not json" }));
console.log(`\nGET /api/trainers → ${trainersRes.status}`);
console.log(`  response preview:`, JSON.stringify(trainersJson).slice(0, 300));

// --- Test 4: GET /api/commissions ---
const commRes = await fetch(`${BASE}/api/commissions`, {
  headers: { cookie: cookieHeader },
});
const commJson = await commRes.json().catch(() => ({ err: "not json" }));
console.log(`\nGET /api/commissions → ${commRes.status}`);
console.log(`  response preview:`, JSON.stringify(commJson).slice(0, 300));

// --- Test 5: GET /api/payouts ---
const payRes = await fetch(`${BASE}/api/payouts`, {
  headers: { cookie: cookieHeader },
});
const payJson = await payRes.json().catch(() => ({ err: "not json" }));
console.log(`\nGET /api/payouts → ${payRes.status}`);
console.log(`  response preview:`, JSON.stringify(payJson).slice(0, 300));

// Clean up — delete the test code we just generated if possible
if (genJson.codes?.length) {
  const code = genJson.codes[0].code;
  const { error } = await admin.from("access_codes").delete().eq("code", code);
  console.log(`\nCleanup — deleted test code ${code}: ${error ? "FAIL " + error.message : "OK"}`);
}
