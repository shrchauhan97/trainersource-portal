// Wave 6 catalog mutations: update 5 prices + create Retatrutide 20mg.
// Run: node scripts/bc-apply-wave6.mjs --dry-run    (default — prints plan, no writes)
//      node scripts/bc-apply-wave6.mjs --apply      (writes to BC)
//
// Idempotent: re-running with --apply after success will be a no-op (PUT
// to same price = no change). Create skips if a product with the new SKU
// already exists.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(__dirname);

const envFiles = [path.join(ROOT, '.env.production.local'), path.join(ROOT, '.env.local')];
const envText = envFiles.filter(p => fs.existsSync(p)).map(p => fs.readFileSync(p, 'utf8')).join('\n');
const localEnv = {};
for (const rawLine of envText.split(/\r?\n/)) {
  const line = rawLine.replace(/[\r\n \s]+$/, '').replace(/^[\r\n \s]+/, '');
  if (!line || line.startsWith('#')) continue;
  const eq = line.indexOf('=');
  if (eq < 1) continue;
  const key = line.slice(0, eq).replace(/[\r\n \s]/g, '');
  let val = line.slice(eq + 1).replace(/[\r\n ]+$/g, '').trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  val = val.replace(/\\[rn]$/g, '').replace(/[\r\n ]+$/g, '');
  if (val !== '' || !(key in localEnv)) localEnv[key] = val;
}

const TOKEN = localEnv.BIGCOMMERCE_ACCESS_TOKEN;
const HASH = localEnv.BIGCOMMERCE_STORE_HASH;
if (!TOKEN || !HASH) { console.error('Missing BC creds'); process.exit(1); }

const API = `https://api.bigcommerce.com/stores/${HASH}/v3`;
const headers = {
  'X-Auth-Token': TOKEN, 'Accept': 'application/json', 'Content-Type': 'application/json',
};
const APPLY = process.argv.includes('--apply');

// Updates: { product_id, name (for log), new_price }
const PRICE_UPDATES = [
  { id: 114, name: 'Retatrutide 10mg',     price: 200 },
  { id: 124, name: 'Epithalon 50mg',       price: 240 },
  { id: 119, name: 'Tesamorelin 10mg',     price: 240 },
  { id: 117, name: 'CJC-1295 10mg',        price: 240 },
  { id: 128, name: 'MOTS-c 40mg',          price: 240 },
];

// New product: Retatrutide 20mg — clone of #114 schema with adjusted SKU/name/price.
const NEW_PRODUCTS = [
  {
    name: 'Retatrutide 20mg',
    sku: 'UP-RETA20',
    price: 280,
    sourceCloneFrom: 114,           // copy weight/categories/description from this product
    nameDiff: 'Retatrutide 20mg',   // new name
    descriptionAppend: '\n\n<p><strong>20mg variant of Retatrutide.</strong> See the 10mg listing for full protocol details.</p>',
  },
];

async function fetchProduct(id) {
  const r = await fetch(`${API}/catalog/products/${id}`, { headers });
  if (!r.ok) throw new Error(`GET product ${id} -> ${r.status}: ${await r.text()}`);
  return (await r.json()).data;
}

async function updatePrice(id, price, name) {
  if (!APPLY) {
    console.log(`  [dry-run] PUT product ${id} (${name}) price=${price}`);
    return { skipped: true };
  }
  const r = await fetch(`${API}/catalog/products/${id}`, {
    method: 'PUT', headers, body: JSON.stringify({ price }),
  });
  if (!r.ok) throw new Error(`PUT product ${id} -> ${r.status}: ${await r.text()}`);
  return await r.json();
}

async function createCloneProduct(spec) {
  // Check if SKU already exists
  const existing = await fetch(`${API}/catalog/products?sku=${encodeURIComponent(spec.sku)}`, { headers });
  if (existing.ok) {
    const json = await existing.json();
    if (json.data.length > 0) {
      console.log(`  [skip] product with sku=${spec.sku} already exists (#${json.data[0].id})`);
      return { skipped: true };
    }
  }

  const src = await fetchProduct(spec.sourceCloneFrom);
  console.log(`  cloning from #${src.id} (${src.name}) — weight ${src.weight}, ${src.categories?.length || 0} categories`);

  // BC product create requires: name, type, weight, price, sku optional, description optional, categories optional
  const payload = {
    name: spec.nameDiff,
    type: src.type || 'physical',
    sku: spec.sku,
    price: spec.price,
    weight: src.weight,
    description: (src.description || '') + spec.descriptionAppend,
    categories: src.categories || [],
    brand_id: src.brand_id || 0,
    is_visible: src.is_visible,
    availability: src.availability || 'available',
    tax_class_id: src.tax_class_id || 0,
    inventory_tracking: src.inventory_tracking || 'none',
  };

  if (!APPLY) {
    console.log(`  [dry-run] POST product name="${spec.nameDiff}" sku=${spec.sku} price=${spec.price}`);
    return { skipped: true, payload };
  }
  const r = await fetch(`${API}/catalog/products`, {
    method: 'POST', headers, body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(`POST product -> ${r.status}: ${await r.text()}`);
  return await r.json();
}

(async () => {
  console.log(`Mode: ${APPLY ? 'APPLY (writes BC)' : 'dry-run (no writes)'}\n`);
  console.log('─── Price updates ───────────────────');
  for (const u of PRICE_UPDATES) {
    await updatePrice(u.id, u.price, u.name);
    if (APPLY) console.log(`  ✓  #${u.id}  ${u.name.padEnd(28)} -> $${u.price}`);
  }
  console.log('\n─── New products ───────────────────');
  for (const n of NEW_PRODUCTS) {
    const res = await createCloneProduct(n);
    if (APPLY && !res.skipped) console.log(`  +  created #${res.data.id} (${n.name}) sku=${n.sku} price=$${n.price}`);
  }
  console.log(`\n${APPLY ? 'Done.' : 'Dry-run complete. Re-run with --apply to write.'}`);
})().catch((err) => { console.error('FAILED:', err.message); process.exit(1); });
