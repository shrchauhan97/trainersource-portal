import crypto from 'node:crypto';

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

export const runtime = 'nodejs';

// CORS allow-list — mirrors /api/session/check so the BC storefront can call
// this cross-origin from https://ultimate-peptides.com.
const allowedOrigins = new Set(
  (process.env.ACCESS_GATE_ALLOWED_ORIGINS ?? 'https://ultimate-peptides.com')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
);
const fallbackOrigin = 'https://ultimate-peptides.com';

// In-memory token-bucket rate limiter (per client IP).
//
// Worth its weight: this route returns service-role DB results and was
// previously unauthenticated. Even with the Origin gate + opaque responses
// the rate limiter blunts the only remaining attack — a hostile script
// running inside a compromised storefront browser tab enumerating
// `bc_customer_id` values to map active customers. 30 req/min/IP is
// generous for a real shopper (the BC theme fires this exactly once per
// page load) but kills 1000-req/s enumeration cold.
//
// Limitation: process-local Map only. On Vercel/serverless, each cold
// instance has its own counter, so a determined attacker can scale across
// instances. Acceptable for now — combined with Origin enforcement and the
// opaque response shape, this raises the bar substantially without a
// Redis dependency. Upgrade to a shared store when traffic justifies it.
const RATE_LIMIT_MAX = 30; // requests
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 60s

type IpBucket = { count: number; resetAt: number };
const ipBuckets = new Map<string, IpBucket>();

function rateLimitCheck(ip: string, now: number): { ok: boolean; retryAfter: number } {
  const bucket = ipBuckets.get(ip);
  if (!bucket || bucket.resetAt <= now) {
    ipBuckets.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { ok: true, retryAfter: 0 };
  }
  if (bucket.count >= RATE_LIMIT_MAX) {
    return { ok: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  bucket.count += 1;
  return { ok: true, retryAfter: 0 };
}

// Test hook — Map mutations don't otherwise leak between cases.
export function __resetRateLimit(): void {
  ipBuckets.clear();
}

function getClientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return (
    request.headers.get('x-real-ip') ??
    request.headers.get('cf-connecting-ip') ??
    'unknown'
  );
}

function timingSafeStringEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function corsHeaders(origin: string | null) {
  // Only echo back origins we explicitly allow. Anything else gets the
  // canonical storefront origin — browsers will then block the cross-origin
  // response, which is the desired UX (storefront-script-from-evil-site fails
  // silently in the browser).
  const responseOrigin = origin && allowedOrigins.has(origin) ? origin : fallbackOrigin;
  return {
    'Access-Control-Allow-Origin': responseOrigin,
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Gate-Verify-Secret',
  };
}

function json(body: Record<string, unknown>, status: number, origin: string | null) {
  return NextResponse.json(body, { status, headers: corsHeaders(origin) });
}

export async function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request.headers.get('origin')),
  });
}

// Parse a Referer URL down to an `origin` (scheme://host[:port]) string. We
// fall back to null on any URL parse failure — a malformed Referer just means
// the Origin allow-list won't be satisfied.
function refererOrigin(referer: string | null): string | null {
  if (!referer) return null;
  try {
    const u = new URL(referer);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

// GET /api/gate/verify?bc_customer_id=31
//
// Tells the BC storefront whether to refuse checkout for a given BC customer
// ID. Three authentication paths, checked in order:
//
//   1. **Shared-secret bypass** (`X-Gate-Verify-Secret` header). For
//      server-to-server callers (e2e smoke, ops scripts, future BC webhook
//      glue) that legitimately have no Origin header. When this is used we
//      preserve the verbose `{ allowed, reason }` shape so smoke scripts can
//      assert on the underlying status. Compared in constant time. The env
//      var `GATE_VERIFY_SHARED_SECRET` must be set; absent env = bypass
//      disabled entirely.
//
//   2. **Origin / Referer allow-list** (browser callers). The BC theme JS
//      ships in `up-bc-cdn/bc-paste.js` and runs at `ultimate-peptides.com`,
//      so the only legitimate browser caller carries one of the configured
//      allow-list origins. Anything else → 401. Note: a determined attacker
//      can forge `Origin` on a non-browser HTTP client; this gate is paired
//      with the rate limiter below for that case, and the response shape is
//      opaque so even successful enumeration leaks no per-customer status.
//
//   3. **Rate limit** (per client IP, in-memory token bucket). 30 req/min
//      caps enumeration speed once the Origin gate is passed (either
//      legitimately, or via spoofed Origin from a scripted client). 429 on
//      exhaustion.
//
// On the browser path the response body is intentionally opaque —
// `{ allowed: true | false }` only, no `reason`. The previous behaviour
// (returning `reason: 'suspended' | 'removed' | 'not-found'`) let any caller
// distinguish "customer not in our DB" from "customer suspended" from
// "customer removed", which made the endpoint a free enumeration oracle for
// the active-customer ID space and the suspended sub-set. Collapsing the
// shape closes that leak. The `bc-paste.js` lifecycle banner only needs the
// allow/deny bit; it falls back to a generic "no longer active" copy when
// `reason` is absent.
export async function GET(req: Request) {
  const origin = req.headers.get('origin');
  const referer = req.headers.get('referer');
  const ip = getClientIp(req);
  const now = Date.now();

  // --- Path 1: shared-secret bypass ---
  const expectedSecret = process.env.GATE_VERIFY_SHARED_SECRET;
  const providedSecret = req.headers.get('x-gate-verify-secret');
  let secretBypass = false;
  if (expectedSecret) {
    if (providedSecret) {
      if (!timingSafeStringEqual(providedSecret, expectedSecret)) {
        // Header present but wrong: explicit auth failure. Do NOT fall through
        // to the Origin path — a bad secret is an intentional unauthenticated
        // probe and should never be coerced into "look like a browser" success.
        return json({ allowed: false, reason: 'unauthorized' }, 401, origin);
      }
      secretBypass = true;
    }
  }

  // --- Path 2: Origin / Referer allow-list (when no secret bypass) ---
  if (!secretBypass) {
    // Strict: we require Origin OR a Referer whose origin is in the
    // allow-list. Cross-origin browser fetches always carry Origin; the BC
    // theme storefront fetch sets `credentials:'omit'` but the browser
    // still attaches Origin automatically.
    const refOrigin = refererOrigin(referer);
    const matchedOrigin =
      (origin && allowedOrigins.has(origin)) ||
      (refOrigin !== null && allowedOrigins.has(refOrigin));
    if (!matchedOrigin) {
      return json({ allowed: false, reason: 'unauthorized' }, 401, origin);
    }
  }

  // --- Path 3: rate limit (always, even on the secret bypass — a leaked
  // secret deserves the same speed bump). Keyed per client IP.
  const rl = rateLimitCheck(ip, now);
  if (!rl.ok) {
    return NextResponse.json(
      { allowed: false, reason: 'rate_limited' },
      {
        status: 429,
        headers: {
          ...corsHeaders(origin),
          'Retry-After': String(rl.retryAfter),
        },
      },
    );
  }

  // --- DB lookup + response shaping ---
  const url = new URL(req.url);
  const bcId = url.searchParams.get('bc_customer_id');
  if (!bcId) {
    // Opaque on the browser path; verbose on the secret path so the smoke
    // script can assert "no-id" if it ever forgets to pass the param.
    return secretBypass
      ? json({ allowed: false, reason: 'no-id' }, 200, origin)
      : json({ allowed: true }, 200, origin);
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('customers')
    .select('status')
    .eq('bigcommerce_customer_id', bcId)
    .maybeSingle<{ status: string }>();

  if (error) {
    console.error('gate verify lookup failed', error);
    // Fail-open semantics intentionally retained (see header doc).
    return secretBypass
      ? json({ allowed: false, reason: 'db-error' }, 200, origin)
      : json({ allowed: true }, 200, origin);
  }

  // Compute the underlying allow bit, then shape the response by path.
  //   - not in DB: allowed = true (the access-code gate is the source of
  //     truth for first-time customers)
  //   - status === 'active': allowed = true
  //   - any other status (suspended / removed): allowed = false
  const allowed = !data || data.status === 'active';
  if (secretBypass) {
    if (!data) return json({ allowed: true, reason: 'not-found' }, 200, origin);
    if (data.status !== 'active') return json({ allowed: false, reason: data.status }, 200, origin);
    return json({ allowed: true }, 200, origin);
  }
  // Browser path: opaque shape only. `not-found` and `suspended` are
  // indistinguishable from `removed` is indistinguishable from `active`
  // (when `allowed:true`). The only bit we leak is the one the BC theme
  // strictly needs: should this customer be allowed to check out.
  return json({ allowed }, 200, origin);
}
