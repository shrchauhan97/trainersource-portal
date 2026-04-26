// Finish the remove-customer.mjs run: null out access_codes.consumed_by FK, then delete the 3 customers.
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

const codes = ["ASMEQMJT", "QXGN4W3Q", "R967FPR4"];
const customerIds = [
  "ad958500-4e01-48b6-a1cf-0dd6d34f9a7a",
  "66f1fdc2-48fc-45c8-86c2-5aabaf757b84",
  "155ed71f-70c2-45cf-b527-60a079044985",
];

const { error: nullErr, count: nullCount } = await admin
  .from("access_codes")
  .update({ consumed_by: null, consumed_at: null }, { count: "exact" })
  .in("code", codes);
if (nullErr) { console.error("null consumed_by failed:", nullErr); process.exit(1); }
console.log(`nulled access_codes.consumed_by: ${nullCount}`);

const { error: cErr, count: cCount } = await admin
  .from("customers")
  .delete({ count: "exact" })
  .in("id", customerIds);
if (cErr) { console.error("customers delete failed:", cErr); process.exit(1); }
console.log(`deleted customers rows: ${cCount}`);

// Verify
const { data: remaining } = await admin
  .from("customers")
  .select("id, name, email")
  .in("id", customerIds);
console.log(`\nremaining rows with those IDs: ${remaining.length} (expect 0)`);

const { data: finalCodes } = await admin
  .from("access_codes")
  .select("code, status, consumed_by")
  .in("code", codes);
console.log("\nfinal access_code state:");
for (const c of finalCodes) console.log(`  ${c.code}  status=${c.status}  consumed_by=${c.consumed_by}`);
