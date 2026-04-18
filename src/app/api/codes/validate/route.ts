import { createClient } from '@/lib/supabase/server';
import {
  createBigCommerceCustomer,
  getBigCommerceCustomerByEmail,
} from '@/lib/bigcommerce';
import type { AccessCode, Customer } from '@/lib/types';

const allowedOrigin = 'https://ultimate-peptides.com';

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
  supabase: Awaited<ReturnType<typeof createClient>>;
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
  const responseOrigin = origin === allowedOrigin ? allowedOrigin : allowedOrigin;

  return {
    'Access-Control-Allow-Origin': responseOrigin,
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

    const supabase = await createClient();

    const { data: existingCustomer, error: existingCustomerError } = await supabase
      .from('customers')
      .select('id, bigcommerce_customer_id')
      .eq('email', email)
      .maybeSingle<{ id: string; bigcommerce_customer_id: string | null }>();

    if (existingCustomerError) {
      throw existingCustomerError;
    }

    if (existingCustomer) {
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
        },
        200,
        origin,
      );
    }

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

    const consumedAt = now.toISOString();

    const { error: consumeError } = await supabase
      .from('access_codes')
      .update({
        status: 'consumed',
        consumed_by: customer.id,
        consumed_at: consumedAt,
      })
      .eq('id', accessCode.id)
      .eq('status', 'active');

    if (consumeError) {
      throw consumeError;
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
      { valid: true, customer_id: customer.id, bc_customer_id: bigCommerceCustomerId },
      200,
      origin,
    );
  } catch (error) {
    console.error(error);
    return json({ error: 'Internal server error' }, 500, origin);
  }
}
