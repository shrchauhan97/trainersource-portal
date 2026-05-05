// Removes customers fully: customer row + bc_customer_link + bot_user_acknowledgment + expires access_code.
// Does NOT touch BigCommerce storefront account (do that in the BC admin separately).
// Usage:
//   node scripts/remove-customer.mjs --codes=ASMEQMJT,QXGN4W3Q,R967FPR4           (dry-run, default)
//   node scripts/remove-customer.mjs --codes=ASMEQMJT,QXGN4W3Q,R967FPR4 --execute (actually deletes)
//   node scripts/remove-customer.mjs --env=.env.production.local --codes=...
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";

const args = Object.fromEntries(
  process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => {
    const [k, ...v] = a.slice(2).split("=");
    return [k, v.join("=") || true];
  })
);

const envFile = args.env || ".env.production.local";
const codes = (args.codes || "").split(",").map((c) => c.trim()).filter(Boolean);
const execute = args.execute === true;

if (codes.length === 0) {
  console.error("Usage: node scripts/remove-customer.mjs --codes=CODE1,CODE2 [--execute] [--env=<path>]");
  process.exit(1);
}

const env = Object.fromEntries(
  (await readFile(envFile, "utf8"))
    .split(/\r?\n/).filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, "")]; })
);

const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

console.log(`\n[env] ${envFile} → ${env.SUPABASE_URL}`);
console.log(`[mode] ${execute ? "EXECUTE (destructive)" : "DRY-RUN (no changes)"}`);
console.log(`[codes] ${codes.join(", ")}\n`);

// 1. Look up the access codes and their consumed customers
const { data: codeRows, error: codeErr } = await admin
  .from("access_codes")
  .select("id, code, status, trainer_id, consumed_by")
  .in("code", codes);

if (codeErr) { console.error("access_codes lookup failed:", codeErr); process.exit(1); }

if (codeRows.length === 0) {
  console.error("No matching access codes found. Check the codes and Supabase project.");
  process.exit(1);
}

const customerIds = codeRows.map((r) => r.consumed_by).filter(Boolean);

// 2. Get full customer details
const { data: customers, error: custErr } = await admin
  .from("customers")
  .select("id, name, email, bigcommerce_customer_id, trainer_id, access_code_id, created_at")
  .in("id", customerIds);

if (custErr) { console.error("customers lookup failed:", custErr); process.exit(1); }

// 3. Check for order dependencies (FK-blocking)
const { data: orders, error: ordErr } = await admin
  .from("orders")
  .select("id, customer_id, bigcommerce_order_id, total, status, placed_at")
  .in("customer_id", customerIds);

if (ordErr) { console.error("orders lookup failed:", ordErr); process.exit(1); }

// 4. Check bc_customer_links (needs bigcommerce_customer_id, which is TEXT in customers but BIGINT in bc_customer_links)
const bcIds = customers.map((c) => c.bigcommerce_customer_id).filter(Boolean).map((s) => Number(s)).filter((n) => !Number.isNaN(n));
let bcLinks = [];
if (bcIds.length > 0) {
  const { data, error } = await admin
    .from("bc_customer_links")
    .select("telegram_user_id, bc_customer_id, linked_at")
    .in("bc_customer_id", bcIds);
  if (error) { console.error("bc_customer_links lookup failed:", error); process.exit(1); }
  bcLinks = data || [];
}

// 5. Check bot_user_acknowledgments for any linked telegram_user_ids
const tgIds = bcLinks.map((l) => l.telegram_user_id);
let acks = [];
if (tgIds.length > 0) {
  const { data, error } = await admin
    .from("bot_user_acknowledgments")
    .select("telegram_user_id, acknowledgment_version, acknowledged_at")
    .in("telegram_user_id", tgIds);
  if (error) { console.error("bot_user_acknowledgments lookup failed:", error); process.exit(1); }
  acks = data || [];
}

// Report
console.log("=== PREVIEW ===");
console.log(`access_codes matched: ${codeRows.length}`);
for (const r of codeRows) console.log(`  ${r.code}  status=${r.status}  consumed_by=${r.consumed_by}`);
console.log(`\ncustomers matched: ${customers.length}`);
for (const c of customers) console.log(`  ${c.id}  ${c.name}  ${c.email}  bc_id=${c.bigcommerce_customer_id}`);
console.log(`\norders on these customers: ${orders.length}`);
for (const o of orders) console.log(`  order ${o.bigcommerce_order_id}  cust=${o.customer_id}  total=${o.total}  status=${o.status}`);
console.log(`\nbc_customer_links: ${bcLinks.length}`);
for (const l of bcLinks) console.log(`  tg=${l.telegram_user_id}  bc=${l.bc_customer_id}`);
console.log(`\nbot_user_acknowledgments: ${acks.length}`);
for (const a of acks) console.log(`  tg=${a.telegram_user_id}  v=${a.acknowledgment_version}`);

if (!execute) {
  console.log("\n[dry-run] No changes made. Re-run with --execute to apply.");
  process.exit(0);
}

// Block destructive delete if there are orders — we refuse to break financial history.
if (orders.length > 0) {
  console.error(`\n[abort] ${orders.length} order(s) reference these customers. Hard-delete would break financial history. Use a soft-delete path instead.`);
  process.exit(2);
}

// Execute deletions in dependency order
console.log("\n=== EXECUTING ===");

// a. bot_user_acknowledgments (independent PK on tg user id)
if (tgIds.length > 0) {
  const { error, count } = await admin
    .from("bot_user_acknowledgments")
    .delete({ count: "exact" })
    .in("telegram_user_id", tgIds);
  if (error) { console.error("ack delete failed:", error); process.exit(1); }
  console.log(`deleted bot_user_acknowledgments rows: ${count}`);
}

// b. bc_customer_links
if (tgIds.length > 0) {
  const { error, count } = await admin
    .from("bc_customer_links")
    .delete({ count: "exact" })
    .in("telegram_user_id", tgIds);
  if (error) { console.error("bc_customer_links delete failed:", error); process.exit(1); }
  console.log(`deleted bc_customer_links rows: ${count}`);
}

// c. Expire the access codes so they can't be replayed
const { error: acErr, count: acCount } = await admin
  .from("access_codes")
  .update({ status: "expired" }, { count: "exact" })
  .in("code", codes);
if (acErr) { console.error("access_codes expire failed:", acErr); process.exit(1); }
console.log(`expired access_codes rows: ${acCount}`);

// d. Finally delete customers
const { error: cErr, count: cCount } = await admin
  .from("customers")
  .delete({ count: "exact" })
  .in("id", customerIds);
if (cErr) { console.error("customers delete failed:", cErr); process.exit(1); }
console.log(`deleted customers rows: ${cCount}`);

console.log("\n=== DONE ===");
console.log("Reminder: these customers may still have BigCommerce storefront accounts.");
console.log("Delete them in BC admin: Store → Customers → search by email → Delete.");
