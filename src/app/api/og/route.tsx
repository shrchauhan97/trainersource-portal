import { ImageResponse } from 'next/og';
import { createClient } from '@supabase/supabase-js';

// Edge runtime — ImageResponse is optimized for it (smaller cold start,
// streaming PNG response). Satori (the renderer) only supports flexbox +
// inline styles, no Tailwind, no CSS imports.
export const runtime = 'edge';

const CODE_RE = /^[A-Z0-9-]{4,40}$/;

// Edge runtime can't share the cached service client from
// @/lib/supabase/service (that file uses module-level caching that doesn't
// reset between cold starts in a way that's edge-safe). Build a fresh client
// per request — the request count is naturally bounded by social-platform
// caching of the OG image.
function buildSupabase() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function resolveTrainerName(rawCode: string | null): Promise<string | null> {
  if (!rawCode) return null;
  const code = rawCode.trim().toUpperCase();
  if (!CODE_RE.test(code)) return null;

  const supabase = buildSupabase();
  if (!supabase) return null;

  const { data: accessCode } = await supabase
    .from('access_codes')
    .select('status, expires_at, trainer_id')
    .eq('code', code)
    .maybeSingle<{ status: string; expires_at: string; trainer_id: string | null }>();

  if (!accessCode || accessCode.status !== 'active') return null;
  if (new Date(accessCode.expires_at) <= new Date()) return null;
  if (!accessCode.trainer_id) return null;

  const { data: trainer } = await supabase
    .from('trainers')
    .select('name')
    .eq('id', accessCode.trainer_id)
    .maybeSingle<{ name: string }>();

  return trainer?.name?.trim() || null;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const trainerName = await resolveTrainerName(code);

    // Hyrox Orange brand accent + dark backdrop reads well in social feeds
    // (tested mentally against WhatsApp, Telegram, X, Discord previews).
    const headline = trainerName
      ? trainerName
      : 'TrainerSource';
    const subhead = trainerName
      ? 'Verified TrainerSource referral'
      : 'Helping professional trainers discover professional products';

    const image = new ImageResponse(
      (
        <div
          style={{
            height: '100%',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: '#0E1418',
            color: '#FFFFFF',
            position: 'relative',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}
        >
          {/* Top accent stripe — Hyrox Orange brand color. */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 16,
              backgroundColor: '#FF5722',
              display: 'flex',
            }}
          />

          {/* Brand chip */}
          <div
            style={{
              display: 'flex',
              padding: '64px 80px 0 80px',
            }}
          >
            <div
              style={{
                display: 'flex',
                padding: '8px 14px',
                backgroundColor: '#FF5722',
                color: '#FFFFFF',
                fontSize: 18,
                fontWeight: 800,
                letterSpacing: 1.5,
                textTransform: 'uppercase',
              }}
            >
              TS · TRAINERSOURCE
            </div>
          </div>

          {/* Main content block — left-aligned, big trainer name, subhead under */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              flex: 1,
              padding: '48px 80px 40px 80px',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                fontSize: 28,
                fontWeight: 700,
                color: '#FF5722',
                letterSpacing: 4,
                textTransform: 'uppercase',
                marginBottom: 24,
                display: 'flex',
              }}
            >
              {trainerName ? 'Invited you' : 'Welcome'}
            </div>
            <div
              style={{
                fontSize: trainerName && headline.length > 22 ? 88 : 112,
                fontWeight: 900,
                lineHeight: 1.05,
                color: '#FFFFFF',
                letterSpacing: -2,
                marginBottom: 32,
                display: 'flex',
              }}
            >
              {headline}
            </div>
            <div
              style={{
                fontSize: 32,
                fontWeight: 500,
                color: '#9DB2C2',
                lineHeight: 1.3,
                display: 'flex',
              }}
            >
              {subhead}
            </div>
          </div>

          {/* Footer — domain + disclaimer */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '32px 80px 56px 80px',
              borderTop: '1px solid #1F2A33',
            }}
          >
            <div
              style={{
                fontSize: 26,
                fontWeight: 700,
                color: '#FFFFFF',
                display: 'flex',
              }}
            >
              ultimate-peptides.com
            </div>
            <div
              style={{
                fontSize: 18,
                color: '#6B7C89',
                display: 'flex',
              }}
            >
              Research use only · 21+
            </div>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
        headers: {
          // Allow social platforms (and our own CDN) to cache for 5 minutes.
          // Long enough to absorb the typical share-storm; short enough that
          // a corrected trainer name propagates in a reasonable window.
          'Cache-Control': 'public, max-age=300, s-maxage=300',
        },
      },
    );

    return image;
  } catch (err) {
    console.error('[og] failed to generate image', err);
    return new Response('failed to generate image', { status: 500 });
  }
}
