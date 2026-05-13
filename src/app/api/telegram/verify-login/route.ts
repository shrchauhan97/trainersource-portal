import { NextResponse } from 'next/server';
import { verifyLoginWidget, type LoginWidgetPayload } from '@/lib/telegram-auth';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

export const runtime = 'nodejs';

// Shape returned by link_telegram_to_trainer (see
// supabase/migrations/2026-05-14-telegram-link-audit.sql).
type LinkRpcRow = {
  ok: boolean;
  reason: string | null;
  existing_trainer_id: string | null;
  action: string | null;
};

// Extract a plausible client IP from the proxy headers Vercel / typical CDNs
// add. Mirrors the helper in src/app/api/codes/validate/route.ts.
function getClientIp(request: Request): string | null {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return (
    request.headers.get('x-real-ip') ??
    request.headers.get('cf-connecting-ip') ??
    null
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const params = url.searchParams;

  const rawLast = params.get('last_name');
  const rawUsername = params.get('username');
  const rawPhoto = params.get('photo_url');
  const payload: Partial<LoginWidgetPayload> = {
    id: Number(params.get('id') ?? 0),
    first_name: params.get('first_name') ?? '',
    auth_date: Number(params.get('auth_date') ?? 0),
    hash: params.get('hash') ?? '',
  };
  if (rawLast !== null) payload.last_name = rawLast;
  if (rawUsername !== null) payload.username = rawUsername;
  if (rawPhoto !== null) payload.photo_url = rawPhoto;

  const token = (process.env.TELEGRAM_BOT_TOKEN ?? '').trim();
  if (!token) {
    return NextResponse.json({ error: 'server-misconfigured' }, { status: 500 });
  }

  const verified = verifyLoginWidget(payload, token);
  if (!verified) {
    return NextResponse.json({ error: 'invalid-signature' }, { status: 401 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) {
    return NextResponse.json({ error: 'no-portal-session' }, { status: 401 });
  }
  const { data: trainer } = await supabase
    .from('trainers')
    .select('id')
    .eq('email', user.email)
    .maybeSingle<{ id: string }>();
  if (!trainer) {
    return NextResponse.json({ error: 'not-a-trainer' }, { status: 403 });
  }

  // T2.6 fix: the previous code did an UPSERT with onConflict='telegram_user_id'
  // which silently overwrote any existing link. Trainer-A signing in with a
  // Telegram account already linked to trainer-B would steal the link with
  // zero audit. The link_telegram_to_trainer RPC takes a row-level lock on
  // trainer_telegram_links, checks the existing trainer_id, and either:
  //   - INSERTs (no row) → ok=true, action='create'
  //   - touches linked_at (same trainer) → ok=true, action='noop' (idempotent)
  //   - returns conflict (different trainer) → ok=false,
  //     reason='telegram_account_linked_to_another_trainer'
  // Every non-noop branch writes to telegram_link_audit, including the
  // blocked-conflict case so we have evidence of attempted hijacks.
  const service = createServiceClient();
  const { data, error } = await service.rpc('link_telegram_to_trainer', {
    p_telegram_user_id: verified.id,
    p_trainer_id: trainer.id,
    p_linked_via: 'widget',
    p_ip_address: getClientIp(request),
    p_user_agent: request.headers.get('user-agent'),
  });

  if (error) {
    console.error('[verify-login] link RPC failed:', error);
    return NextResponse.json({ error: 'link-failed' }, { status: 500 });
  }

  // PostgREST returns SETOF as either an array or a single row depending on
  // the RPC shape. Handle both (matches the pattern in codes/validate).
  const row: LinkRpcRow | null = Array.isArray(data)
    ? (data[0] as LinkRpcRow | undefined) ?? null
    : ((data as LinkRpcRow | null) ?? null);

  if (!row) {
    console.error('[verify-login] link RPC returned no row');
    return NextResponse.json({ error: 'link-failed' }, { status: 500 });
  }

  if (!row.ok) {
    if (row.reason === 'telegram_account_linked_to_another_trainer') {
      // This Telegram account is already bound to a different trainer.
      // We do NOT reveal the other trainer's id — only that the account
      // is already linked. The other trainer must unlink first.
      return NextResponse.json(
        {
          error: 'telegram_account_linked_to_another_trainer',
          message:
            'This Telegram account is already linked to another trainer. ' +
            'The other trainer must unlink it first before you can connect.',
        },
        { status: 409 },
      );
    }
    console.error('[verify-login] link RPC failed with reason:', row.reason);
    return NextResponse.json({ error: row.reason ?? 'link-failed' }, { status: 500 });
  }

  return NextResponse.redirect(new URL('/dashboard?telegram_linked=1', url), 302);
}
