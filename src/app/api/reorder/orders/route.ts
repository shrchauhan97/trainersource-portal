import { NextResponse } from 'next/server';
import {
  verifyTelegramWebApp,
  getAuthDateSeconds,
} from '@/lib/telegram-auth';
import {
  getCustomerOrders,
  getOrderProducts,
  getProductImages,
  type BcOrderProduct,
} from '@/lib/bc-rest-client';
import { createServiceClient } from '@/lib/supabase/service';

export const runtime = 'nodejs';

// Reject initData older than 24 hours.
const MAX_AUTH_AGE_SECONDS = 24 * 60 * 60;
// Tolerate modest client/server clock skew before rejecting future-dated authDate.
const CLOCK_SKEW_SECONDS = 60;

interface OrderDetail {
  id: number;
  placed_at: string;
  total: string;
  thumbnail: string | null;
  product_summary: string;
  items: Array<{
    sku: string | null;
    product_id: number;
    name: string;
    quantity: number;
    price: string;
  }>;
}

export async function GET(req: Request): Promise<Response> {
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

  const supabase = createServiceClient();
  const { data: linkRow, error: linkErr } = await supabase
    .from('bc_customer_links')
    .select('bc_customer_id')
    .eq('telegram_user_id', user.id)
    .maybeSingle();

  if (linkErr) {
    return NextResponse.json({ error: 'db lookup failed' }, { status: 500 });
  }
  if (!linkRow) {
    return NextResponse.json(
      { error: 'not linked — run /start in the bot and link your account' },
      { status: 404 },
    );
  }

  const bcCustomerId = (linkRow as { bc_customer_id: number }).bc_customer_id;

  let orders;
  try {
    orders = await getCustomerOrders(bcCustomerId, 5);
  } catch (e) {
    console.error('[reorder/orders] BC fetch failed:', (e as Error).message);
    return NextResponse.json({ error: 'orders fetch failed' }, { status: 502 });
  }

  // Per-order details fetched in parallel; tolerate partial failure.
  const details = await Promise.allSettled<OrderDetail>(
    orders.map(async (o): Promise<OrderDetail> => {
      const items = await getOrderProducts(o.id);
      const firstProductId = items[0]?.product_id ?? null;
      let thumbnail: string | null = null;
      if (firstProductId) {
        try {
          const images = await getProductImages(firstProductId);
          const thumb = images.find((i) => i.is_thumbnail) ?? images[0];
          thumbnail = thumb?.url_thumbnail ?? thumb?.url_standard ?? null;
        } catch {
          thumbnail = null;
        }
      }
      return {
        id: o.id,
        placed_at: o.date_created,
        total: o.total_inc_tax,
        thumbnail,
        product_summary: buildSummary(items),
        items: items.map((li) => ({
          sku: li.sku,
          product_id: li.product_id,
          name: li.name,
          quantity: li.quantity,
          price: li.base_price,
        })),
      };
    }),
  );

  const successful = details
    .filter(
      (d): d is PromiseFulfilledResult<OrderDetail> => d.status === 'fulfilled',
    )
    .map((d) => d.value);

  return NextResponse.json({
    first_name: user.first_name,
    orders: successful,
  });
}

function buildSummary(items: BcOrderProduct[]): string {
  if (items.length === 0) return '(empty order)';
  if (items.length === 1) {
    const q = items[0].quantity > 1 ? ` (×${items[0].quantity})` : '';
    return `${items[0].name}${q}`;
  }
  return `${items[0].name} + ${items.length - 1} more`;
}
