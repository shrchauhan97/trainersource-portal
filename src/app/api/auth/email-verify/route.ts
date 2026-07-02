import { createClient } from '@supabase/supabase-js';
import { mintSessionToken } from '@/lib/session-token';

const allowedOrigins = new Set(
  (process.env.ACCESS_GATE_ALLOWED_ORIGINS ?? 'https://ultimate-peptides.com')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
);
const fallbackOrigin = 'https://ultimate-peptides.com';

// In-memory token-bucket rate limiter (per client IP). Uses the same pattern
// as /api/codes/validate and /api/gate/verify. 30 requests per minute per IP
// prevents brute-force enumeration of registered emails while still allowing
// legitimate returning customers to access the site quickly.
//
// Limitation: process-local Map only. On serverless deploys each cold
// instance has its own counter. Acceptable trade-off for email verification
// which is a read-only check (no code consumption, no BigCommerce writes).
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

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

type EmailVerifyBody = {
  email?: unknown;
};

function corsHeaders(origin: string | null) {
  const responseOrigin = origin && allowedOrigins.has(origin) ? origin : fallbackOrigin;
  return {
    'Access-Control-Allow-Origin': responseOrigin,
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, ngrok-skip-browser-warning',
  };
}

function json(body: Record<string, unknown>, status: number, origin: string | null) {
  return Response.json(body, { status, headers: corsHeaders(origin) });
}

export async function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request.headers.get('origin')),
  });
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin');

  // Extract client IP for rate limiting
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown';

  // Rate limit check
  const { ok: rateLimitOk, retryAfter } = rateLimitCheck(ip, Date.now());
  if (!rateLimitOk) {
    return new Response(
      JSON.stringify({ valid: false, reason: 'rate_limited' }),
      {
        status: 429,
        headers: {
          ...corsHeaders(origin),
          'Retry-After': String(retryAfter),
        },
      },
    );
  }

  // Validate origin
  if (origin && !allowedOrigins.has(origin)) {
    return json({ valid: false, reason: 'origin_not_allowed' }, 403, origin);
  }

  // Parse request body
  let body: EmailVerifyBody;
  try {
    body = (await request.json()) as EmailVerifyBody;
  } catch {
    return json({ valid: false, reason: 'invalid_payload' }, 400, origin);
  }

  // Validate email format
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!email || !isValidEmail(email)) {
    return json({ valid: false, reason: 'invalid_input' }, 400, origin);
  }

  // Check environment variables
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error('[email-verify] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing');
    return json({ valid: false, reason: 'server_error' }, 500, origin);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Look up customer by email
  const { data: customer, error } = await supabase
    .from('customers')
    .select('id, email, status')
    .eq('email', email)
    .maybeSingle<{ id: string; email: string; status: string }>();

  if (error) {
    console.error('[email-verify] customer lookup failed', { email, error });
    return json({ valid: false, reason: 'server_error' }, 500, origin);
  }

  // Customer not found
  if (!customer) {
    console.info('[email-verify] email not found', { email });
    return json({ valid: false, reason: 'not_found' }, 200, origin);
  }

  // Customer found but not active (suspended or removed)
  if (customer.status !== 'active') {
    console.info('[email-verify] non-active customer', {
      customerId: customer.id,
      email,
      status: customer.status,
    });
    return json({ valid: false, reason: 'suspended' }, 200, origin);
  }

  // Customer is active - mint a new session token
  const sessionToken = mintSessionToken(customer.id);

  console.info('[email-verify] success', {
    customerId: customer.id,
    email,
  });

  return json(
    {
      valid: true,
      session_token: sessionToken,
      customer_id: customer.id,
    },
    200,
    origin,
  );
}

// Simple email validation regex - matches the client-side validation
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
