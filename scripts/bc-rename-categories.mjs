// Wave 6 PLP fix: rename 3 BC categories so URLs match home-page CTAs.
// Run: node scripts/bc-rename-categories.mjs            (dry-run)
//      node scripts/bc-rename-categories.mjs --apply    (writes)
//
// BC auto-creates a 301 redirect from the old URL to the new one when
// "Automatically redirect" is enabled (default). custom_url.is_customized
// is set to true to prevent BC regenerating the slug from the new name.

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
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
  val = val.replace(/\\[rn]$/g, '').replace(/[\r\n ]+$/g, '');
  if (val !== '' || !(key in localEnv)) localEnv[key] = val;
}

const TOKEN = localEnv.BIGCOMMERCE_ACCESS_TOKEN;
const HASH = localEnv.BIGCOMMERCE_STORE_HASH;
if (!TOKEN || !HASH) { console.error('Missing BC creds'); process.exit(1); }

const API = `https://api.bigcommerce.com/stores/${HASH}/v3`;
const headers = { 'X-Auth-Token': TOKEN, Accept: 'application/json', 'Content-Type': 'application/json' };
const APPLY = process.argv.includes('--apply');

// Renames: BC category IDs are known from the audit (bugs/wave6-catalog-state.json).
// PUT /v3/catalog/categories is the modern BATCH endpoint — body is an array
// of {id, ...fields}. Works on this store.
const RENAMES = [
  { id: 30, oldName: 'Metabolic Protocol',                                  newName: 'Metabolic',         newUrl: '/metabolic/' },
  { id: 31, oldName: 'Cognitive & Wellness Protocol',                       newName: 'Anti-Aging',        newUrl: '/anti-aging/' },
  { id: 32, oldName: 'Performance, Recovery & Regenerative Protocol',      newName: 'Anti-Inflammatory', newUrl: '/anti-inflammatory/' },
];

async function batchUpdateCategories(updates) {
  if (!APPLY) {
    for (const u of updates) console.log(`  [dry-run] update #${u.id}: name="${u.name}" url=${u.custom_url.url}`);
    return { skipped: true };
  }
  // /v3/catalog/categories endpoint rejected (405). Fall back to individual
  // /v3/catalog/categories/{id} PUTs (legacy single-update endpoint, still
  // works on this store).
  const results = [];
  for (const u of updates) {
    const { id, ...body } = u;
    const r = await fetch(`${API}/catalog/categories/${id}`, {
      method: 'PUT', headers, body: JSON.stringify(body),
    });
    if (!r.ok) {
      const text = await r.text();
      throw new Error(`PUT category ${id} -> ${r.status}: ${text}`);
    }
    results.push(await r.json());
    console.log(`  ✓ updated #${id} -> ${body.name}`);
  }
  return { results };
}

(async () => {
  console.log(`Mode: ${APPLY ? 'APPLY' : 'dry-run'}\n`);
  console.log('─── Renames ─────────────────────────────────');
  for (const r of RENAMES) {
    console.log(`  #${r.id}  "${r.oldName}"\n        -> "${r.newName}"  (url: ${r.newUrl})`);
  }
  console.log('');

  const payload = RENAMES.map(r => ({
    id: r.id,
    name: r.newName,
    custom_url: { url: r.newUrl, is_customized: true },
  }));
  const res = await batchUpdateCategories(payload);
  if (APPLY) {
    console.log('Response:', JSON.stringify(res, null, 2).slice(0, 500));
  }
  console.log(`\n${APPLY ? 'Done. BC should 301 old URLs to new (if "auto-redirect" is enabled in store settings — default ON).' : 'Dry-run complete. Re-run with --apply.'}`);
})().catch((err) => { console.error('FAILED:', err.message); process.exit(1); });
