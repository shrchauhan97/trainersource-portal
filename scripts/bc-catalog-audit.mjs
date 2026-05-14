// One-shot audit: dump current BC catalog vs Shaurya's 2026-05-14 price list.
// Run: node scripts/bc-catalog-audit.mjs
//
// Uses BIGCOMMERCE_ACCESS_TOKEN + BIGCOMMERCE_STORE_HASH from .env.local.
// READ ONLY — does NOT mutate the catalog. Just shows what exists, what
// needs price-only update, what needs creating.
//
// SAFE TO RUN — no writes. Output goes to stdout + bugs/wave6-catalog-state.json.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(__dirname);

// Load env from .env.production.local (preferred — has BC store hash) and
// fall back to .env.local for anything missing. Manual parse, no dotenv dep.
// Always override process.env from the file so we use the local creds.
const envFiles = [path.join(ROOT, '.env.production.local'), path.join(ROOT, '.env.local')];
const envText = envFiles
  .filter(p => fs.existsSync(p))
  .map(p => fs.readFileSync(p, 'utf8'))
  .join('\n');
const localEnv = {};
for (const rawLine of envText.split(/\r?\n/)) {
  // Aggressive whitespace strip — .trim() apparently leaves \r in some
  // Windows-line-ended files passing through .split(/\r?\n/).
  const line = rawLine.replace(/[\r\n \s]+$/, '').replace(/^[\r\n \s]+/, '');
  if (!line || line.startsWith('#')) continue;
  const eq = line.indexOf('=');
  if (eq < 1) continue;
  const key = line.slice(0, eq).replace(/[\r\n \s]/g, '');
  let val = line.slice(eq + 1).replace(/[\r\n ]+$/g, '').trim();
  // Strip a trailing inline comment ONLY if val isn't quoted
  if (!(val.startsWith('"') || val.startsWith("'"))) {
    const hashAt = val.indexOf(' #');
    if (hashAt >= 0) val = val.slice(0, hashAt).trim();
  }
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  // Strip stray literal escape sequences someone may have typed thinking
  // dotenv would interpret them (it does not). Defensive against `\n` / `\r`
  // bleeding into values like BIGCOMMERCE_STORE_HASH="yemcm3khpa\n".
  val = val.replace(/\\[rn]$/g, '').replace(/[\r\n ]+$/g, '');
  // Don't overwrite an existing non-empty value with an empty one.
  if (val !== '' || !(key in localEnv)) {
    localEnv[key] = val;
  }
}

const TOKEN = localEnv.BIGCOMMERCE_ACCESS_TOKEN || process.env.BIGCOMMERCE_ACCESS_TOKEN;
const HASH = localEnv.BIGCOMMERCE_STORE_HASH || process.env.BIGCOMMERCE_STORE_HASH;
if (!TOKEN || !HASH) {
  console.error('Missing BIGCOMMERCE_ACCESS_TOKEN or BIGCOMMERCE_STORE_HASH');
  console.error(`Loaded ${Object.keys(localEnv).length} vars from .env.local; keys include: ${Object.keys(localEnv).filter(k => k.startsWith('BIG') || k.startsWith('BC_')).join(', ') || '(none with BIG/BC_ prefix)'}`);
  process.exit(1);
}

const API = `https://api.bigcommerce.com/stores/${HASH}/v3`;
const headers = {
  'X-Auth-Token': TOKEN,
  'Accept': 'application/json',
  'Content-Type': 'application/json',
};

// Shaurya's 2026-05-14 directive — USD prices, normalized to mg.
const TARGET_PRICES = [
  { search: /retatrutide.*10\s*mg|^retatrutide(?!.*20)/i, label: 'Retatrutide 10mg', price: 200 },
  { search: /retatrutide.*20\s*mg/i, label: 'Retatrutide 20mg', price: 280 },
  { search: /\bsemax\b/i, label: 'Semax 10mg', price: 140 },
  { search: /tirzepatide/i, label: 'Tirzepatide 10mg', price: 110 },
  { search: /selank/i, label: 'Selank 10mg', price: 150 },
  { search: /\bdsip\b/i, label: 'DSIP 10mg', price: 170 },
  { search: /epithalon/i, label: 'Epithalon 50mg', price: 240 },
  { search: /pt[-\s]?141/i, label: 'PT-141 10mg', price: 130 },
  { search: /bpc[-\s]?157.*tb[-\s]?500|tb[-\s]?500.*bpc[-\s]?157/i, label: 'BPC157 / TB500 10mg', price: 180 },
  { search: /melanotan/i, label: 'Melanotan 1 10mg', price: 130 },
  { search: /tesamorelin/i, label: 'Tesamorelin 10mg', price: 240 },
  { search: /ipamorelin/i, label: 'Ipamorelin 10mg', price: 140 },
  { search: /cjc[-\s]?1295/i, label: 'CJC-1295 10mg', price: 240 },
  { search: /ghk[-\s]?cu/i, label: 'GHK-Cu 50mg', price: 120 },
  { search: /mots[-\s]?c/i, label: 'MOTS-c 40mg', price: 240 },
];

async function listAllProducts() {
  const all = [];
  let page = 1;
  while (true) {
    const res = await fetch(`${API}/catalog/products?limit=250&page=${page}&include=variants`, { headers });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`BC API ${res.status}: ${body}`);
    }
    const json = await res.json();
    all.push(...json.data);
    if (json.meta?.pagination?.total_pages > page) {
      page += 1;
    } else {
      break;
    }
  }
  return all;
}

async function listCategories() {
  // BC deprecated /v3/catalog/categories in favor of /v3/catalog/trees/categories.
  // Try the new endpoint first; fall back to legacy.
  const res = await fetch(`${API}/catalog/trees/categories?limit=250`, { headers });
  if (res.ok) {
    const json = await res.json();
    return json.data;
  }
  const legacy = await fetch(`${API}/catalog/categories?limit=250`, { headers });
  if (!legacy.ok) {
    console.warn(`(categories endpoint unavailable: ${legacy.status})`);
    return [];
  }
  const json = await legacy.json();
  return json.data;
}

(async () => {
  console.log('Auth check + catalog dump...\n');

  const [products, categories] = await Promise.all([listAllProducts(), listCategories()]);
  console.log(`Found ${products.length} products, ${categories.length} categories.\n`);

  // Match each target to a product (or flag as missing).
  const matches = [];
  const unmatched = [];

  for (const target of TARGET_PRICES) {
    const found = products.find(p => target.search.test(p.name) || target.search.test(p.sku || ''));
    if (found) {
      matches.push({
        target,
        product: {
          id: found.id,
          sku: found.sku,
          name: found.name,
          price: found.price,
          retail_price: found.retail_price,
          sale_price: found.sale_price,
          visible: found.is_visible,
          weight: found.weight,
        },
        action: Math.abs(found.price - target.price) < 0.01 ? 'NO_CHANGE' : 'UPDATE_PRICE',
      });
    } else {
      unmatched.push(target);
    }
  }

  // Find products NOT in target list (might be discontinued / to keep / to remove).
  const targetMatched = new Set(matches.map(m => m.product.id));
  const orphans = products
    .filter(p => !targetMatched.has(p.id))
    .map(p => ({ id: p.id, sku: p.sku, name: p.name, price: p.price, visible: p.is_visible }));

  console.log('─── Target → Current product matches ───────────────');
  for (const m of matches) {
    const flag = m.action === 'UPDATE_PRICE' ? '✏' : '✓';
    console.log(`  ${flag}  ${m.target.label.padEnd(28)} #${m.product.id}  ${m.product.sku?.padEnd(14) || '(no sku)'.padEnd(14)}  $${m.product.price} → $${m.target.price}`);
  }

  console.log('\n─── Unmatched targets (must CREATE in BC) ──────────');
  for (const u of unmatched) {
    console.log(`  +  ${u.label.padEnd(28)}  $${u.price}`);
  }

  console.log('\n─── Orphan products (in BC but not in user list) ──');
  for (const o of orphans) {
    console.log(`  ?  #${o.id}  ${(o.sku || '').padEnd(14)}  ${o.name.padEnd(36)}  $${o.price}  ${o.visible ? '' : '(hidden)'}`);
  }

  console.log('\n─── Categories in BC ────────────────────────────');
  for (const c of categories) {
    console.log(`  #${c.id}  ${c.name.padEnd(30)}  parent=${c.parent_id}  visible=${c.is_visible}`);
  }

  // Write structured output for the next step
  const outPath = path.join(ROOT, '..', 'bugs', 'wave6-catalog-state.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify({
    audited_at: new Date().toISOString(),
    counts: { products: products.length, categories: categories.length, matches: matches.length, unmatched: unmatched.length, orphans: orphans.length },
    matches,
    unmatched,
    orphans,
    categories,
  }, null, 2));
  console.log(`\nWrote structured state to bugs/wave6-catalog-state.json`);
})().catch((err) => {
  console.error('AUDIT FAILED:', err.message);
  process.exit(1);
});
