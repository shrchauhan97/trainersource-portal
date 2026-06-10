// Wave 6 — create 301 redirects from old PLP URLs to new (post-rename).
// Run: node scripts/bc-create-plp-redirects.mjs           (dry-run)
//      node scripts/bc-create-plp-redirects.mjs --apply   (writes)
//
// BC's auto-redirect-on-rename is a per-category toggle in the Stencil
// control panel and defaults OFF on this store, so the old URLs 404 today.
// This restores them as explicit 301s to the category entity (BC resolves
// `category:entity_id` to whatever the current canonical URL is — so even
// if we rename again later, the redirect target follows).

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
const API = `https://api.bigcommerce.com/stores/${HASH}/v3`;
const headers = { 'X-Auth-Token': TOKEN, Accept: 'application/json', 'Content-Type': 'application/json' };
const APPLY = process.argv.includes('--apply');

const REDIRECTS = [
  { from: '/buy-research-peptides/metabolic-protocol/',                        category_id: 30 },
  { from: '/buy-research-peptides/cognitive-wellness-protocol/',               category_id: 31 },
  { from: '/buy-research-peptides/performance-recovery-regenerative-protocol/', category_id: 32 },
];

async function getSiteId() {
  const r = await fetch(`${API}/sites`, { headers });
  if (!r.ok) throw new Error(`GET sites -> ${r.status}: ${await r.text()}`);
  const json = await r.json();
  const site = json.data.find(s => s.url || s.channel_id === 1) || json.data[0];
  return site.id;
}

async function listRedirects(siteId) {
  // BC v3 redirects API: /v3/storefront/redirects with site_id query
  const r = await fetch(`${API}/storefront/redirects?site_id=${siteId}&limit=250`, { headers });
  if (!r.ok) throw new Error(`GET redirects -> ${r.status}: ${await r.text()}`);
  return (await r.json()).data;
}

async function createRedirects(siteId, items) {
  if (!APPLY) {
    for (const i of items) console.log(`  [dry-run] POST redirect ${i.from_path} -> category:${i.to.entity_id}`);
    return { skipped: true };
  }
  // BC v3 redirects: PUT /v3/storefront/redirects accepts a batch (upsert)
  const r = await fetch(`${API}/storefront/redirects`, {
    method: 'PUT', headers, body: JSON.stringify(items),
  });
  if (!r.ok) throw new Error(`PUT redirects -> ${r.status}: ${await r.text()}`);
  return await r.json();
}

(async () => {
  console.log(`Mode: ${APPLY ? 'APPLY' : 'dry-run'}\n`);
  const siteId = await getSiteId();
  console.log(`site_id=${siteId}\n`);

  const existing = await listRedirects(siteId);
  console.log(`Found ${existing.length} existing redirects.\n`);

  const toCreate = [];
  for (const r of REDIRECTS) {
    const dup = existing.find(e => e.from_path === r.from);
    if (dup) {
      console.log(`  [skip] redirect already exists for ${r.from} (id=${dup.id})`);
      continue;
    }
    toCreate.push({
      from_path: r.from,
      to: { type: 'category', entity_id: r.category_id },
      site_id: siteId,
    });
    console.log(`  +  ${r.from}\n        -> category #${r.category_id} (resolves to current URL of that category)`);
  }
  if (toCreate.length === 0) {
    console.log('\nNothing to do.');
    return;
  }
  const _res = await createRedirects(siteId, toCreate);
  if (APPLY) console.log(`\nCreated ${toCreate.length} redirects. Old URLs now 301 -> current category URLs.`);
})().catch((err) => { console.error('FAILED:', err.message); process.exit(1); });
