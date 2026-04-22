// Server component — queries trainer link status, renders widget when unlinked.
import { createClient } from '@/lib/supabase/server';
import { TelegramLoginWidget } from './TelegramLoginWidget';

export async function ConnectTelegramBanner() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;

  const { data: trainer } = await supabase
    .from('trainers')
    .select('id')
    .eq('email', user.email)
    .maybeSingle<{ id: string }>();
  if (!trainer) {
    // Logged-in user is an admin (or some other role) with no trainer row.
    // Don't silently hide — show a breadcrumb so they're not stuck wondering
    // what to do after the /iamtrainer magic-link lands them here.
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        You're logged in as <code>{user.email}</code>, which isn't a trainer
        account. The partner flow (<code>/mycode</code>,{' '}
        <code>/issuecode</code>, <code>/earnings</code>) is trainer-only.{' '}
        <span className="font-semibold">
          To preview it, sign out and sign back in with your <code>+trainer</code>
          {' '}alias
        </span>
        {' '}(e.g. <code>{user.email.replace('@', '+trainer@')}</code>).
      </div>
    );
  }

  const { data: link } = await supabase
    .from('trainer_telegram_links')
    .select('telegram_user_id')
    .eq('trainer_id', trainer.id)
    .maybeSingle<{ telegram_user_id: number }>();

  if (link) {
    return (
      <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
        Telegram connected. Type <code>/start</code> in{' '}
        <a
          href="https://t.me/peptidebutlerbot"
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono underline"
        >
          @peptidebutlerbot
        </a>{' '}
        to open your partner console.
      </div>
    );
  }

  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? 'peptidebutlerbot';

  return (
    <div className="rounded-md border border-blue-200 bg-blue-50 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-semibold text-blue-900">Connect Telegram</div>
          <p className="text-sm text-blue-800">
            Link your Telegram account to use bot commands (
            <code>/mycode</code>, <code>/issuecode</code>,{' '}
            <code>/earnings</code>, <code>/toolkit</code>).
          </p>
        </div>
        <TelegramLoginWidget
          botUsername={botUsername}
          authCallbackUrl="/api/telegram/verify-login"
          size="medium"
        />
      </div>
    </div>
  );
}
