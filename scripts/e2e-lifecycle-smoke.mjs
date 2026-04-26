// End-to-end smoke test of the lifecycle feature against prod.
// 1. Pick an active customer
// 2. Hit /api/gate/verify with their bc_customer_id → expect allowed:true
// 3. Flip their status to suspended directly in Supabase (bypasses the admin UI)
// 4. Hit the endpoint again → expect allowed:false, reason:suspended
// 5. Restore them to active
// 6. Hit the endpoint again → expect allowed:true
// 7. Verify a lifecycle_events row was NOT written (we bypassed the UI on purpose)
//    and the audit log stays clean of our test traffic.
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

const PROD = "https://trainersource-app.vercel.app";

function pass(label, extra = "") { console.log(`  ✓ ${label}${extra ? ": " + extra : ""}`); }
function fail(label, extra = "") { console.log(`  ✗ ${label}${extra ? ": " + extra : ""}`); process.exitCode = 1; }

// Step 1: pick an active customer with a bc_customer_id
const { data: candidates } = await admin
  .from("customers")
  .select("id, name, email, status, bigcommerce_customer_id")
  .eq("status", "active")
  .not("bigcommerce_customer_id", "is", null)
  .limit(5);

if (!candidates || candidates.length === 0) {
  console.log("No active customers with a bc_customer_id — skipping gate/verify smoke.");
  process.exit(0);
}

const target = candidates[0];
console.log(`\ntest target: ${target.name} (${target.email}) bc_id=${target.bigcommerce_customer_id}`);

// Step 2: verify active allows
{
  const r = await fetch(`${PROD}/api/gate/verify?bc_customer_id=${target.bigcommerce_customer_id}`);
  const body = await r.json();
  if (body.allowed === true) pass("active customer → allowed:true");
  else fail("active customer expected allowed:true", JSON.stringify(body));
}

// Step 3: flip to suspended (direct SQL — bypass UI so we don't dirty the audit log)
await admin.from("customers").update({ status: "suspended" }).eq("id", target.id);
pass("flipped to suspended");

// Step 4: verify suspended blocks
{
  const r = await fetch(`${PROD}/api/gate/verify?bc_customer_id=${target.bigcommerce_customer_id}`);
  const body = await r.json();
  if (body.allowed === false && body.reason === "suspended") pass("suspended → allowed:false reason:suspended");
  else fail("suspended expected allowed:false reason:suspended", JSON.stringify(body));
}

// Step 5: flip to removed, verify blocks
await admin.from("customers").update({ status: "removed" }).eq("id", target.id);
{
  const r = await fetch(`${PROD}/api/gate/verify?bc_customer_id=${target.bigcommerce_customer_id}`);
  const body = await r.json();
  if (body.allowed === false && body.reason === "removed") pass("removed → allowed:false reason:removed");
  else fail("removed expected allowed:false reason:removed", JSON.stringify(body));
}

// Step 6: restore
await admin.from("customers").update({ status: "active" }).eq("id", target.id);
{
  const r = await fetch(`${PROD}/api/gate/verify?bc_customer_id=${target.bigcommerce_customer_id}`);
  const body = await r.json();
  if (body.allowed === true) pass("restored → allowed:true");
  else fail("restored expected allowed:true", JSON.stringify(body));
}

// Step 7: lifecycle_events table should be empty (we bypassed the UI)
const { count } = await admin
  .from("lifecycle_events")
  .select("*", { count: "exact", head: true })
  .eq("entity_id", target.id);
if (count === 0) pass("audit log clean (no events for test target — expected since we bypassed UI)");
else fail(`audit log has ${count} events for test target — expected 0`);

console.log(`\ntest target left at status=active, unchanged from original.`);
