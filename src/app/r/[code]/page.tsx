import type { Metadata } from 'next';
import Link from 'next/link';
import { createServiceClient } from '@/lib/supabase/service';
import type { AccessCode, Trainer } from '@/lib/types';

// Force dynamic — the page resolves a code via DB lookup on every request.
// Without this, Next would try to prerender at build time when the trainer/code
// data isn't available.
export const dynamic = 'force-dynamic';

const CODE_RE = /^[A-Z0-9-]{4,40}$/;
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://trainer-source.com';
const UP_BASE = process.env.NEXT_PUBLIC_UP_BASE_URL ?? 'https://ultimate-peptides.com';

type Props = {
  params: Promise<{ code: string }>;
};

type ResolvedReferral =
  | { valid: true; code: string; trainerName: string; trainerFirstName: string }
  | { valid: false };

// Server-side resolve — runs in the page render AND in generateMetadata.
// We rely on Next's request memoization (and React `cache` if needed) so the
// double-call on the same request is cheap. For now the queries are fast
// enough that two round-trips per request is acceptable.
async function resolveReferral(rawCode: string): Promise<ResolvedReferral> {
  const code = rawCode.trim().toUpperCase();
  if (!CODE_RE.test(code)) {
    return { valid: false };
  }

  const supabase = createServiceClient();
  const { data: accessCode } = await supabase
    .from('access_codes')
    .select('id, code, status, expires_at, trainer_id')
    .eq('code', code)
    .maybeSingle<Pick<AccessCode, 'id' | 'code' | 'status' | 'expires_at' | 'trainer_id'>>();

  if (!accessCode) return { valid: false };
  if (accessCode.status !== 'active') return { valid: false };
  if (new Date(accessCode.expires_at) <= new Date()) return { valid: false };
  if (!accessCode.trainer_id) return { valid: false };

  const { data: trainer } = await supabase
    .from('trainers')
    .select('name')
    .eq('id', accessCode.trainer_id)
    .maybeSingle<Pick<Trainer, 'name'>>();

  if (!trainer?.name) return { valid: false };

  const trainerFirstName = trainer.name.trim().split(/\s+/)[0] ?? trainer.name;

  return {
    valid: true,
    code,
    trainerName: trainer.name.trim(),
    trainerFirstName,
  };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code: rawCode } = await params;
  const referral = await resolveReferral(rawCode);

  // Use absolute URLs for OG/Twitter images so social platforms (which fetch
  // server-side without a base) can resolve them. Relative URLs work for some
  // crawlers but not all (Telegram in particular has been finicky).
  const ogImageUrl = referral.valid
    ? `${SITE_URL}/api/og?code=${encodeURIComponent(referral.code)}`
    : `${SITE_URL}/api/og`;

  const title = referral.valid
    ? `${referral.trainerFirstName} on TrainerSource`
    : 'TrainerSource';

  const description = referral.valid
    ? `${referral.trainerName} invited you to Ultimate Peptides — pure, tested, trusted research compounds. Use code ${referral.code} at checkout.`
    : 'TrainerSource — helping professional trainers discover professional products.';

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/r/${rawCode}`,
      siteName: 'TrainerSource',
      type: 'website',
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImageUrl],
    },
  };
}

export default async function ReferralPage({ params }: Props) {
  const { code: rawCode } = await params;
  const referral = await resolveReferral(rawCode);

  if (!referral.valid) {
    return (
      <main className="min-h-screen bg-[#f4faff] flex items-center justify-center px-6 py-24 font-body">
        <div className="max-w-xl w-full text-center">
          <div className="inline-block px-3 py-1 bg-[#41627b] text-white font-headline font-bold tracking-[0.05em] uppercase text-[11px] mb-6">
            TRAINERSOURCE
          </div>
          <h1 className="text-4xl md:text-5xl font-black font-display tracking-tight text-[#161c20] mb-6 leading-[1.1]">
            This referral link is no longer active.
          </h1>
          <p className="text-lg text-[#41627b] leading-relaxed mb-10">
            The code may have expired or been used. You can still browse Ultimate Peptides directly,
            or ask your trainer for a new code.
          </p>
          <Link
            href={UP_BASE}
            className="inline-block px-10 py-5 bg-[#FF5722] text-white font-headline font-bold text-[11px] uppercase tracking-[0.2em] rounded-sm hover:bg-[#E64A19] transition-all shadow-md"
          >
            VISIT ULTIMATE PEPTIDES
          </Link>
        </div>
      </main>
    );
  }

  // Canonical deep-link pattern: the BC storefront's gate-handler.js (already
  // deployed) reads `/code/<CODE>` and prefills the gate form. This is the
  // same pattern used by issue-code.ts and the QR code generator.
  const deepLink = `${UP_BASE}/code/${encodeURIComponent(referral.code)}`;

  return (
    <main className="min-h-screen bg-[#f4faff] font-body">
      {/* Hero — left-aligned brand chip + headline + CTA, mirrors the OUR
          MISSION block on the public landing page. */}
      <section className="px-6 md:px-12 py-20 md:py-28 max-w-5xl mx-auto">
        <div className="inline-block px-3 py-1 bg-[#FF5722] text-white font-headline font-bold tracking-[0.05em] uppercase text-[11px] mb-6">
          VERIFIED TRAINERSOURCE REFERRAL
        </div>
        <h1 className="text-5xl md:text-6xl font-black font-display tracking-tight text-[#161c20] mb-6 leading-[1.05]">
          {referral.trainerName} invited you to Ultimate Peptides.
        </h1>
        <p className="text-xl md:text-2xl text-[#41627b] font-body leading-relaxed mb-10 max-w-3xl">
          Pure, tested and trusted research compounds — delivered in three days. Your trainer earns a
          lifetime commission when you order with their code.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center mb-8">
          <Link
            href={deepLink}
            className="inline-block px-10 py-5 bg-[#FF5722] text-white font-headline font-bold text-[11px] uppercase tracking-[0.2em] rounded-sm hover:bg-[#E64A19] transition-all shadow-md"
          >
            CLAIM YOUR ACCESS
          </Link>
          <span className="text-sm text-[#41627b] font-mono">
            Code: <span className="font-bold text-[#161c20]">{referral.code}</span>
          </span>
        </div>
        <p className="text-xs text-slate-500 leading-relaxed max-w-2xl">
          All products referenced are intended for research purposes only. Not for human consumption.
          You must be 21 or older to access our products.
        </p>
      </section>

      {/* Secondary panel — what trainer-source actually is, low-key. */}
      <section className="bg-[#f0f4f8] px-6 md:px-12 py-16">
        <div className="max-w-5xl mx-auto">
          <span className="font-headline font-bold tracking-[0.05em] uppercase text-[11px] text-[#0b5800] block mb-4">
            ABOUT TRAINERSOURCE
          </span>
          <h2 className="text-3xl md:text-4xl font-extrabold font-display tracking-tight text-[#161c20] mb-6">
            Where trainers and clients meet quality.
          </h2>
          <p className="text-lg text-[#41627b] font-body leading-relaxed max-w-3xl mb-6">
            TrainerSource was founded in a Singapore gym in 2024 to ensure the trainers giving great
            advice are recognized in the economic loop. Every order placed with a trainer&apos;s code
            credits them — for life.
          </p>
          <Link
            href={SITE_URL}
            className="inline-flex items-center gap-2 border-b-2 border-[#671800] text-[#671800] font-bold text-sm tracking-tight pb-1 hover:opacity-70 transition-all"
          >
            Learn more about TrainerSource
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>

      <footer className="border-t border-gray-200 bg-gray-50 px-4 py-3 text-center">
        <p className="text-xs text-gray-500">
          © {new Date().getFullYear()} TrainerSource. All rights reserved.
        </p>
      </footer>
    </main>
  );
}
