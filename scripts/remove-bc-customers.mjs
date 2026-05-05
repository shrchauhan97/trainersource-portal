// Delete the 3 removed customers from the BigCommerce storefront.
// BC API v3: DELETE /customers?id:in=1,2,3
import { readFile } from "node:fs/promises";

const env = Object.fromEntries(
  (await readFile(".env.production.local", "utf8"))
    .split(/\r?\n/).filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, "").replace(/\\n$/, "")]; })
);

const storeHash = env.BIGCOMMERCE_STORE_HASH;
const token = env.BIGCOMMERCE_ACCESS_TOKEN;
if (!storeHash || !token) { console.error("missing BC creds"); process.exit(1); }

const bcIds = [31, 32, 33];
const base = `https://api.bigcommerce.com/stores/${storeHash}`;

// 1. Confirm they exist before deleting
const getUrl = `${base}/v3/customers?id:in=${bcIds.join(",")}`;
const getRes = await fetch(getUrl, {
  headers: { "X-Auth-Token": token, "Accept": "application/json" },
});
if (!getRes.ok) {
  console.error(`GET failed: ${getRes.status} ${await getRes.text()}`);
  process.exit(1);
}
const getBody = await getRes.json();
console.log(`[preview] matched ${getBody.data.length} customers:`);
for (const c of getBody.data) {
  console.log(`  id=${c.id}  ${c.first_name} ${c.last_name}  ${c.email}`);
}

if (getBody.data.length === 0) {
  console.log("nothing to delete");
  process.exit(0);
}

// 2. Delete
const delUrl = `${base}/v3/customers?id:in=${bcIds.join(",")}`;
const delRes = await fetch(delUrl, {
  method: "DELETE",
  headers: { "X-Auth-Token": token, "Accept": "application/json" },
});
console.log(`\n[delete] status=${delRes.status}`);
if (delRes.status !== 204 && !delRes.ok) {
  console.error(await delRes.text());
  process.exit(1);
}

// 3. Verify
const verifyRes = await fetch(getUrl, {
  headers: { "X-Auth-Token": token, "Accept": "application/json" },
});
const verifyBody = await verifyRes.json();
console.log(`[verify] remaining with those IDs: ${verifyBody.data.length} (expect 0)`);
