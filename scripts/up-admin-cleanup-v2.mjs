// Second-pass cleanup per Shaurya 2026-04-20:
//   1. Flip store to US / USD / America/Chicago timezone.
//   2. Unify admin_email + order_email under support@ultimate-peptides.com.
//   3. Unhide all hidden products (show full catalog).
//   4. Patch price-filter script to stop rendering "$ NaN" and stop auto-filling the min field.
import { readFile } from "node:fs/promises";

const envText = await readFile(".env.local", "utf8");
const env = Object.fromEntries(
  envText.split(/\r?\n/).filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, "")]; })
);
const clean = (v) => (v || "").replace(/\\[rn]/g, "").trim();
const token = clean(env.BIGCOMMERCE_ACCESS_TOKEN);
const storeHash = clean(env.BIGCOMMERCE_STORE_HASH) || "yemcm3khpa";
const dry = process.argv.includes("--dry");
const base = `https://api.bigcommerce.com/stores/${storeHash}`;
const h = { "X-Auth-Token": token, Accept: "application/json", "Content-Type": "application/json" };

async function api(method, path, body) {
  if (dry && method !== "GET") { console.log(`  DRY ${method} ${path}`); return { __dry: true }; }
  const res = await fetch(`${base}${path}`, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const txt = await res.text();
  if (!res.ok) { console.log(`  !! ${method} ${path} -> ${res.status} ${txt.slice(0, 240)}`); return { __error: res.status }; }
  try { return txt ? JSON.parse(txt) : { ok: true }; } catch { return { __raw: txt }; }
}

console.log(dry ? "== DRY RUN ==" : "== LIVE ==");

// 1. Store settings (admin email, order email) and 2. currency — via /v3/settings/*
// BigCommerce's store-level settings live across a few endpoints:
//   PUT /v3/settings/store/profile  -> admin/order emails, store country, timezone
//   PUT /v2/currencies/{id}         -> currency code/symbol/default
console.log("\n[1] Store profile (emails + country + timezone)");
const profileBody = {
  store_name: "Ultimate Peptides",
  admin_email: "support@ultimate-peptides.com",
  order_email: "support@ultimate-peptides.com",
  address: "",
  country_code: "US",
  country_name: "United States",
};
await api("PUT", "/v3/settings/store/profile", profileBody);
// Timezone is a separate endpoint
console.log("\n[1a] Store locale (timezone)");
await api("PUT", "/v3/settings/store/locale", { timezone: { name: "America/Chicago" } });

console.log("\n[2] Currency: SGD -> USD");
const currencies = await api("GET", "/v2/currencies");
const sgd = (Array.isArray(currencies) ? currencies : []).find((c) => c.currency_code === "SGD" || c.is_default);
if (sgd) {
  console.log(`  patching currency id ${sgd.id} (${sgd.currency_code} -> USD)`);
  await api("PUT", `/v2/currencies/${sgd.id}`, {
    name: "US Dollar",
    currency_code: "USD",
    currency_exchange_rate: "1.0000000000",
    token: "$",
    decimal_token: ".",
    thousands_token: ",",
    decimal_places: 2,
    enabled: true,
    is_default: true,
    auto_update: false,
  });
} else {
  console.log("  no SGD found — skipping");
}

// 3. Unhide all hidden products
console.log("\n[3] Unhide hidden products");
const prods = await api("GET", "/v3/catalog/products?limit=250");
const hidden = (prods.data || []).filter((p) => !p.is_visible);
console.log(`  found ${hidden.length} hidden products`);
for (const p of hidden) {
  console.log(`  unhiding ${p.sku} (${p.name})`);
  await api("PUT", `/v3/catalog/products/${p.id}`, { is_visible: true });
}

// 4. Patch Product Card Sizing script — guard NaN, stop auto-filling min
console.log("\n[4] Patch price-filter NaN bug");
const scripts = await api("GET", "/v3/content/scripts");
const card = (scripts.data || []).find((s) => s.name === "Product Card Sizing");
if (card && card.html) {
  // Original pattern:
  //   if(minI&&!minI.value){minI.placeholder='$ '+mn+'.00';minI.value=mn}if(maxI&&!maxI.value){maxI.placeholder='$ '+mx+'.00';maxI.value=mx}
  // We want:
  //   if(isFinite(mn)&&isFinite(mx)&&mx>mn){if(minI)minI.placeholder='$ '+mn;if(maxI)maxI.placeholder='$ '+mx}
  const oldBlock = "if(minI&&!minI.value){minI.placeholder='$ '+mn+'.00';minI.value=mn}if(maxI&&!maxI.value){maxI.placeholder='$ '+mx+'.00';maxI.value=mx}";
  const newBlock = "if(isFinite(mn)&&isFinite(mx)&&mx>mn){if(minI)minI.placeholder='$ '+mn;if(maxI)maxI.placeholder='$ '+mx}";
  if (!card.html.includes(oldBlock)) {
    console.log("  WARN — original block not found verbatim; skipping patch (manual review)");
  } else {
    const fixed = card.html.replace(oldBlock, newBlock);
    console.log(`  patching Product Card Sizing (${card.html.length} -> ${fixed.length})`);
    await api("PUT", `/v3/content/scripts/${card.uuid}`, { html: fixed });
  }
} else {
  console.log("  no Product Card Sizing script found");
}

console.log("\n✓ done");
