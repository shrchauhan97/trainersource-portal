import { createHmac, timingSafeEqual } from 'node:crypto';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

import { calculateCommission } from '@/lib/commission';
import { sendEmail, firstOrderEmail } from '@/lib/email';
import type { Customer, Order, Trainer } from '@/lib/types';

export const runtime = 'nodejs';

type BigCommerceWebhookPayload = {
  data?: {
    id?: number | string;
    customer_id?: number | string | null;
  };
  scope?: string;
};

type BigCommerceOrderResponse = {
  id: number;
  customer_id: number;
  status?: string;
  total_inc_tax?: string | number;
  payment_method?: string;
  billing_address?: {
    country?: string;
    city?: string;
    email?: string;
  };
  date_created?: string;
  date_modified?: string;
};

type JsonResponseBody = Record<string, unknown>;

function json(body: JsonResponseBody, status = 200) {
  return Response.json(body, { status });
}

function createServiceRoleClient() {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing Supabase service role configuration');
  }

  return createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function safeEqualStrings(a: string, b: string) {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);

  if (aBuf.length !== bBuf.length) {
    return false;
  }

  return timingSafeEqual(aBuf, bBuf);
}

function verifyBearerAuth(authorizationHeader: string | null, secret: string) {
  if (!authorizationHeader) {
    return false;
  }

  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    return false;
  }

  return safeEqualStrings(match[1].trim(), secret);
}

function verifyHmacSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
) {
  if (!signatureHeader) {
    return false;
  }

  const normalizedSignature = signatureHeader.trim();
  const digest = createHmac('sha256', secret).update(rawBody).digest();
  const encodings: Array<BufferEncoding> = ['base64', 'hex'];

  for (const encoding of encodings) {
    try {
      const provided = Buffer.from(normalizedSignature, encoding);
      if (provided.length === digest.length && timingSafeEqual(digest, provided)) {
        return true;
      }
    } catch {
      continue;
    }
  }

  return false;
}

function verifyWebhookRequest(request: Request, rawBody: string) {
  const secret = process.env.BIGCOMMERCE_WEBHOOK_SECRET;

  if (!secret) {
    console.error(
      'BIGCOMMERCE_WEBHOOK_SECRET is not configured — rejecting all webhook calls. ' +
        'Set this env var to a dedicated secret (NOT your BigCommerce API access token) ' +
        'and configure the matching value on the BigCommerce webhook destination.',
    );
    return false;
  }

  const authorization = request.headers.get('authorization');
  if (verifyBearerAuth(authorization, secret)) {
    return true;
  }

  // Fallback: HMAC-signed payload delivered via BC Webhooks signing (if enabled)
  const signatureHeader =
    request.headers.get('x-bc-webhook-signature') ||
    request.headers.get('x-bc-signature-sha256') ||
    request.headers.get('x-bc-signature');

  return verifyHmacSignature(rawBody, signatureHeader, secret);
}

async function fetchBigCommerceOrder(orderId: string) {
  const storeHash = process.env.BIGCOMMERCE_STORE_HASH;
  const accessToken = process.env.BIGCOMMERCE_ACCESS_TOKEN;

  if (!storeHash || !accessToken) {
    throw new Error('Missing BigCommerce configuration');
  }

  const response = await fetch(
    `https://api.bigcommerce.com/stores/${storeHash}/v2/orders/${orderId}`,
    {
      headers: {
        'X-Auth-Token': accessToken,
        Accept: 'application/json',
      },
      cache: 'no-store',
    }
  );

  if (!response.ok) {
    throw new Error(`BigCommerce order fetch failed with status ${response.status}`);
  }

  return response.json() as Promise<BigCommerceOrderResponse>;
}

// Map a BigCommerce order status to our internal `orders.status`.
// Returns null for statuses that should NOT produce an order row or commission
// (cancelled, refunded, declined, disputed, partially refunded, manual review).
// Unknown statuses default to 'pending' — we NEVER assume 'paid'.
function normalizeOrderStatus(status: string | undefined): Order['status'] | null {
  const value = status?.toLowerCase().trim() ?? '';

  if (!value) {
    return 'pending';
  }

  if (
    value.includes('cancel') ||
    value.includes('refund') ||
    value.includes('declin') ||
    value.includes('disput') ||
    value.includes('manual verification')
  ) {
    return null;
  }

  if (value.includes('ship')) {
    return 'shipped';
  }

  if (value.includes('deliver') || value === 'completed') {
    return 'delivered';
  }

  if (
    value.includes('awaiting fulfillment') ||
    value.includes('awaiting pickup') ||
    value === 'paid'
  ) {
    return 'paid';
  }

  if (
    value.includes('awaiting payment') ||
    value.includes('incomplete') ||
    value.includes('pending')
  ) {
    return 'pending';
  }

  return 'pending';
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();

    if (!rawBody || !verifyWebhookRequest(request, rawBody)) {
      return json({ error: 'Invalid webhook signature' }, 401);
    }

    const payload = JSON.parse(rawBody) as BigCommerceWebhookPayload;
    const scope = payload.scope ?? '';
    const orderId = payload.data?.id;
    const bigcommerceCustomerId = payload.data?.customer_id;

    if (!scope || !orderId) {
      return json({ error: 'Invalid webhook payload' }, 400);
    }

    if (!scope.includes('order/created')) {
      return json({ ok: true });
    }

    const supabase = createServiceRoleClient();
    const orderDetails = await fetchBigCommerceOrder(String(orderId));

    const customerLookup = String(
      bigcommerceCustomerId ?? orderDetails.customer_id ?? ''
    ).trim();
    const billingEmail = orderDetails.billing_address?.email?.trim().toLowerCase() ?? '';

    // BigCommerce sends `customer_id: 0` for guest checkouts. The gate may
    // already have created a row in `customers` (with the email/trainer
    // attribution captured at gate time) but the BC checkout-side did not
    // log the customer in, so the order arrives unlinked. Fall back to an
    // email match so commission attribution survives guest checkouts.
    const hasLinkedBCCustomer = !!customerLookup && customerLookup !== '0';

    if (!hasLinkedBCCustomer && !billingEmail) {
      return json({ error: 'Missing customer identifier' }, 400);
    }

    let customer: Customer | null = null;

    if (hasLinkedBCCustomer) {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('bigcommerce_customer_id', customerLookup)
        .maybeSingle<Customer>();
      if (error) throw error;
      customer = data;
    }

    if (!customer && billingEmail) {
      console.log(
        `[webhook] Falling back to email lookup for order ${orderId} (bc_id=${customerLookup || 'missing'}, email=${billingEmail})`,
      );
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .ilike('email', billingEmail)
        .maybeSingle<Customer>();
      if (error) throw error;
      customer = data;

      // If we matched by email but the row has no BC id (or a stale 0/null),
      // backfill it with the actual BC customer_id from this order. This
      // self-heals the link so future orders for this customer hit the fast
      // path.
      if (customer && hasLinkedBCCustomer && customer.bigcommerce_customer_id !== customerLookup) {
        const { error: linkError } = await supabase
          .from('customers')
          .update({ bigcommerce_customer_id: customerLookup })
          .eq('id', customer.id);
        if (linkError) {
          console.error(`[webhook] Failed to backfill bigcommerce_customer_id for ${customer.id}:`, linkError);
        }
      }
    }

    if (!customer) {
      return json({ error: 'Customer not found' }, 400);
    }

    const trainerId = customer.trainer_id;

    const existingOrderQuery = supabase
      .from('orders')
      .select('id')
      .eq('bigcommerce_order_id', String(orderId))
      .maybeSingle<{ id: string }>();

    const previousOrdersQuery = supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('customer_id', customer.id);

    const trainerQuery = trainerId
      ? supabase.from('trainers').select('*').eq('id', trainerId).maybeSingle<Trainer>()
      : Promise.resolve({ data: null, error: null });

    const [existingOrderResult, previousOrdersResult, trainerResult] = await Promise.all([
      existingOrderQuery,
      previousOrdersQuery,
      trainerQuery,
    ]);

    if (existingOrderResult.error) {
      throw existingOrderResult.error;
    }

    if (existingOrderResult.data) {
      return json({ ok: true, order_id: existingOrderResult.data.id });
    }

    if (previousOrdersResult.error) {
      throw previousOrdersResult.error;
    }

    if (trainerResult.error) {
      throw trainerResult.error;
    }

    const normalizedStatus = normalizeOrderStatus(orderDetails.status);

    if (!normalizedStatus) {
      // Cancelled, refunded, declined, disputed, or under manual review —
      // do not create an order row or a commission. If this order was
      // previously booked and is now being reversed, a separate
      // order/updated handler will reconcile state.
      return json({ ok: true, skipped: true, reason: 'status_not_actionable' });
    }

    const placedAt = orderDetails.date_created ?? new Date().toISOString();
    const updatedAt = orderDetails.date_modified ?? new Date().toISOString();
    const total = Number(orderDetails.total_inc_tax ?? 0);

    const { data: createdOrder, error: createOrderError } = await supabase
      .from('orders')
      .insert({
        bigcommerce_order_id: String(orderId),
        customer_id: customer.id,
        trainer_id: trainerId,
        total: Number.isFinite(total) ? total : 0,
        status: normalizedStatus,
        payment_method: orderDetails.payment_method ?? 'ACH',
        country: orderDetails.billing_address?.country ?? customer.country,
        city: orderDetails.billing_address?.city ?? customer.city,
        placed_at: placedAt,
        updated_at: updatedAt,
      })
      .select('*')
      .single<Order>();

    if (createOrderError) {
      throw createOrderError;
    }

    const isSettledStatus =
      normalizedStatus === 'paid' ||
      normalizedStatus === 'shipped' ||
      normalizedStatus === 'delivered';

    if (trainerId && trainerResult.data && isSettledStatus) {
      const isFirstSale = (previousOrdersResult.count ?? 0) === 0;
      const commission = calculateCommission(createdOrder, trainerResult.data, isFirstSale);

      const { error: createCommissionError } = await supabase.from('commissions').insert({
        trainer_id: trainerId,
        order_id: createdOrder.id,
        commission_type: commission.commissionType,
        rate_snapshot: commission.rate,
        amount: commission.amount,
        status: 'pending',
      });

      if (createCommissionError) {
        throw createCommissionError;
      }

      // Best-effort commission notification. Wrapped in try so a Resend
      // outage cannot fail the webhook (BC would retry and create
      // duplicate commission rows on the next fire).
      if (trainerResult.data.email && isFirstSale) {
        try {
          const { subject, html } = firstOrderEmail({
            trainerName: trainerResult.data.name ?? 'there',
            clientName: customer.name ?? customer.email ?? 'a new client',
            orderTotal: Number(createdOrder.total) || 0,
            commissionAmount: commission.amount,
            orderId: String(orderId),
          });
          await sendEmail({ to: trainerResult.data.email, subject, html });
        } catch (emailError) {
          console.error('[notify] commission email failed', emailError);
        }
      }
    }

    return json({ ok: true, order_id: createdOrder.id });
  } catch (error) {
    console.error(error);
    return json({ error: 'Internal server error' }, 500);
  }
}
