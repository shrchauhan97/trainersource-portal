import { randomBytes } from 'node:crypto';

import { createClient } from '@/lib/supabase/server';
import { CODE_EXPIRY_DAYS, CODE_LENGTH } from '@/lib/constants';
import type { AccessCode, Admin, CodeStatus, CodeType } from '@/lib/types';

export const runtime = 'nodejs';

type CreateAdminCodesBody = {
  type?: string;
  count?: number;
};

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

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.email) {
    return { supabase, admin: null };
  }

  const { data: admin, error: adminError } = await supabase
    .from('admins')
    .select('*')
    .eq('email', user.email.trim().toLowerCase())
    .maybeSingle<Admin>();

  if (adminError) {
    throw adminError;
  }

  return { supabase, admin };
}

function isValidCodeType(value: string | null): value is CodeType {
  return value === 'trainer' || value === 'founder' || value === 'organic';
}

function isValidCodeStatus(value: string | null): value is CodeStatus {
  return value === 'active' || value === 'consumed' || value === 'expired';
}

export async function GET(request: Request) {
  try {
    const { supabase, admin } = await requireAdmin();

    if (!admin) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const url = new URL(request.url);
    const type = url.searchParams.get('type');
    const status = url.searchParams.get('status');

    if (type && !isValidCodeType(type)) {
      return json({ error: 'Invalid type filter' }, 400);
    }

    if (status && !isValidCodeStatus(status)) {
      return json({ error: 'Invalid status filter' }, 400);
    }

    let query = supabase.from('access_codes').select('*').order('created_at', { ascending: false });

    if (type) {
      query = query.eq('type', type);
    }

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return json({ codes: (data ?? []) as AccessCode[] });
  } catch (error) {
    console.error(error);
    return json({ error: 'Internal server error' }, 500);
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, admin } = await requireAdmin();

    if (!admin) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const body = (await request.json()) as CreateAdminCodesBody;
    const type = body.type?.trim();
    const requestedCount = Number(body.count ?? 1);
    const count = Number.isFinite(requestedCount)
      ? Math.max(1, Math.min(10, Math.trunc(requestedCount)))
      : 1;

    if (type !== 'founder' && type !== 'organic') {
      return json({ error: 'Only founder and organic codes can be generated here' }, 400);
    }

    const expiresAt = new Date(Date.now() + CODE_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const codes: Array<{ code: string; expires_at: string }> = [];

    for (let index = 0; index < count; index += 1) {
      let createdCode: { code: string; expires_at: string } | null = null;

      for (let attempt = 0; attempt < 10; attempt += 1) {
        const code = generateCode();
        const { data, error } = await supabase
          .from('access_codes')
          .insert({
            code,
            type,
            trainer_id: null,
            status: 'active',
            expires_at: expiresAt,
          })
          .select('code, expires_at')
          .single<{ code: string; expires_at: string }>();

        if (!error && data) {
          createdCode = data;
          break;
        }

        if (error && error.code !== '23505') {
          throw error;
        }
      }

      if (!createdCode) {
        return json({ error: 'Unable to generate unique code' }, 500);
      }

      codes.push(createdCode);
    }

    return json({ codes });
  } catch (error) {
    console.error(error);
    return json({ error: 'Internal server error' }, 500);
  }
}
