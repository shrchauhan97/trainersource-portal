// Second-pass cleanup: fix CMS page bodies + add meta descriptions.
//   1. Replace support@powerpepgroup.com -> support@ultimate-peptides.com in ALL page bodies.
//   2. Also replace bare 'powerpepgroup.com' -> 'ultimate-peptides.com' for any other stragglers.
//   3. Fill in meta_description for each page using a short research-lit template.
//
// Does NOT touch: damage-claim timeframe conflicts (2 days vs 7 days) — business call.
// Does NOT touch: full body restructuring — scope is word-level safe replacements only.
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
  if (!res.ok) { console.log(`  !! ${method} ${path} -> ${res.status} ${txt.slice(0, 200)}`); return { __error: res.status }; }
  try { return txt ? JSON.parse(txt) : { ok: true }; } catch { return { __raw: txt }; }
}

// Research-lit-voice meta descriptions for each page, indexed by name.
const pageMetas = {
  "Shipping & Returns": "Shipping timelines, international forwarding, damaged-package policy and refund procedures for research peptide orders. For research use only; not for human consumption.",
  "Contact Us": "Reach the Ultimate Peptides research support team — purity questions, order status, COA requests. Response within 24 hours on business days.",
  "Why Us": "Third-party purity testing, cold-chain shipping, and USA-sourced research peptides. Supporting longevity, performance, and regenerative research.",
  "Research Insights": "Curated research notes and protocol summaries for peptides in metabolic, cognitive, and regenerative applications. For research use only.",
  "FAQ": "Answers to common questions about research peptide storage, shipping, purity, and permitted research use. Not for human consumption.",
  "Privacy Policy": "How Ultimate Peptides collects, stores and uses account and order data. GDPR and US consumer privacy law compliant. Contact support for data requests.",
  "Terms & Conditions": "Ultimate Peptides research peptide terms of sale. All products sold for research use only — not for human consumption, diagnosis, or treatment.",
  "Blog": "Research notes, protocol insights, and peptide science updates from Ultimate Peptides. For licensed researchers only.",
};

console.log(dry ? "== DRY RUN ==" : "== LIVE ==");
console.log("\n[1] Fetching all pages with bodies");
const pagesIndex = await api("GET", "/v3/content/pages?limit=250");
const pages = [];
for (const p of pagesIndex.data || []) {
  const detail = await api("GET", `/v3/content/pages/${p.id}?include=body`);
  pages.push(detail.data || p);
}
console.log(`  found ${pages.length} pages`);

console.log("\n[2] Patching bodies + meta descriptions");
let touched = 0;
for (const p of pages) {
  const body = p.body || "";
  const patch = {};
  let changes = [];

  // Body: replace powerpepgroup with ultimate-peptides (both full email and bare domain)
  if (body.includes("powerpepgroup")) {
    const newBody = body
      .replaceAll("support@powerpepgroup.com", "support@ultimate-peptides.com")
      .replaceAll("powerpepgroup.com", "ultimate-peptides.com");
    patch.body = newBody;
    changes.push(`body: powerpep->ultimate-peptides`);
  }

  // Meta description: fill if empty
  if (!p.meta_description && pageMetas[p.name]) {
    patch.meta_description = pageMetas[p.name];
    changes.push(`meta_description`);
  }

  if (changes.length === 0) {
    console.log(`  [skip] ${p.name} (clean)`);
    continue;
  }

  console.log(`  [patch] ${p.name} (${changes.join(", ")})`);
  await api("PUT", `/v3/content/pages/${p.id}`, patch);
  touched++;
}

console.log(`\n✓ patched ${touched}/${pages.length} pages`);
