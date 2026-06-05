import { createServiceClient } from '@/lib/supabase/service';
import {
  createBigCommerceCustomer,
  getBigCommerceCustomerByEmail,
} from '@/lib/bigcommerce';
import { mintSessionToken } from '@/lib/session-token';
import { sendEmail, newClientJoinedEmail } from '@/lib/email';
import type { Trainer } from '@/lib/types';

// Best-effort trainer notification when their code is consumed. Never throws —
// the parent request must succeed even if Resend is down. Returns void.
async function notifyTrainerOfNewClient(params: {
  supabase: ReturnType<typeof createServiceClient>;
  trainerId: string | null;
  clientName: string;
  clientEmail: string;
  clientCity: string;
  clientCountry: string;
}) {
  if (!params.trainerId) return;
  try {
    const { data: trainer } = await params.supabase
      .from('trainers')
      .select('email, name')
      .eq('id', params.trainerId)
      .maybeSingle<Pick<Trainer, 'email' | 'name'>>();
    if (!trainer?.email) return;
    const { subject, html } = newClientJoinedEmail({
      trainerName: trainer.name ?? 'there',
      clientName: params.clientName,
      clientEmail: params.clientEmail,
      clientCity: params.clientCity,
      clientCountry: params.clientCountry,
    });
    await sendEmail({ to: trainer.email, subject, html });
  } catch (err) {
    console.error('[notify] new-client email failed', err);
  }
}

const allowedOrigins = new Set(
  (process.env.ACCESS_GATE_ALLOWED_ORIGINS ?? 'https://ultimate-peptides.com')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
);
const fallbackOrigin = 'https://ultimate-peptides.com';

// In-memory token-bucket rate limiter (per client IP). Mirrors the pattern in
// /api/gate/verify. Necessary because the only existing brake on rapid
// submission was the `FAILED_ATTEMPT_LOCK_MS = 3000` cooldown in
// up-bc-cdn/bc-paste.js — that runs entirely client-side and is bypassed by
// any non-browser client (curl, scripted attacker, devtools localStorage
// clear). Without a server-side limiter the route is a brute-force oracle
// for the `[A-Z0-9-]{4,40}` code space: each call returns a specific
// `reason` distinguishing `not_found` / `consumed` / `expired` / `revoked`,
// which lets an attacker enumerate the active-code set at machine speed.
//
// 30 req/min/IP is the same shape as /api/gate/verify and is well above any
// legitimate caller (the BC theme submits exactly once per gate completion,
// with 3s between retries → ~20 req/min worst case). Shared NAT clients
// (corporate proxy, school WiFi) might burst above 30 if many customers
// onboard simultaneously; that is acceptable because the customer-facing
// failure mode (429 with Retry-After) is the same shape the storefront
// gate already renders on the client-side cooldown — UX continuity holds.
//
// Limitation: process-local Map only. On serverless deploys each cold
// instance has its own counter, so a determined attacker can scale across
// instances. Acceptable trade-off vs adding a Redis dependency; the floor
// raises substantially without that complexity. Revisit if traffic
// justifies a shared store.
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

// Server-side country allowlist (review finding H1). The storefront form has
// a dropdown, but the endpoint is reachable directly from any client so the
// client-side list alone is not a security control. Default matches the
// storefront's COUNTRIES array; override via env when launching into new
// markets. Comparison is case-insensitive and trims whitespace to match the
// normalized `country` value we compute below.
const allowedCountries = (process.env.ACCESS_GATE_ALLOWED_COUNTRIES ?? 'Singapore,UAE,Japan,United States')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

// Code shape — matches Fix-A's `invalid_format` contract. Same regex is
// duplicated inside the validate_and_consume_code RPC for defence in depth,
// but doing it here lets us short-circuit without a DB round trip and lets
// the gate UI show a `code_format_error` style message.
const CODE_REGEX = /^[A-Z0-9-]{4,40}$/;

// Failure reasons the route may return. MUST stay aligned with the
// FAILED_MESSAGES map in up-bc-cdn/bc-paste.js (Fix-A surface).
type ValidationReason =
  | 'not_found'
  | 'consumed'
  | 'expired'
  | 'revoked'
  | 'country_blocked'
  | 'invalid_format'
  | 'invalid_input'
  | 'rate_limited'
  | 'server_error';

type ValidateCodeBody = {
  code?: string;
  email?: string;
  name?: string;
  country?: string;
  city?: string;
};

// Shape returned by validate_and_consume_code (see migrations/2026-05-14-validate-consume-atomic.sql)
type ValidateRpcRow = {
  ok: boolean;
  reason: ValidationReason | null;
  access_code_id: string | null;
  customer_id: string | null;
  trainer_id: string | null;
};

function splitCustomerName(name: string) {
  const trimmedName = name.trim();
  const [firstName, ...rest] = trimmedName.split(/\s+/);
  const lastName = rest.join(' ').trim();

  return {
    firstName: firstName || 'Customer',
    lastName: lastName || firstName || 'Customer',
  };
}

async function ensureBigCommerceCustomer(params: {
  supabase: ReturnType<typeof createServiceClient>;
  customerId: string;
  email: string;
  name: string;
  currentBigCommerceCustomerId?: string | null;
}) {
  if (params.currentBigCommerceCustomerId) {
    return Number(params.currentBigCommerceCustomerId);
  }

  const existingBigCommerceCustomer = await getBigCommerceCustomerByEmail(params.email);
  const { firstName, lastName } = splitCustomerName(params.name);
  const bigCommerceCustomer =
    existingBigCommerceCustomer ??
    (await createBigCommerceCustomer({
      email: params.email,
      first_name: firstName,
      last_name: lastName,
    }));

  const { error: updateBigCommerceCustomerError } = await params.supabase
    .from('customers')
    .update({ bigcommerce_customer_id: String(bigCommerceCustomer.id) })
    .eq('id', params.customerId);

  if (updateBigCommerceCustomerError) {
    throw updateBigCommerceCustomerError;
  }

  return bigCommerceCustomer.id;
}

function corsHeaders(origin: string | null) {
  const responseOrigin = origin && allowedOrigins.has(origin) ? origin : fallbackOrigin;

  return {
    'Access-Control-Allow-Origin': responseOrigin,
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

function json(body: Record<string, unknown>, status = 200, origin: string | null = null) {
  return Response.json(body, {
    status,
    headers: corsHeaders(origin),
  });
}

// Extract a plausible client IP from the proxy headers Vercel / typical CDNs
// add. Returns null when nothing useful is present.
function getClientIp(request: Request): string | null {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return (
    request.headers.get('x-real-ip') ??
    request.headers.get('cf-connecting-ip') ??
    null
  );
}

// Single audit-log writer. Never throws — a failed audit insert must NOT
// fail the gate request itself.
async function logAttempt(
  supabase: ReturnType<typeof createServiceClient>,
  row: {
    code: string;
    access_code_id: string | null;
    trainer_id: string | null;
    email: string | null;
    name: string | null;
    country: string | null;
    city: string | null;
    ip_address: string | null;
    user_agent: string | null;
    outcome: string;
    reason_detail: string | null;
    duration_ms: number;
  },
): Promise<void> {
  try {
    const { error } = await supabase.from('code_attempts').insert(row);
    if (error) {
      console.error('[code_attempts] insert failed', error);
    }
  } catch (err) {
    console.error('[code_attempts] insert threw', err);
  }
}

export async function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request.headers.get('origin')),
  });
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  const t0 = Date.now();
  const userAgent = request.headers.get('user-agent');
  const ipAddress = getClientIp(request);

  // Server-side rate-limit BEFORE the body parse + RPC + audit insert. Three
  // reasons it has to be this early:
  //   1. The audit insert below would amplify a brute-force burst into a
  //      DB write per attempt; bouncing here keeps the audit table clean.
  //   2. Body parse + the RPC call together are the expensive part of the
  //      route; shedding load on a 429 is the cheap thing to do.
  //   3. Returning the limited response BEFORE any code-shape feedback means
  //      we don't even leak whether the rate-limit kicked in on a
  //      well-formed vs malformed payload.
  // `getClientIp` can return null on edge cases (missing proxy headers); we
  // collapse those into a shared `unknown` bucket so every truly-unknown
  // caller competes for the same 30-req/min slot.
  const rateKey = ipAddress ?? 'unknown';
  const rl = rateLimitCheck(rateKey, Date.now());
  if (!rl.ok) {
    return new Response(
      JSON.stringify({ valid: false, reason: 'rate_limited' satisfies ValidationReason }),
      {
        status: 429,
        headers: {
          ...corsHeaders(origin),
          'Content-Type': 'application/json',
          'Retry-After': String(rl.retryAfter),
        },
      },
    );
  }

  // Best-effort body parse — failure here means we can't even log a useful
  // audit row. Treat as invalid_input.
  let body: ValidateCodeBody = {};
  try {
    body = (await request.json()) as ValidateCodeBody;
  } catch {
    // Fall through to the validation block which will emit invalid_input.
  }

  const code = body.code?.trim().toUpperCase() ?? '';
  const email = body.email?.trim().toLowerCase() ?? '';
  const name = body.name?.trim() ?? '';
  const country = body.country?.trim() ?? '';
  const city = body.city?.trim() ?? '';

  // We need a supabase client for both the RPC AND the audit insert. If the
  // env is misconfigured we still respond gracefully (and log to console).
  let supabase: ReturnType<typeof createServiceClient>;
  try {
    supabase = createServiceClient();
  } catch (err) {
    console.error('[validate] createServiceClient failed', err);
    return json({ valid: false, reason: 'server_error' satisfies ValidationReason }, 200, origin);
  }

  // Helper to finalise a request with a single audit-row write + JSON response.
  const finish = async (
    outcome: 'success' | ValidationReason,
    extra: {
      access_code_id?: string | null;
      trainer_id?: string | null;
      reason_detail?: string | null;
      response: Record<string, unknown>;
    },
  ) => {
    const duration = Date.now() - t0;
    await logAttempt(supabase, {
      code: code || (body.code ?? ''),
      access_code_id: extra.access_code_id ?? null,
      trainer_id: extra.trainer_id ?? null,
      email: email || null,
      name: name || null,
      country: country || null,
      city: city || null,
      ip_address: ipAddress,
      user_agent: userAgent,
      outcome,
      reason_detail: extra.reason_detail ?? null,
      duration_ms: duration,
    });
    return json(extra.response, 200, origin);
  };

  try {
    // 1. TS-side fast-fail on format. The RPC duplicates these checks for
    //    defence in depth, but bouncing here saves a DB round trip and lets
    //    us return a more precise reason than the RPC could.
    if (!code) {
      return finish('invalid_input', {
        response: { valid: false, reason: 'invalid_input' satisfies ValidationReason },
      });
    }

    if (!CODE_REGEX.test(code)) {
      return finish('invalid_format', {
        response: { valid: false, reason: 'invalid_format' satisfies ValidationReason },
      });
    }

    if (!email || !name || !country || !city) {
      return finish('invalid_input', {
        response: { valid: false, reason: 'invalid_input' satisfies ValidationReason },
      });
    }

    // 2. Atomic gate transaction. This RPC does: SELECT...FOR UPDATE on the
    //    access_codes row, lifecycle checks, customers find-or-insert,
    //    access_codes UPDATE — all in one PL/pgSQL function body which
    //    Postgres runs as a single implicit transaction. On ANY internal
    //    error the function returns reason='server_error' and the code stays
    //    'active'. Kills the A4 consume-then-insert race permanently.
    const { data, error } = await supabase.rpc('validate_and_consume_code', {
      p_code: code,
      p_name: name,
      p_email: email,
      p_country: country,
      p_city: city,
      p_allowed_countries: allowedCountries,
    });

    if (error) {
      console.error('[validate] RPC error', error);
      return finish('server_error', {
        reason_detail: error.message ?? String(error),
        response: { valid: false, reason: 'server_error' satisfies ValidationReason },
      });
    }

    // PostgREST returns the SETOF row as either an array of one row or the
    // row itself depending on `returns()` shape. Handle both.
    const row: ValidateRpcRow | null = Array.isArray(data)
      ? (data[0] as ValidateRpcRow | undefined) ?? null
      : ((data as ValidateRpcRow | null) ?? null);

    if (!row) {
      return finish('server_error', {
        reason_detail: 'RPC returned no rows',
        response: { valid: false, reason: 'server_error' satisfies ValidationReason },
      });
    }

    if (!row.ok) {
      const reason: ValidationReason = (row.reason ?? 'server_error') as ValidationReason;
      return finish(reason, {
        access_code_id: row.access_code_id,
        trainer_id: row.trainer_id,
        response: { valid: false, reason },
      });
    }

    if (!row.customer_id || !row.access_code_id) {
      // Defensive — RPC contract says these are non-null on ok=true.
      return finish('server_error', {
        reason_detail: 'RPC ok=true but missing customer_id/access_code_id',
        response: { valid: false, reason: 'server_error' satisfies ValidationReason },
      });
    }

    // 3. Best-effort BigCommerce sync. Failures here do NOT roll back the
    //    consume — the customer is in our DB and the code is consumed; BC
    //    can be reconciled by the webhook path later.
    let bigCommerceCustomerId: number | null = null;
    try {
      const { data: existing } = await supabase
        .from('customers')
        .select('bigcommerce_customer_id')
        .eq('id', row.customer_id)
        .maybeSingle<{ bigcommerce_customer_id: string | null }>();

      bigCommerceCustomerId = await ensureBigCommerceCustomer({
        supabase,
        customerId: row.customer_id,
        email,
        name,
        currentBigCommerceCustomerId: existing?.bigcommerce_customer_id ?? null,
      });
    } catch (bigCommerceError) {
      console.error('BigCommerce customer sync failed', bigCommerceError);
    }

    // 4. Best-effort trainer notification. Same idempotency story: if Resend
    //    is down, the customer is already attributed and the trainer can
    //    still see the new client in the portal.
    await notifyTrainerOfNewClient({
      supabase,
      trainerId: row.trainer_id,
      clientName: name,
      clientEmail: email,
      clientCity: city,
      clientCountry: country,
    });

    return finish('success', {
      access_code_id: row.access_code_id,
      trainer_id: row.trainer_id,
      response: {
        valid: true,
        customer_id: row.customer_id,
        bc_customer_id: bigCommerceCustomerId,
        session_token: mintSessionToken(row.customer_id),
      },
    });
  } catch (error) {
    // Unhandled — log + audit + graceful 200 so the gate UI sees a parseable
    // reason instead of an opaque non-2xx.
    console.error('[validate] unhandled error', error);
    return finish('server_error', {
      reason_detail: error instanceof Error ? error.message : String(error),
      response: { valid: false, reason: 'server_error' satisfies ValidationReason },
    });
  }
}
