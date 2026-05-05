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

const { data } = await admin.from("admins").select("id, email, name, role, created_at").order("created_at");
for (const a of data) console.log(`  ${a.email.padEnd(35)}  role=${a.role.padEnd(12)}  name=${a.name}`);
