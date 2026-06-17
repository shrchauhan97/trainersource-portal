import {
  verifyLoginWidget,
  type LoginWidgetPayload,
} from '@/lib/telegram-auth';
import {
  loadBcCurrentCustomerConfig,
  resolveBcCustomerFromCookies,
} from '@/lib/bc-current-customer';
import { createServiceClient } from '@/lib/supabase/service';

export const LINK_TELEGRAM_BOT_REDIRECT =
  'https://t.me/peptidebutlerbot?start=link_ok';

type LinkRpcRow = {
  ok: boolean;
  reason: string | null;
  action: string | null;
};

export type LinkTelegramPageResult =
  | { kind: 'landing' }
  | { kind: 'redirect'; url: string }
  | { kind: 'error'; title: string; message: string; status: number };

function getClientIp(requestHeaders: Headers): string | null {
  const xff = requestHeaders.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return (
    requestHeaders.get('x-real-ip') ??
    requestHeaders.get('cf-connecting-ip') ??
    null
  );
}

function parseTelegramPayload(
  params: Record<string, string | string[] | undefined>,
): Partial<LoginWidgetPayload> | null {
  const hash = typeof params.hash === 'string' ? params.hash : '';
  if (!hash) return null;

  const rawLast = typeof params.last_name === 'string' ? params.last_name : null;
  const rawUsername = typeof params.username === 'string' ? params.username : null;
  const rawPhoto = typeof params.photo_url === 'string' ? params.photo_url : null;

  const payload: Partial<LoginWidgetPayload> = {
    id: Number(typeof params.id === 'string' ? params.id : 0),
    first_name: typeof params.first_name === 'string' ? params.first_name : '',
    auth_date: Number(typeof params.auth_date === 'string' ? params.auth_date : 0),
    hash,
  };
  if (rawLast !== null) payload.last_name = rawLast;
  if (rawUsername !== null) payload.username = rawUsername;
  if (rawPhoto !== null) payload.photo_url = rawPhoto;
  return payload;
}

function conflictMessage(reason: string): { title: string; message: string; status: number } {
  if (reason === 'telegram_account_linked_to_another_customer') {
    return {
      title: 'Telegram account already linked',
      message:
        'This Telegram account is already linked to a different store account. ' +
        'Contact support if you need to change it.',
      status: 409,
    };
  }
  if (reason === 'bc_customer_linked_to_another_telegram') {
    return {
      title: 'Store account already linked',
      message:
        'This store account is already linked to a different Telegram account. ' +
        'Contact support if you need to change it.',
      status: 409,
    };
  }
  return {
    title: 'Link failed',
    message: 'We could not complete the link. Please try again or contact support.',
    status: 500,
  };
}

export function isTelegramCallback(
  params: Record<string, string | string[] | undefined>,
): boolean {
  return typeof params.hash === 'string' && params.hash.length > 0;
}

export async function handleLinkTelegramCallback(
  params: Record<string, string | string[] | undefined>,
  cookieHeader: string | null,
  requestHeaders: Headers,
): Promise<LinkTelegramPageResult> {
  const payload = parseTelegramPayload(params);
  if (!payload) {
    return {
      kind: 'error',
      title: 'Invalid request',
      message: 'Missing Telegram authorization data.',
      status: 400,
    };
  }

  const botToken = (process.env.TELEGRAM_BOT_TOKEN ?? '').trim();
  if (!botToken) {
    return {
      kind: 'error',
      title: 'Server misconfigured',
      message: 'Telegram bot is not configured. Please try again later.',
      status: 500,
    };
  }

  const verified = verifyLoginWidget(payload, botToken);
  if (!verified) {
    return {
      kind: 'error',
      title: 'Invalid Telegram sign-in',
      message: 'Telegram authorization failed or expired. Please try again.',
      status: 401,
    };
  }

  const bcCfg = loadBcCurrentCustomerConfig();
  if (!bcCfg) {
    return {
      kind: 'error',
      title: 'Server misconfigured',
      message: 'Store integration is not configured. Please try again later.',
      status: 500,
    };
  }

  const bcCustomer = await resolveBcCustomerFromCookies(cookieHeader, bcCfg);
  if (!bcCustomer.ok) {
    if (bcCustomer.reason === 'no_bc_session') {
      return {
        kind: 'error',
        title: 'Store login required',
        message:
          'Please log into the Ultimate Peptides store first, then return here to link Telegram.',
        status: 401,
      };
    }
    return {
      kind: 'error',
      title: 'Could not verify store session',
      message: 'We could not confirm your store login. Please log in again and retry.',
      status: 401,
    };
  }

  const linkedVia =
    typeof params.login_url === 'string' && params.login_url === '1'
      ? 'login_url'
      : 'widget';

  const service = createServiceClient();
  const { data, error } = await service.rpc('link_telegram_to_bc_customer', {
    p_telegram_user_id: verified.id,
    p_bc_customer_id: bcCustomer.customerId,
    p_linked_via: linkedVia,
    p_ip_address: getClientIp(requestHeaders),
    p_user_agent: requestHeaders.get('user-agent'),
  });

  if (error) {
    console.error('[link-telegram] link RPC failed:', error);
    return {
      kind: 'error',
      title: 'Link failed',
      message: 'We could not save the link. Please try again.',
      status: 500,
    };
  }

  const row: LinkRpcRow | null = Array.isArray(data)
    ? ((data[0] as LinkRpcRow | undefined) ?? null)
    : ((data as LinkRpcRow | null) ?? null);

  if (!row) {
    console.error('[link-telegram] link RPC returned no row');
    return {
      kind: 'error',
      title: 'Link failed',
      message: 'We could not save the link. Please try again.',
      status: 500,
    };
  }

  if (!row.ok) {
    if (row.reason) {
      const conflict = conflictMessage(row.reason);
      return { kind: 'error', ...conflict };
    }
    return {
      kind: 'error',
      title: 'Link failed',
      message: 'We could not complete the link. Please try again.',
      status: 500,
    };
  }

  return { kind: 'redirect', url: LINK_TELEGRAM_BOT_REDIRECT };
}
