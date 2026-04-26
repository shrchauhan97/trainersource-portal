// One-shot: bind Shaurya's Telegram user id (7332282852) to shaurya-preview trainer.
// Uses service-role key — bypasses RLS.
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

// Lightweight .env.local loader (avoid dotenv dep on this CJS/ESM split)
const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    }),
);
const url = env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });
const TELEGRAM_USER_ID = 7332282852;
const TRAINER_SLUG = 'shaurya-preview';

const { data: trainer, error: trainerErr } = await supabase
  .from('trainers')
  .select('id, name, email, slug, status')
  .eq('slug', TRAINER_SLUG)
  .maybeSingle();

if (trainerErr) { console.error('trainer lookup:', trainerErr); process.exit(1); }
if (!trainer) { console.error(`trainer ${TRAINER_SLUG} not found`); process.exit(1); }
console.log('trainer:', trainer);

const { data: existing } = await supabase
  .from('trainer_telegram_links')
  .select('*')
  .eq('telegram_user_id', TELEGRAM_USER_ID)
  .maybeSingle();

if (existing) { console.log('already linked:', existing); process.exit(0); }

const { data: inserted, error: insErr } = await supabase
  .from('trainer_telegram_links')
  .insert({
    telegram_user_id: TELEGRAM_USER_ID,
    trainer_id: trainer.id,
    linked_via: 'manual_admin',
  })
  .select()
  .single();

if (insErr) { console.error('insert:', insErr); process.exit(1); }
console.log('\nLINKED ✓', inserted);
