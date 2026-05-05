// Insert a new superadmin row by email. Usage: node scripts/add-admin.mjs <email> <name>
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";

const [, , email, ...nameParts] = process.argv;
const name = nameParts.join(" ");
if (!email || !name) {
  console.error("Usage: node scripts/add-admin.mjs <email> <name>");
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
const { data: existing } = await admin.from("admins").select("email, name, role").eq("email", normalized).maybeSingle();
if (existing) {
  console.log(`Already exists:`, existing);
  process.exit(0);
}

const { data, error } = await admin.from("admins").insert({ email: normalized, name, role: "superadmin" }).select().single();
if (error) {
  console.error("FAIL:", error);
  process.exit(1);
}
console.log("Inserted:", data);
