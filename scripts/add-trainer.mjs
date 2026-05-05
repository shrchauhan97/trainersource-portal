// Insert a trainer row (status=active by default). Idempotent — skips if email already present.
// Usage: node scripts/add-trainer.mjs <email> <name> [--slug=<slug>] [--status=<status>] [--tier=<tier>]
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";

const args = process.argv.slice(2);
const email = args[0];
const name = args[1];
const flags = Object.fromEntries(
  args.slice(2).filter((a) => a.startsWith("--")).map((a) => {
    const [k, ...v] = a.slice(2).split("=");
    return [k, v.join("=") || true];
  })
);
if (!email || !name) {
  console.error("Usage: node scripts/add-trainer.mjs <email> <name> [--slug=<slug>] [--status=<status>] [--tier=<tier>]");
  process.exit(1);
}

const env = Object.fromEntries(
  (await readFile(".env.local", "utf8"))
    .split(/\r?\n/).filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, "")]; })
);
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const normalized = email.trim().toLowerCase();
const { data: existing } = await admin.from("trainers").select("id, email, name, slug, status, tier").eq("email", normalized).maybeSingle();
if (existing) {
  console.log("Already exists:", existing);
  process.exit(0);
}

const slug = flags.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const row = {
  name,
  email: normalized,
  country: "Singapore",
  city: "Singapore",
  niche: "HYROX",
  slug,
  tier: flags.tier || "trainer",
  status: flags.status || "active",
  commission_rate: 0.2,
  reorder_commission_rate: 0.1,
};
const { data, error } = await admin.from("trainers").insert(row).select().single();
if (error) {
  console.error("FAIL trainer insert:", error);
  process.exit(1);
}
console.log("Inserted trainer:", { id: data.id, email: data.email, slug: data.slug, status: data.status });

// Also ensure a Supabase auth user exists so first-time magic-link verification doesn't hit 'otp_expired'
// (admin.generateLink auto-creates with a 'signup' token instead of 'magiclink', which 400s on verifyOtp).
const { data: usersPage } = await admin.auth.admin.listUsers();
const hasAuthUser = usersPage.users.some((u) => u.email === normalized);
if (hasAuthUser) {
  console.log("Auth user already exists");
} else {
  const { error: createErr } = await admin.auth.admin.createUser({ email: normalized, email_confirm: true });
  if (createErr) {
    console.error("FAIL auth createUser:", createErr);
    process.exit(1);
  }
  console.log("Created auth user");
}
