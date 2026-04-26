// Retry of v2 with correct BC API shapes:
//   - /v3/settings/store/profile: store_email (not admin_email/order_email)
//   - /v3/settings/store/locale: store_country
//   - Currency: add USD as new default, then disable (not delete) SGD for audit trail
//   - Timezone: NO API — requires BC admin UI (Store Setup -> Store Profile). Flagged.
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
  if (dry && method !== "GET") { console.log(`  DRY ${method} ${path}${body ? ` ${JSON.stringify(body).slice(0,100)}` : ""}`); return { __dry: true }; }
  const res = await fetch(`${base}${path}`, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const txt = await res.text();
  if (!res.ok) { console.log(`  !! ${method} ${path} -> ${res.status} ${txt.slice(0, 240)}`); return { __error: res.status, __body: txt }; }
  try { return txt ? JSON.parse(txt) : { ok: true }; } catch { return { __raw: txt }; }
}

console.log(dry ? "== DRY RUN ==" : "== LIVE ==");

// 1. Profile — unify emails under support@
console.log("\n[1] Store profile");
const profile = await api("GET", "/v3/settings/store/profile");
const newProfile = {
  store_name: profile.data.store_name || "Ultimate Peptides",
  store_address: profile.data.store_address || "",
  store_email: "support@ultimate-peptides.com",
  store_phone: profile.data.store_phone || "",
  store_address_type: profile.data.store_address_type || "Home Office",
};
console.log(`  setting store_email: ${profile.data.store_email} -> ${newProfile.store_email}`);
await api("PUT", "/v3/settings/store/profile", newProfile);

// 2. Locale — country
console.log("\n[2] Locale / country");
const locale = await api("GET", "/v3/settings/store/locale");
console.log(`  store_country: ${locale.data.store_country} -> United States`);
await api("PUT", "/v3/settings/store/locale", {
  default_shopper_language: locale.data.default_shopper_language || "en",
  store_country: "United States",
  shopper_language_selection_method: locale.data.shopper_language_selection_method || "default_shopper_language",
});

// 3. Currency — add USD, make default, demote SGD
console.log("\n[3] Currency USD default");
const currencies = await api("GET", "/v2/currencies");
const list = Array.isArray(currencies) ? currencies : [];
let usd = list.find((c) => c.currency_code === "USD");
const sgd = list.find((c) => c.currency_code === "SGD");
if (!usd) {
  console.log("  creating USD currency");
  const created = await api("POST", "/v2/currencies", {
    name: "US Dollar",
    currency_code: "USD",
    currency_exchange_rate: "1.0000000000",
    token_location: "left",
    token: "$",
    decimal_token: ".",
    thousands_token: ",",
    decimal_places: 2,
    enabled: true,
    is_default: true,
    auto_update: false,
  });
  usd = created;
} else if (!usd.is_default) {
  console.log(`  promoting USD (id ${usd.id}) to default`);
  await api("PUT", `/v2/currencies/${usd.id}`, { is_default: true, enabled: true });
}
if (sgd && !dry) {
  console.log(`  disabling SGD (id ${sgd.id})`);
  await api("PUT", `/v2/currencies/${sgd.id}`, { is_default: false, enabled: false });
}

console.log("\n✓ done — remaining manual step: Timezone (BC admin UI: Store Setup -> Store Profile -> Time Zone: America/Chicago)");
