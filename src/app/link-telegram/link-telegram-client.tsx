'use client';

import { TelegramLoginWidget } from '@/components/TelegramLoginWidget';

const BOT_USERNAME =
  process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? 'peptidebutlerbot';

const STORE_URL =
  process.env.NEXT_PUBLIC_BC_STORE_URL ?? 'https://ultimate-peptides.com';

export function LinkTelegramClient() {
  return (
    <div className="mx-auto max-w-md rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h1 className="text-xl font-semibold text-gray-900">Link Telegram</h1>
      <p className="mt-2 text-sm text-gray-600">
        Connect your Telegram account to your Ultimate Peptides store account so
        you can reorder from{' '}
        <span className="font-mono">@peptidebutlerbot</span>.
      </p>
      <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-gray-700">
        <li>
          <a
            href={`${STORE_URL}/login.php`}
            className="font-medium text-blue-600 underline"
          >
            Log into the store
          </a>{' '}
          in this browser.
        </li>
        <li>Return to this page and sign in with Telegram below.</li>
      </ol>
      <div className="mt-6 flex justify-center">
        <TelegramLoginWidget
          botUsername={BOT_USERNAME}
          authCallbackUrl="/link-telegram"
          size="large"
        />
      </div>
    </div>
  );
}
