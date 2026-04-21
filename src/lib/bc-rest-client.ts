// Portal-side BigCommerce REST client for the Reorder Mini App (M2).
// Distinct from `src/lib/bigcommerce.ts` (customer-create only) and from
// the bot's `src/bc-client.ts` (separate repo, separate deploy).
//
// Uses the existing BIGCOMMERCE_STORE_HASH + BIGCOMMERCE_ACCESS_TOKEN env
// vars. Orders endpoints live under /v2 per BC's API versioning; carts
// are /v3.

interface BcConfig {
  storeHash: string;
  accessToken: string;
}

function getConfig(): BcConfig {
  const storeHash = process.env.BIGCOMMERCE_STORE_HASH;
  const accessToken = process.env.BIGCOMMERCE_ACCESS_TOKEN;
  if (!storeHash || !accessToken) {
    throw new Error(
      'bc-rest-client: missing BIGCOMMERCE_STORE_HASH or BIGCOMMERCE_ACCESS_TOKEN',
    );
  }
  return { storeHash, accessToken };
}

async function bcFetch<T>(
  apiPath: string, // e.g. "/v3/carts" or "/v2/orders?..."
  init?: RequestInit,
): Promise<T | null> {
  const { storeHash, accessToken } = getConfig();
  const url = `https://api.bigcommerce.com/stores/${storeHash}${apiPath}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      'X-Auth-Token': accessToken,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `bc-rest-client: ${res.status} ${apiPath} — ${text.slice(0, 200)}`,
    );
  }
  if (!text) return null;
  return JSON.parse(text) as T;
}

export interface BcOrder {
  id: number;
  date_created: string; // RFC 2822 — parse with new Date()
  total_inc_tax: string; // "180.00"
  status: string;
  customer_id: number;
}

export async function getCustomerOrders(
  customerId: number,
  limit = 5,
): Promise<BcOrder[]> {
  const path = `/v2/orders?customer_id=${customerId}&limit=${limit}&sort=date_created:desc`;
  const result = await bcFetch<BcOrder[]>(path, { method: 'GET' });
  return result ?? [];
}

export interface BcOrderProduct {
  id: number;
  product_id: number;
  name: string;
  sku: string | null;
  quantity: number;
  base_price: string;
  product_options?: { display_name: string; display_value: string }[];
}

export async function getOrderProducts(
  orderId: number,
): Promise<BcOrderProduct[]> {
  const result = await bcFetch<BcOrderProduct[]>(
    `/v2/orders/${orderId}/products`,
    { method: 'GET' },
  );
  return result ?? [];
}

export interface BcCartLineItemInput {
  sku?: string;
  product_id?: number;
  quantity: number;
}

export interface BcCartCreateInput {
  customer_id: number;
  line_items: BcCartLineItemInput[];
}

export interface BcCart {
  id: string;
  customer_id: number;
  line_items: unknown;
}

export async function createCart(input: BcCartCreateInput): Promise<BcCart> {
  const result = await bcFetch<{ data: BcCart }>('/v3/carts', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  if (!result) throw new Error('bc-rest-client: createCart returned empty');
  return result.data;
}

export interface BcProductImage {
  id: number;
  url_thumbnail: string;
  url_standard: string;
  is_thumbnail: boolean;
}

export async function getProductImages(
  productId: number,
): Promise<BcProductImage[]> {
  const result = await bcFetch<{ data: BcProductImage[] }>(
    `/v3/catalog/products/${productId}/images`,
    { method: 'GET' },
  );
  return result?.data ?? [];
}
