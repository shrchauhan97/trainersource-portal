// Read-only inventory of the BC admin state for ultimate-peptides.com.
// Dumps every surface that's on Tim's checklist + more, into docs/stitch/up-audit/*.json.
import { readFile, writeFile, mkdir } from "node:fs/promises";

const envText = await readFile(".env.local", "utf8");
const env = Object.fromEntries(
  envText.split(/\r?\n/).filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, "")]; })
);
const clean = (v) => (v || "").replace(/\\[rn]/g, "").trim();
const token = clean(env.BIGCOMMERCE_ACCESS_TOKEN);
const storeHash = clean(env.BIGCOMMERCE_STORE_HASH) || "yemcm3khpa";
if (!token || !storeHash) { console.error("missing creds"); process.exit(1); }

const base = `https://api.bigcommerce.com/stores/${storeHash}`;
const h = { "X-Auth-Token": token, Accept: "application/json", "Content-Type": "application/json" };

async function get(path) {
  const url = `${base}${path}`;
  const res = await fetch(url, { headers: h });
  const text = await res.text();
  if (!res.ok) { return { __error: res.status, __body: text.slice(0, 300), __path: path }; }
  try { return JSON.parse(text); } catch { return { __raw: text.slice(0, 200) }; }
}

const OUT = "docs/stitch/up-audit";
await mkdir(OUT, { recursive: true });

const targets = [
  ["store-v2", "/v2/store"],
  ["store-info", "/v3/settings/store/terms-and-conditions"],
  ["products", "/v3/catalog/products?limit=250&include=images,primary_image"],
  ["brands", "/v3/catalog/brands?limit=250"],
  ["categories", "/v3/catalog/categories/tree"],
  ["pages", "/v3/content/pages?limit=250"],
  ["blog-posts", "/v2/blog/posts?limit=250"],
  ["blog-tags", "/v2/blog/tags"],
  ["scripts", "/v3/content/scripts"],
  ["widgets-placements", "/v3/content/placements"],
  ["themes", "/v3/themes"],
  ["webhooks", "/v2/hooks"],
  ["redirects", "/v3/storefront/redirects?limit=250"],
  ["currencies", "/v2/currencies"],
  ["shipping-zones", "/v2/shipping/zones"],
  ["tax-classes", "/v2/tax_classes"],
  ["order-statuses", "/v2/order_statuses"],
];

const summary = {};
for (const [key, path] of targets) {
  const data = await get(path);
  await writeFile(`${OUT}/${key}.json`, JSON.stringify(data, null, 2));
  const count = Array.isArray(data) ? data.length
    : Array.isArray(data?.data) ? data.data.length
    : data?.__error ? `ERR ${data.__error}`
    : typeof data === "object" ? "obj"
    : "?";
  summary[key] = count;
  console.log(`  ${key.padEnd(20)} ${count}`);
}

await writeFile(`${OUT}/_summary.json`, JSON.stringify(summary, null, 2));
console.log("\n✓ done — artifacts in docs/stitch/up-audit/");
