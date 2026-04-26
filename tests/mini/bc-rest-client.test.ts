import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
  process.env.BIGCOMMERCE_STORE_HASH = 'yemcm3khpa';
  process.env.BIGCOMMERCE_ACCESS_TOKEN = 'test-token';
});

import {
  getCustomerOrders,
  getOrderProducts,
  createCart,
} from '../../src/lib/bc-rest-client.js';

describe('getCustomerOrders', () => {
  it('GETs v2 /orders?customer_id=X&limit=5 with correct auth headers', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify([
          {
            id: 111,
            date_created: 'Mon, 14 Mar 2026 00:00:00 +0000',
            total_inc_tax: '180.00',
            status: 'Completed',
          },
        ]),
    });

    const orders = await getCustomerOrders(42, 5);
    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain(
      '/stores/yemcm3khpa/v2/orders?customer_id=42&limit=5&sort=date_created:desc',
    );
    expect((init as RequestInit).headers).toMatchObject({
      'X-Auth-Token': 'test-token',
      Accept: 'application/json',
    });
    expect(orders).toHaveLength(1);
    expect(orders[0].id).toBe(111);
  });

  it('returns empty array on 204 No Content', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 204,
      text: async () => '',
    });
    const orders = await getCustomerOrders(99);
    expect(orders).toEqual([]);
  });

  it('throws on non-OK status', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => '{"title":"boom"}',
    });
    await expect(getCustomerOrders(42)).rejects.toThrow(/boom|500/);
  });
});

describe('getOrderProducts', () => {
  it('GETs v2 /orders/:id/products and returns SKU + quantity', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify([
          {
            id: 1,
            product_id: 30,
            name: 'BPC-157 + TB-500',
            sku: 'UP-BPC157',
            quantity: 2,
            base_price: '90.00',
            product_options: [],
          },
        ]),
    });
    const items = await getOrderProducts(111);
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('/v2/orders/111/products');
    expect(items[0]).toMatchObject({ sku: 'UP-BPC157', quantity: 2 });
  });
});

describe('createCart', () => {
  it('POSTs v3 /carts with line_items payload', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          data: { id: 'cart-xyz', customer_id: 42 },
        }),
    });
    const cart = await createCart({
      customer_id: 42,
      line_items: [{ sku: 'UP-BPC157', quantity: 2 }],
    });
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('/v3/carts');
    expect((init as RequestInit).method).toBe('POST');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({
      customer_id: 42,
      line_items: [{ sku: 'UP-BPC157', quantity: 2 }],
    });
    expect(cart.id).toBe('cart-xyz');
  });
});
