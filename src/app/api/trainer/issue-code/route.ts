// src/app/api/trainer/issue-code/route.ts
import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { requireBotSecret } from '@/lib/bot-auth';
import { createServiceClient } from '@/lib/supabase/service';

export const runtime = 'nodejs';

const RANDOM_SUFFIX_LEN = 4;
const SLUG_MAX = 24;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const EXPIRY_DAYS = 365;

export function slugFromLabel(label: string): string {
  const ascii = label
    .normalize('NFKD')
    .replace(/[^\x00-\x7F]/g, '')  // strip non-ASCII
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX);
  return ascii.length >= 2 ? ascii : 'CLIENT';
}

function randomSuffix(): string {
  const bytes = randomBytes(RANDOM_SUFFIX_LEN);
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

export async function POST(request: Request) {
  const auth = requireBotSecret(request);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: 401 });

  let body: { label?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid-json' }, { status: 400 });
  }
  const label = typeof body.label === 'string' ? body.label.trim() : '';
  if (!label) return NextResponse.json({ error: 'label-required' }, { status: 400 });
  if (label.length > 200) return NextResponse.json({ error: 'label-too-long' }, { status: 400 });

  const slug = slugFromLabel(label);
  const supabase = createServiceClient();
  const expiresAt = new Date(Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = `${slug}-${randomSuffix()}`;
    const { data, error } = await supabase
      .from('access_codes')
      .insert({
        code,
        type: 'trainer',
        trainer_id: auth.trainerId,
        status: 'active',
        issued_via: 'bot',
        label,
        expires_at: expiresAt,
      })
      .select('id, code, label, expires_at')
      .single<{ id: string; code: string; label: string; expires_at: string }>();

    if (!error && data) {
      const portalBase = process.env.NEXT_PUBLIC_PORTAL_BASE_URL ?? 'https://trainer-source.com';
      const upBase = process.env.NEXT_PUBLIC_UP_BASE_URL ?? 'https://ultimate-peptides.com';
      return NextResponse.json({
        id: data.id,
        code,
        label: data.label,
        landing_url: `${upBase}?ref=${code}`,
        deep_link: `${upBase}/code/${code}`,
        qr_url: `${portalBase}/api/qr/${code}`,
        expires_at: data.expires_at,
      });
    }
    // 23505 = unique-violation. Loop and retry with fresh suffix.
    if (error && (error as { code?: string }).code !== '23505') {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }
  return NextResponse.json({ error: 'could-not-generate-unique-code' }, { status: 500 });
}
