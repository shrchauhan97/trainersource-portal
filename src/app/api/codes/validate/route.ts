import { createServiceClient } from '@/lib/supabase/service';
import {
  createBigCommerceCustomer,
  getBigCommerceCustomerByEmail,
} from '@/lib/bigcommerce';
import { mintSessionToken } from '@/lib/session-token';
import type { AccessCode, Customer } from '@/lib/types';

const allowedOrigins = new Set(
  (process.env.ACCESS_GATE_ALLOWED_ORIGINS ?? 'https://ultimate-peptides.com')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
);
const fallbackOrigin = 'https://ultimate-peptides.com';

// Server-side country allowlist (review finding H1). The storefront form has
// a dropdown, but the endpoint is reachable directly from any client so the
// client-side list alone is not a security control. Default matches the
// storefront's COUNTRIES array; override via env when launching into new
// markets. Comparison is case-insensitive and trims whitespace to match the
// normalized `country` value we compute below.
const allowedCountries = new Set(
  (process.env.ACCESS_GATE_ALLOWED_COUNTRIES ?? 'Singapore,UAE,Japan,United States')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean),
);

type ValidateCodeBody = {
  code?: string;
  email?: string;
  name?: string;
  country?: string;
  city?: string;
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

export async function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request.headers.get('origin')),
  });
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin');

  try {
    const body = (await request.json()) as ValidateCodeBody;
    const code = body.code?.trim().toUpperCase();
    const email = body.email?.trim().toLowerCase();
    const name = body.name?.trim();
    const country = body.country?.trim();
    const city = body.city?.trim();

    if (!code || !email || !name || !country || !city) {
      return json({ valid: false, reason: 'invalid_payload' }, 400, origin);
    }

    if (!allowedCountries.has(country.toLowerCase())) {
      return json({ valid: false, reason: 'country_not_supported' }, 200, origin);
    }

    // Service-role client: this endpoint is called cross-origin from the
    // storefront with no user session, so the SSR anon-keyed client wouldn't
    // satisfy RLS once it's enabled (review finding H3). Access control
    // here is the access-code itself plus the origin allowlist above — the
    // whole point of the validate step is to gate unauthenticated traffic.
    const supabase = createServiceClient();

    const { data: accessCode, error: accessCodeError } = await supabase
      .from('access_codes')
      .select('*')
      .eq('code', code)
      .maybeSingle<AccessCode>();

    if (accessCodeError) {
      throw accessCodeError;
    }

    if (!accessCode) {
      return json({ valid: false, reason: 'not_found' }, 200, origin);
    }

    const now = new Date();

    if (accessCode.status === 'consumed') {
      return json({ valid: false, reason: 'consumed' }, 200, origin);
    }

    if (accessCode.status !== 'active' || new Date(accessCode.expires_at) <= now) {
      return json({ valid: false, reason: 'expired' }, 200, origin);
    }

    // Returning customer: same email, reuse row. The code is still required and
    // must still be a valid unconsumed code — this branch only avoids duplicate
    // customer rows and is NOT a gate bypass.
    const { data: existingCustomer, error: existingCustomerError } = await supabase
      .from('customers')
      .select('id, bigcommerce_customer_id')
      .eq('email', email)
      .maybeSingle<{ id: string; bigcommerce_customer_id: string | null }>();

    if (existingCustomerError) {
      throw existingCustomerError;
    }

    const consumedAt = now.toISOString();

    if (existingCustomer) {
      const { data: consumedRow, error: consumeError } = await supabase
        .from('access_codes')
        .update({
          status: 'consumed',
          consumed_by: existingCustomer.id,
          consumed_at: consumedAt,
        })
        .eq('id', accessCode.id)
        .eq('status', 'active')
        .select('id')
        .maybeSingle();

      if (consumeError) {
        throw consumeError;
      }

      if (!consumedRow) {
        return json({ valid: false, reason: 'consumed' }, 200, origin);
      }

      let bigCommerceCustomerId: number | null = null;

      try {
        bigCommerceCustomerId = await ensureBigCommerceCustomer({
          supabase,
          customerId: existingCustomer.id,
          email,
          name,
          currentBigCommerceCustomerId: existingCustomer.bigcommerce_customer_id,
        });
      } catch (bigCommerceError) {
        console.error('BigCommerce customer sync failed', bigCommerceError);
      }

      return json(
        {
          valid: true,
          customer_id: existingCustomer.id,
          bc_customer_id: bigCommerceCustomerId,
          session_token: mintSessionToken(existingCustomer.id),
        },
        200,
        origin,
      );
    }

    // First-time customer: atomic consume FIRST, then insert. If consume loses
    // the race (another request consumed this code between our check and
    // update), we reject before creating any customer row.
    const { data: consumedRow, error: consumeError } = await supabase
      .from('access_codes')
      .update({
        status: 'consumed',
        consumed_at: consumedAt,
      })
      .eq('id', accessCode.id)
      .eq('status', 'active')
      .select('id')
      .maybeSingle();

    if (consumeError) {
      throw consumeError;
    }

    if (!consumedRow) {
      return json({ valid: false, reason: 'consumed' }, 200, origin);
    }

    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .insert({
        email,
        name,
        country,
        city,
        trainer_id: accessCode.trainer_id,
        access_code_id: accessCode.id,
      })
      .select('*')
      .single<Customer>();

    if (customerError) {
      throw customerError;
    }

    const { error: backfillError } = await supabase
      .from('access_codes')
      .update({ consumed_by: customer.id })
      .eq('id', accessCode.id);

    if (backfillError) {
      throw backfillError;
    }

    let bigCommerceCustomerId: number | null = null;

    try {
      bigCommerceCustomerId = await ensureBigCommerceCustomer({
        supabase,
        customerId: customer.id,
        email,
        name,
      });
    } catch (bigCommerceError) {
      console.error('BigCommerce customer sync failed', bigCommerceError);
    }

    return json(
      {
        valid: true,
        customer_id: customer.id,
        bc_customer_id: bigCommerceCustomerId,
        session_token: mintSessionToken(customer.id),
      },
      200,
      origin,
    );
  } catch (error) {
    console.error(error);
    return json({ error: 'Internal server error' }, 500, origin);
  }
}
