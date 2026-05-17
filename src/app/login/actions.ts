'use server';

import { headers } from 'next/headers';

import { createServiceClient } from '@/lib/supabase/service';

export type CheckEmailResult =
  | { allowed: false; reason: 'not_authorized' | 'suspended' | 'rate_limited' | 'invalid' }
  | { allowed: true; hasPassword: boolean };

const BUCKET = new Map<string, { count: number; resetAt: number }>();
const LIMIT = 10;
const WINDOW_MS = 60_000;

function rateLimit(key: string): boolean {
  const now = Date.now();
  const entry = BUCKET.get(key);
  if (!entry || entry.resetAt < now) {
    BUCKET.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= LIMIT) return false;
  entry.count += 1;
  return true;
}

export async function checkEmailAllowed(rawEmail: string): Promise<CheckEmailResult> {
  const email = (rawEmail || '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { allowed: false, reason: 'invalid' };
  }

  const hdrs = await headers();
  const ip = hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() || hdrs.get('x-real-ip') || 'unknown';
  if (!rateLimit(ip)) {
    return { allowed: false, reason: 'rate_limited' };
  }

  const supabase = createServiceClient();

  const { data: admin } = await supabase
    .from('admins')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (!admin) {
    const { data: trainer } = await supabase
      .from('trainers')
      .select('id, status')
      .eq('email', email)
      .maybeSingle();

    if (!trainer) return { allowed: false, reason: 'not_authorized' };
    if (trainer.status === 'suspended') return { allowed: false, reason: 'suspended' };
    if (trainer.status !== 'active') return { allowed: false, reason: 'not_authorized' };
  }

  const { data: hasPwd } = await supabase.rpc('user_has_password_by_email', { addr: email });
  return { allowed: true, hasPassword: hasPwd === true };
}
