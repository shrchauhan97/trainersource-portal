// Generate a trainer-attributed access code for a specified trainer email.
// Usage: node scripts/gen-trainer-code.mjs <trainer_email> [--expires-days=7]
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";

const args = process.argv.slice(2);
const email = args[0];
if (!email) {
  console.error("Usage: node scripts/gen-trainer-code.mjs <trainer_email> [--expires-days=7]");
  process.exit(1);
}
const flags = Object.fromEntries(
  args.slice(1).filter((a) => a.startsWith("--")).map((a) => {
    const [k, ...v] = a.slice(2).split("=");
    return [k, v.join("=") || true];
  })
);
const expiresDays = Number(flags["expires-days"] || 7);

const env = Object.fromEntries(
  (await readFile(".env.local", "utf8")).split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, "")]; })
);
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: trainer, error: tErr } = await admin.from("trainers").select("id, name, email, status").eq("email", email.trim().toLowerCase()).maybeSingle();
if (tErr || !trainer) {
  console.error(`FAIL: trainer not found for ${email}`, tErr);
  process.exit(1);
}
if (trainer.status !== "active") {
  console.error(`FAIL: trainer ${email} status=${trainer.status}, must be 'active' to generate codes`);
  process.exit(1);
}

// Generate 8-char code, Crockford base32 subset (no confusing chars)
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const code = Array.from({ length: 8 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
const expiresAt = new Date(Date.now() + expiresDays * 86400000).toISOString();

const { error } = await admin.from("access_codes").insert({
  code,
  type: "trainer",
  trainer_id: trainer.id,
  status: "active",
  expires_at: expiresAt,
}).select().single();
if (error) { console.error("FAIL:", error); process.exit(1); }

console.log(`Code: ${code}`);
console.log(`Attributed to: ${trainer.name} (${trainer.email})`);
console.log(`Expires: ${expiresAt}`);
