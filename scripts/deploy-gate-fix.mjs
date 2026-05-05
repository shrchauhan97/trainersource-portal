// PUT the fixed access gate script to BC (idempotent — replaces in place).
import { readFile } from "node:fs/promises";

const envText = await readFile(".env.prod.tmp", "utf8");
const env = Object.fromEntries(
  envText.split(/\r?\n/).filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, "")]; })
);

// Strip literal \n / \r sequences that vercel env pull embeds in values on Windows.
const clean = (v) => (v || "").replace(/\\[rn]/g, "").trim();
const token = clean(env.BIGCOMMERCE_ACCESS_TOKEN);
const storeHash = clean(env.BIGCOMMERCE_STORE_HASH) || "yemcm3khpa";
const scriptUuid = "a66be762-eac6-4ed9-a09d-60399e0462d2";

if (!token) { console.error("FAIL — no BIGCOMMERCE_ACCESS_TOKEN"); process.exit(1); }

const html = await readFile("../ultimate-peptides/BC-PASTE-THIS.html", "utf8");
console.log(`HTML size: ${html.length} chars`);

// Confirm the fix is present before deploying
if (!html.includes(`'Country', input: select }).wrapper`)) {
  console.error("FAIL — fix not found in HTML source. Expected '.wrapper' on Country buildField call.");
  process.exit(1);
}
console.log("Fix verified in source ✓");

const url = `https://api.bigcommerce.com/stores/${storeHash}/v3/content/scripts/${scriptUuid}`;
console.log(`PUT ${url}`);
const res = await fetch(url, {
  method: "PUT",
  headers: { "X-Auth-Token": token, "Content-Type": "application/json", Accept: "application/json" },
  body: JSON.stringify({ html }),
});
console.log(`HTTP ${res.status}`);
const body = await res.text();
if (!res.ok) {
  console.error("Body:", body.slice(0, 600));
  process.exit(1);
}
const parsed = JSON.parse(body);
console.log("Updated script:", {
  uuid: parsed.data?.uuid,
  name: parsed.data?.name,
  enabled: parsed.data?.enabled,
  location: parsed.data?.location,
  updated_at: parsed.data?.date_modified,
});
