import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";

const env = Object.fromEntries(
  (await readFile(".env.production.local", "utf8"))
    .split(/\r?\n/).filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, "")]; })
);
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { error, count } = await admin
  .from("admins")
  .delete({ count: "exact" })
  .eq("email", "admin@demo.test");

if (error) { console.error("delete failed:", error); process.exit(1); }
console.log(`deleted admins rows: ${count}`);

const { data } = await admin.from("admins").select("email, role").order("created_at");
console.log("\nremaining admins:");
for (const a of data) console.log(`  ${a.email}  role=${a.role}`);
