import { timingSafeEqual } from 'node:crypto';

import { createServiceClient } from '@/lib/supabase/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status });
}

function safeEqualStrings(a: string, b: string) {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);

  if (aBuf.length !== bBuf.length) {
    return false;
  }

  return timingSafeEqual(aBuf, bBuf);
}

function verifyCronAuth(authorizationHeader: string | null, secret: string) {
  if (!authorizationHeader) {
    return false;
  }

  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return false;
  }

  return safeEqualStrings(match[1].trim(), secret);
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    console.error(
      'CRON_SECRET is not configured — refusing to run expire-codes cron. ' +
        'Set CRON_SECRET on the Vercel project so the platform-issued ' +
        'Authorization: Bearer <secret> header can be verified.',
    );
    return json({ error: 'Server misconfigured' }, 500);
  }

  const authorization = request.headers.get('authorization');
  if (!verifyCronAuth(authorization, secret)) {
    return json({ error: 'Unauthorized' }, 401);
  }

  try {
    const supabase = createServiceClient();
    const nowIso = new Date().toISOString();

    const { data, error } = await supabase
      .from('access_codes')
      .update({ status: 'expired' })
      .eq('status', 'active')
      .lt('expires_at', nowIso)
      .select('id');

    if (error) {
      throw error;
    }

    const expired = data?.length ?? 0;
    console.log(`[cron] expired ${expired} access codes`);

    return json({ ok: true, expired });
  } catch (error) {
    console.error('[cron] expire-codes failed', error);
    return json({ error: 'Internal server error' }, 500);
  }
}
