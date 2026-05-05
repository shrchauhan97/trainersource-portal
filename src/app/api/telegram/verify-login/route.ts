import { NextResponse } from 'next/server';
import { verifyLoginWidget, type LoginWidgetPayload } from '@/lib/telegram-auth';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

export const runtime = 'nodejs';

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

  const service = createServiceClient();
  const { error } = await service
    .from('trainer_telegram_links')
    .upsert(
      {
        telegram_user_id: verified.id,
        trainer_id: trainer.id,
        linked_via: 'widget',
      },
      { onConflict: 'telegram_user_id' },
    );
  if (error) {
    console.error('[verify-login] upsert failed:', error);
    return NextResponse.json({ error: 'upsert-failed' }, { status: 500 });
  }

  return NextResponse.redirect(new URL('/dashboard?telegram_linked=1', url), 302);
}
