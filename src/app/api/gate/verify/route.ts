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

function corsHeaders(origin: string | null) {
  const responseOrigin = origin && allowedOrigins.has(origin) ? origin : fallbackOrigin;
  return {
    'Access-Control-Allow-Origin': responseOrigin,
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
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

// GET /api/gate/verify?bc_customer_id=31
// Used by the BC storefront gate script to refuse suspended/removed customers
// at checkout. Unauthenticated — only returns a boolean + coarse reason,
// no PII, no side effects. Fail-open semantics are enforced client-side
// (network errors let the customer through; only an explicit `allowed:false`
// blocks checkout).
export async function GET(req: Request) {
  const origin = req.headers.get('origin');

  const url = new URL(req.url);
  const bcId = url.searchParams.get('bc_customer_id');
  if (!bcId) {
    return json({ allowed: false, reason: 'no-id' }, 200, origin);
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('customers')
    .select('status')
    .eq('bigcommerce_customer_id', bcId)
    .maybeSingle<{ status: string }>();

  if (error) {
    console.error('gate verify lookup failed', error);
    return json({ allowed: false, reason: 'db-error' }, 200, origin);
  }
  if (!data) {
    // Customer not in our DB — let them through. The access-code gate is
    // the source of truth for first-time users; we only refuse customers
    // we know have been suspended/removed.
    return json({ allowed: true, reason: 'not-found' }, 200, origin);
  }
  if (data.status !== 'active') {
    return json({ allowed: false, reason: data.status }, 200, origin);
  }
  return json({ allowed: true }, 200, origin);
}
