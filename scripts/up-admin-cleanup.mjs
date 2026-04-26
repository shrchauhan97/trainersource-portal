// Executes the safe tier-1 cleanup of the ultimate-peptides BC admin:
//   1. Delete 2 of 3 duplicate "Batch 5 Page Styles" scripts (keep the modified one).
//   2. Update remaining Batch 5 script: support@powerpepgroup.com -> support@ultimate-peptides.com.
//   3. Delete 3 placeholder brands (Sagaform, OFS, Common Good) — already confirmed 0 products reference them.
//   4. Delete default blog post "Your first blog post!".
//   5. Generate + apply SEO metadata (page_title, meta_description) for all 18 products.
//
// Every operation is idempotent: re-running after a partial failure only touches the still-dirty items.
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
  // GETs always run; mutations honour dry mode.
  if (dry && method !== "GET") { console.log(`  DRY ${method} ${path}${body ? " (with body)" : ""}`); return { __dry: true }; }
  const res = await fetch(`${base}${path}`, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const txt = await res.text();
  if (!res.ok) { console.log(`  !! ${method} ${path} -> ${res.status} ${txt.slice(0, 160)}`); return { __error: res.status, __body: txt }; }
  try { return txt ? JSON.parse(txt) : { ok: true }; } catch { return { __raw: txt }; }
}

console.log(dry ? "== DRY RUN ==" : "== LIVE ==");

// 1 + 2. Scripts
console.log("\n[1-2] Batch 5 Page Styles scripts");
const scripts = await api("GET", "/v3/content/scripts");
const batch5 = scripts.data.filter((s) => s.name === "Batch 5 Page Styles");
console.log(`  found ${batch5.length} Batch 5 scripts`);
if (batch5.length >= 2) {
  // Keep the one with the latest date_modified (or largest html if tied)
  batch5.sort((a, b) => {
    const dm = new Date(b.date_modified) - new Date(a.date_modified);
    return dm !== 0 ? dm : (b.html?.length || 0) - (a.html?.length || 0);
  });
  const keep = batch5[0];
  const drop = batch5.slice(1);
  console.log(`  keeping: ${keep.uuid} (modified ${keep.date_modified}, ${keep.html.length} chars)`);
  for (const s of drop) {
    console.log(`  deleting dup: ${s.uuid} (modified ${s.date_modified})`);
    await api("DELETE", `/v3/content/scripts/${s.uuid}`);
  }
  // Patch the kept one: powerpep -> ultimate-peptides
  if (keep.html && keep.html.includes("powerpepgroup")) {
    const fixedHtml = keep.html.replaceAll("support@powerpepgroup.com", "support@ultimate-peptides.com");
    console.log(`  patching kept script: ${(keep.html.length)} -> ${fixedHtml.length} chars (powerpep -> ultimate-peptides)`);
    await api("PUT", `/v3/content/scripts/${keep.uuid}`, { html: fixedHtml });
  } else {
    console.log("  kept script has no powerpep references — skipping patch");
  }
} else if (batch5.length === 1 && batch5[0].html.includes("powerpepgroup")) {
  const fixedHtml = batch5[0].html.replaceAll("support@powerpepgroup.com", "support@ultimate-peptides.com");
  console.log(`  patching single Batch 5: powerpep -> ultimate-peptides`);
  await api("PUT", `/v3/content/scripts/${batch5[0].uuid}`, { html: fixedHtml });
}

// 3. Brands
console.log("\n[3] Placeholder brands");
const brands = await api("GET", "/v3/catalog/brands?limit=250");
const placeholders = (brands.data || []).filter((b) => ["Sagaform", "OFS", "Common Good"].includes(b.name));
console.log(`  found ${placeholders.length} placeholder brands`);
for (const b of placeholders) {
  console.log(`  deleting brand ${b.id} (${b.name})`);
  await api("DELETE", `/v3/catalog/brands/${b.id}`);
}

// 4. Default blog post
console.log("\n[4] Default blog post");
const posts = await api("GET", "/v2/blog/posts?limit=250");
const defaults = (Array.isArray(posts) ? posts : []).filter((p) => p.title === "Your first blog post!");
console.log(`  found ${defaults.length} default blog post(s)`);
for (const p of defaults) {
  console.log(`  deleting blog post ${p.id} (${p.title})`);
  await api("DELETE", `/v2/blog/posts/${p.id}`);
}

// 5. Product SEO metadata
console.log("\n[5] Product SEO metadata");
const products = await api("GET", "/v3/catalog/products?limit=250");
// Keywords that qualify each product for a research-lit voice.
const template = (p) => {
  const name = p.name;
  const price = p.price ? `USD $${p.price}` : "";
  const page_title = `${name} — Research Peptide | Ultimate Peptides`;
  const meta_description = `${name} for research use only. ${price ? price + "." : ""} Third-party purity-tested, cold-chain shipped. Not for human consumption. Available for licensed research.`.trim();
  return { page_title, meta_description };
};
let patched = 0;
for (const p of products.data || []) {
  const needsTitle = !p.page_title;
  const needsMeta = !p.meta_description;
  if (!needsTitle && !needsMeta) continue;
  const payload = template(p);
  const body = {};
  if (needsTitle) body.page_title = payload.page_title;
  if (needsMeta) body.meta_description = payload.meta_description;
  console.log(`  ${p.sku.padEnd(12)} <- ${Object.keys(body).join("+")}: "${(body.page_title || body.meta_description || "").slice(0, 60)}..."`);
  await api("PUT", `/v3/catalog/products/${p.id}`, body);
  patched++;
}
console.log(`  patched ${patched}/${(products.data || []).length} products`);

console.log("\n✓ cleanup done");
