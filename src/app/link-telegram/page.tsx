import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  handleLinkTelegramCallback,
  isTelegramCallback,
} from '@/lib/link-telegram-handler';
import { LinkTelegramClient } from './link-telegram-client';

export const metadata: Metadata = {
  title: 'Link Telegram',
  description: 'Link your Telegram account to your Ultimate Peptides store account.',
  robots: { index: false, follow: false },
};

type LinkTelegramPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function buildCookieHeader(
  cookieStore: Awaited<ReturnType<typeof cookies>>,
): string | null {
  const all = cookieStore.getAll();
  if (all.length === 0) return null;
  return all.map((c) => `${c.name}=${c.value}`).join('; ');
}

export default async function LinkTelegramPage({ searchParams }: LinkTelegramPageProps) {
  const params = await searchParams;

  if (!isTelegramCallback(params)) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <LinkTelegramClient />
      </main>
    );
  }

  const cookieStore = await cookies();
  const requestHeaders = await headers();
  const result = await handleLinkTelegramCallback(
    params,
    buildCookieHeader(cookieStore),
    requestHeaders,
  );

  if (result.kind === 'redirect') {
    redirect(result.url);
  }

  if (result.kind === 'error') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <div className="mx-auto max-w-md rounded-lg border border-red-200 bg-red-50 p-6">
          <h1 className="text-lg font-semibold text-red-900">{result.title}</h1>
          <p className="mt-2 text-sm text-red-800">{result.message}</p>
          <p className="mt-4 text-sm">
            <a href="/link-telegram" className="font-medium text-blue-600 underline">
              Try again
            </a>
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <LinkTelegramClient />
    </main>
  );
}
