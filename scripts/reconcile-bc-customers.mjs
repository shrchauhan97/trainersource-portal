// Reconcile gate customers that have no BigCommerce account (SHA-21).
//
// The /api/codes/validate route consumes the access code atomically and THEN
// syncs the customer into BigCommerce as a best-effort step. If that sync
// fails on both attempts the customer row is left with
// bigcommerce_customer_id = NULL and the customer cannot check out. The route
// escalates the failure to Sentry; this script is the recovery path — it
// sweeps every stranded row and creates/links the BC account.
//
// Usage:
//   node scripts/reconcile-bc-customers.mjs            # heal all stranded rows
//   node scripts/reconcile-bc-customers.mjs --dry-run  # report only, no writes
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const dryRun = process.argv.includes("--dry-run");

const env = Object.fromEntries(
  (await readFile(".env.local", "utf8")).split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, "")]; })
);

const storeHash = env.BIGCOMMERCE_STORE_HASH;
const accessToken = env.BIGCOMMERCE_ACCESS_TOKEN;
if (!storeHash || !accessToken) {
  console.error("FAIL: BIGCOMMERCE_STORE_HASH / BIGCOMMERCE_ACCESS_TOKEN missing from .env.local");
  process.exit(1);
}
const bcBase = `https://api.bigcommerce.com/stores/${storeHash}/v3`;

const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function bcFetch(path, init) {
  const res = await fetch(`${bcBase}${path}`, {
    ...init,
    headers: {
      "X-Auth-Token": accessToken,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  const payload = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = new Error(payload?.title ?? payload?.detail ?? `BC ${res.status} on ${path}`);
    err.status = res.status;
    throw err;
  }
  return payload;
}

async function getBcCustomerByEmail(email) {
  const payload = await bcFetch(`/customers?email:in=${encodeURIComponent(email)}`, { method: "GET" });
  return payload?.data?.[0] ?? null;
}

// Mirrors src/lib/bigcommerce.ts createBigCommerceCustomer (incl. the SHA-122
// authentication block: account gets a valid credential + forced reset, so
// the storefront "forgot password" flow works on first login).
async function createBcCustomer({ email, firstName, lastName }) {
  try {
    const payload = await bcFetch("/customers", {
      method: "POST",
      body: JSON.stringify([
        {
          email,
          first_name: firstName,
          last_name: lastName,
          authentication: {
            force_password_reset: true,
            new_password: `${randomBytes(24).toString("base64url")}A1!`,
          },
        },
      ]),
    });
    const customer = payload?.data?.[0];
    if (!customer) throw new Error("BC create returned no customer data");
    return { id: customer.id, created: true };
  } catch (err) {
    // 422 duplicate-email → another path created it; link the existing record.
    if (err.status === 422) {
      const existing = await getBcCustomerByEmail(email);
      if (existing) return { id: existing.id, created: false };
    }
    throw err;
  }
}

function splitName(name) {
  const [first, ...rest] = (name ?? "").trim().split(/\s+/);
  return {
    firstName: first || "Customer",
    lastName: rest.join(" ").trim() || first || "Customer",
  };
}

const { data: stranded, error } = await admin
  .from("customers")
  .select("id, email, name, created_at")
  .is("bigcommerce_customer_id", null)
  .order("created_at", { ascending: true });
if (error) {
  console.error("FAIL: could not query customers", error);
  process.exit(1);
}

if (!stranded?.length) {
  console.log("OK: no customers with a missing bigcommerce_customer_id. Nothing to do.");
  process.exit(0);
}

console.log(`Found ${stranded.length} customer(s) without a BigCommerce account${dryRun ? " (dry-run, no writes)" : ""}:`);

let healed = 0;
let failed = 0;
const createdNew = [];

for (const customer of stranded) {
  const email = (customer.email ?? "").trim().toLowerCase();
  if (!email) {
    console.warn(`  SKIP ${customer.id}: no email on row`);
    failed++;
    continue;
  }
  if (dryRun) {
    console.log(`  WOULD RECONCILE ${customer.id} <${email}> (since ${customer.created_at})`);
    continue;
  }
  try {
    const existing = await getBcCustomerByEmail(email);
    const result = existing
      ? { id: existing.id, created: false }
      : await createBcCustomer({ email, ...splitName(customer.name) });

    const { error: updateError } = await admin
      .from("customers")
      .update({ bigcommerce_customer_id: String(result.id) })
      .eq("id", customer.id);
    if (updateError) throw updateError;

    healed++;
    if (result.created) createdNew.push(email);
    console.log(`  HEALED ${customer.id} <${email}> → BC #${result.id}${result.created ? " (created)" : " (linked existing)"}`);
  } catch (err) {
    failed++;
    console.error(`  FAILED ${customer.id} <${email}>:`, err.message ?? err);
  }
}

console.log(`\nDone. healed=${healed} failed=${failed} total=${stranded.length}`);
if (createdNew.length) {
  console.log(
    "\nNewly-created BC accounts (no welcome email was sent by this script —\n" +
    "these customers can use the storefront 'forgot password' flow, or send\n" +
    "them the welcome mail manually):"
  );
  for (const email of createdNew) console.log(`  - ${email}`);
}
process.exit(failed > 0 ? 1 : 0);
