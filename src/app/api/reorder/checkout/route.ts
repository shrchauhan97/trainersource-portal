import { NextResponse } from 'next/server';
import {
  verifyTelegramWebApp,
  getAuthDateSeconds,
} from '@/lib/telegram-auth';
import {
  getCustomerOrders,
  getOrderProducts,
  createCart,
  type BcCartLineItemInput,
} from '@/lib/bc-rest-client';
import { buildBcLoginUrl, loadBcSsoConfig } from '@/lib/bc-sso';
import { createServiceClient } from '@/lib/supabase/service';

export const runtime = 'nodejs';

// Reject initData older than 24 hours.
const MAX_AUTH_AGE_SECONDS = 24 * 60 * 60;
// Tolerate modest client/server clock skew before rejecting future-dated authDate.
const CLOCK_SKEW_SECONDS = 60;
// Hard cap on how many orders a client may ask us to merge at once.
const MAX_SELECTED_ORDERS = 5;

interface CheckoutBody {
  selected_order_ids: number[];
}

export async function POST(req: Request): Promise<Response> {
  const initData = req.headers.get('X-Telegram-Init-Data');
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!initData || !botToken) {
    return NextResponse.json({ error: 'missing auth' }, { status: 401 });
  }

  const user = verifyTelegramWebApp(initData, botToken);
  if (!user) {
    return NextResponse.json({ error: 'invalid initData' }, { status: 401 });
  }

  const authDate = getAuthDateSeconds(initData);
  const now = Math.floor(Date.now() / 1000);
  if (
    !authDate ||
    authDate > now + CLOCK_SKEW_SECONDS ||
    now - authDate > MAX_AUTH_AGE_SECONDS
  ) {
    return NextResponse.json({ error: 'stale initData' }, { status: 401 });
  }

  let body: CheckoutBody;
  try {
    body = (await req.json()) as CheckoutBody;
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }
  if (
    !Array.isArray(body.selected_order_ids) ||
    body.selected_order_ids.length === 0 ||
    body.selected_order_ids.length > MAX_SELECTED_ORDERS ||
    !body.selected_order_ids.every((n) => Number.isInteger(n) && n > 0)
  ) {
    return NextResponse.json(
      { error: 'invalid selected_order_ids' },
      { status: 400 },
    );
  }
  const selectedIds = new Set(body.selected_order_ids);

  const supabase = createServiceClient();
  const { data: linkRow, error: linkErr } = await supabase
    .from('bc_customer_links')
    .select('bc_customer_id')
    .eq('telegram_user_id', user.id)
    .maybeSingle();

  if (linkErr) {
    console.error('[reorder/checkout] db lookup failed:', linkErr.message);
    return NextResponse.json({ error: 'db lookup failed' }, { status: 500 });
  }
  if (!linkRow) {
    return NextResponse.json(
      { error: 'not linked — run /start in the bot and link your account' },
      { status: 404 },
    );
  }

  const bcCustomerId = (linkRow as { bc_customer_id: number }).bc_customer_id;

  // Re-fetch the customer's orders (trust server, not client-sent IDs).
  let orders;
  try {
    orders = await getCustomerOrders(bcCustomerId, 5);
  } catch (e) {
    console.error(
      '[reorder/checkout] orders fetch failed:',
      (e as Error).message,
    );
    return NextResponse.json({ error: 'orders fetch failed' }, { status: 502 });
  }

  // IDOR check: every requested ID must be in the customer's recent 5.
  const ownedIds = new Set(orders.map((o) => o.id));
  for (const id of selectedIds) {
    if (!ownedIds.has(id)) {
      return NextResponse.json(
        { error: `order ${id} is not yours or too old` },
        { status: 403 },
      );
    }
  }

  // Aggregate line items — same SKU across orders → summed quantity.
  const aggregated = new Map<string, BcCartLineItemInput>();
  for (const order of orders) {
    if (!selectedIds.has(order.id)) continue;
    let items;
    try {
      items = await getOrderProducts(order.id);
    } catch (e) {
      console.error(
        `[reorder/checkout] line-items fetch failed for order ${order.id}:`,
        (e as Error).message,
      );
      return NextResponse.json(
        { error: 'line-items fetch failed' },
        { status: 502 },
      );
    }
    for (const li of items) {
      if (!li.sku) continue; // skip line items without a SKU
      const existing = aggregated.get(li.sku);
      if (existing) {
        existing.quantity += li.quantity;
      } else {
        aggregated.set(li.sku, { sku: li.sku, quantity: li.quantity });
      }
    }
  }

  if (aggregated.size === 0) {
    return NextResponse.json(
      { error: 'no reorderable items in selection' },
      { status: 400 },
    );
  }

  // Create cart.
  let cart;
  try {
    cart = await createCart({
      customer_id: bcCustomerId,
      line_items: Array.from(aggregated.values()),
    });
  } catch (e) {
    console.error(
      '[reorder/checkout] cart creation failed:',
      (e as Error).message,
    );
    return NextResponse.json(
      { error: 'cart creation failed' },
      { status: 502 },
    );
  }

  // Mint SSO + build redirect. We redirect to /cart.php which picks up the
  // customer's newly-created cart via customer_id. The SSO token authenticates
  // the customer on arrival so they land in-session.
  const cfg = loadBcSsoConfig();
  const checkoutUrl = buildBcLoginUrl(cfg, bcCustomerId, '/cart.php');

  return NextResponse.json({
    checkout_url: checkoutUrl,
    cart_id: cart.id,
    line_items_count: aggregated.size,
  });
}
