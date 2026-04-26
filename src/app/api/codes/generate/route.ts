import { randomBytes } from 'node:crypto';

import { createClient } from '@/lib/supabase/server';
import { CODE_EXPIRY_DAYS, CODE_LENGTH } from '@/lib/constants';
import type { Trainer } from '@/lib/types';

export const runtime = 'nodejs';

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status });
}

function generateCode() {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let value = '';

  while (value.length < CODE_LENGTH) {
    const bytes = randomBytes(CODE_LENGTH);

    for (const byte of bytes) {
      value += alphabet[byte % alphabet.length];
      if (value.length === CODE_LENGTH) {
        break;
      }
    }
  }

  return value;
}

async function requireTrainer() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.email) {
    return { supabase, trainer: null };
  }

  const { data: trainer, error: trainerError } = await supabase
    .from('trainers')
    .select('*')
    .eq('email', user.email)
    .maybeSingle<Trainer>();

  if (trainerError) {
    throw trainerError;
  }

  return { supabase, trainer };
}

export async function POST() {
  try {
    const { supabase, trainer } = await requireTrainer();

    if (!trainer) {
      return json({ error: 'Unauthorized' }, 401);
    }

    if (trainer.status !== 'active') {
      return json({ error: 'Trainer is not active' }, 403);
    }

    const { count, error: countError } = await supabase
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .eq('trainer_id', trainer.id);

    if (countError) {
      throw countError;
    }

    if ((count ?? 0) >= trainer.max_clients) {
      return json({ error: 'Maximum client count reached' }, 403);
    }

    const expiresAt = new Date(Date.now() + CODE_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const code = generateCode();
      const { data, error } = await supabase
        .from('access_codes')
        .insert({
          code,
          type: 'trainer',
          trainer_id: trainer.id,
          status: 'active',
          expires_at: expiresAt,
        })
        .select('code, expires_at')
        .single<{ code: string; expires_at: string }>();

      if (!error && data) {
        return json(data, 200);
      }

      if (error && error.code !== '23505') {
        throw error;
      }
    }

    return json({ error: 'Unable to generate unique code' }, 500);
  } catch (error) {
    console.error(error);
    return json({ error: 'Internal server error' }, 500);
  }
}
