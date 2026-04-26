// Demo seeder — creates 2 auth users (admin + trainer), inserts matching
// admins/trainers rows, and mints a ready-to-redeem access code for the
// storefront flow. Uses the service role key, so it bypasses RLS.
//
// Run: node supabase/seed.mjs
// Requires: .env.local with SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Tiny .env.local loader — avoids adding dotenv as a dep.
const here = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(here, '..', '.env.local');
for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i);
  if (!match) continue;
  const [, key, rawValue] = match;
  const value = rawValue.replace(/^"(.*)"$/, '$1');
  if (!process.env[key]) process.env[key] = value;
}

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ADMIN_EMAIL = 'admin@demo.test';
const ADMIN_PASSWORD = 'DemoAdmin123!';
const TRAINER_EMAIL = 'trainer@demo.test';
const TRAINER_PASSWORD = 'DemoTrainer123!';

async function ensureAuthUser(email, password) {
  // Paginate existing users; admin.listUsers caps at 50 by default.
  const { data: list, error: listError } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (listError) throw listError;
  const existing = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (existing) {
    console.log(`auth user already exists: ${email}`);
    return existing;
  }
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  console.log(`created auth user: ${email}`);
  return data.user;
}

async function upsertAdmin(email) {
  const { error } = await supabase
    .from('admins')
    .upsert({ email, name: 'Demo Admin', role: 'superadmin' }, { onConflict: 'email' });
  if (error) throw error;
  console.log(`admins row ready: ${email} (superadmin)`);
}

async function upsertTrainer(email) {
  const { data, error } = await supabase
    .from('trainers')
    .upsert(
      {
        email,
        name: 'Demo Trainer',
        country: 'Singapore',
        city: 'Singapore',
        niche: 'HYROX',
        social_media: '@demo_trainer',
        slug: 'demo-trainer',
        tier: 'trainer',
        status: 'active',
        commission_rate: 0.2,
        reorder_commission_rate: 0.1,
        max_clients: 100,
        onboarding_completed_at: new Date().toISOString(),
      },
      { onConflict: 'email' },
    )
    .select('id')
    .single();
  if (error) throw error;
  console.log(`trainers row ready: ${email} (active, id=${data.id})`);
  return data.id;
}

async function ensureAccessCode(trainerId) {
  const { data: existing, error: existingError } = await supabase
    .from('access_codes')
    .select('code')
    .eq('code', 'DEMO0001')
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) {
    console.log(`access code DEMO0001 already exists (status may be consumed — run /api/codes/validate to check)`);
    return existing.code;
  }
  const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  const { error } = await supabase.from('access_codes').insert({
    code: 'DEMO0001',
    type: 'trainer',
    trainer_id: trainerId,
    status: 'active',
    expires_at: expires,
  });
  if (error) throw error;
  console.log(`minted access code: DEMO0001 (expires ${expires})`);
  return 'DEMO0001';
}

async function main() {
  console.log(`seeding ${url}`);
  await ensureAuthUser(ADMIN_EMAIL, ADMIN_PASSWORD);
  await ensureAuthUser(TRAINER_EMAIL, TRAINER_PASSWORD);
  await upsertAdmin(ADMIN_EMAIL);
  const trainerId = await upsertTrainer(TRAINER_EMAIL);
  await ensureAccessCode(trainerId);

  console.log('\nSeed complete. Demo credentials:');
  console.log(`  Admin login:    ${ADMIN_EMAIL}   /   ${ADMIN_PASSWORD}`);
  console.log(`  Trainer login:  ${TRAINER_EMAIL} /   ${TRAINER_PASSWORD}`);
  console.log(`  Access code:    DEMO0001  (expires in 7 days)`);
}

main().catch((err) => {
  console.error('seed failed:', err);
  process.exit(1);
});
