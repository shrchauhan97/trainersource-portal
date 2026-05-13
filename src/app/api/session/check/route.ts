import { createClient } from '@supabase/supabase-js';
import { verifySessionToken } from '@/lib/session-token';

const allowedOrigins = new Set(
  (process.env.ACCESS_GATE_ALLOWED_ORIGINS ?? 'https://ultimate-peptides.com')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
);
const fallbackOrigin = 'https://ultimate-peptides.com';

type CheckBody = {
  session_token?: unknown;
};

function corsHeaders(origin: string | null) {
  const responseOrigin = origin && allowedOrigins.has(origin) ? origin : fallbackOrigin;
  return {
    'Access-Control-Allow-Origin': responseOrigin,
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
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

  if (origin && !allowedOrigins.has(origin)) {
    return json({ valid: false, reason: 'origin_not_allowed' }, 403, origin);
  }

  let body: CheckBody;
  try {
    body = (await request.json()) as CheckBody;
  } catch {
    return json({ valid: false, reason: 'invalid_payload' }, 400, origin);
  }

  const verified = verifySessionToken(body?.session_token);
  if (!verified) {
    return json({ valid: false, reason: 'invalid_or_expired' }, 200, origin);
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing');
    return json({ valid: false, reason: 'server_error' }, 500, origin);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Pull `status` alongside `id` so a customer who's been suspended/removed
  // post-mint can't keep riding a still-fresh HMAC token (TTL is 30d). The
  // BC storefront gate-script parses `valid:false` responses and calls
  // `clearBypassMarkers()`, which wipes the localStorage token + customer
  // ID — so returning 200 + `valid:false` is the contract that actually
  // revokes client state. Returning 401 would route through the client's
  // `if (!response.ok)` branch and leave the stale token in place.
  const { data: customer, error } = await supabase
    .from('customers')
    .select('id, status')
    .eq('id', verified.customerId)
    .maybeSingle<{ id: string; status: string }>();

  if (error) {
    console.error('session check customer lookup failed', error);
    return json({ valid: false, reason: 'server_error' }, 500, origin);
  }

  if (!customer) {
    return json({ valid: false, reason: 'customer_not_found' }, 200, origin);
  }

  if (customer.status !== 'active') {
    // Mirrors /api/gate/verify: a non-active customers row means the admin
    // has suspended or removed this account. Surface the lifecycle state so
    // ops can correlate logs; the client-side `clearBypassMarkers()` runs
    // on any `valid:false` reply, so the stale localStorage token is wiped.
    console.info('session check rejected: non-active customer', {
      customerId: verified.customerId,
      status: customer.status,
    });
    return json({ valid: false, reason: 'suspended' }, 200, origin);
  }

  return json({ valid: true }, 200, origin);
}
