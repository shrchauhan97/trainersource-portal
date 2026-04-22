import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock telegram-auth to return predictable users.
// `getAuthDateSeconds` defaults to "now", so freshness check passes unless overridden.
vi.mock('@/lib/telegram-auth', () => ({
  verifyTelegramWebApp: vi.fn(),
  getAuthDateSeconds: vi.fn(() => Math.floor(Date.now() / 1000)),
}));

// Mock the BC REST client
vi.mock('@/lib/bc-rest-client', () => ({
  getCustomerOrders: vi.fn(),
  getOrderProducts: vi.fn(),
  getProductImages: vi.fn(),
  createCart: vi.fn(),
}));

// Mock the Supabase service client
const mockMaybeSingle = vi.fn();
const mockEq = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
const mockFrom = vi.fn().mockReturnValue({ select: mockSelect });
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({ from: mockFrom }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  // Re-wire the chain after clearAllMocks wiped the return values
  mockEq.mockReturnValue({ maybeSingle: mockMaybeSingle });
  mockSelect.mockReturnValue({ eq: mockEq });
  mockFrom.mockReturnValue({ select: mockSelect });
  // Re-wire the auth-date default to "now" (clearAllMocks wiped the factory default)
  vi.mocked(getAuthDateSeconds).mockImplementation(() =>
    Math.floor(Date.now() / 1000),
  );
  process.env.TELEGRAM_BOT_TOKEN = 'test-bot-token';
});

import {
  verifyTelegramWebApp,
  getAuthDateSeconds,
} from '@/lib/telegram-auth';
import {
  getCustomerOrders,
  getOrderProducts,
  getProductImages,
  createCart,
} from '@/lib/bc-rest-client';
import { GET as ordersGET } from '@/app/api/reorder/orders/route';
import { POST as checkoutPOST } from '@/app/api/reorder/checkout/route';

function req(initData: string): Request {
  return new Request('http://localhost/api/reorder/orders', {
    method: 'GET',
    headers: { 'X-Telegram-Init-Data': initData },
  });
}

describe('GET /api/reorder/orders', () => {
  it('returns 401 when initData verification fails', async () => {
    vi.mocked(verifyTelegramWebApp).mockReturnValue(null);
    const res = await ordersGET(req('bad-init'));
    expect(res.status).toBe(401);
  });

  it('returns 401 when header is missing', async () => {
    const r = new Request('http://localhost/api/reorder/orders', {
      method: 'GET',
    });
    const res = await ordersGET(r);
    expect(res.status).toBe(401);
  });

  it('returns 404 when no bc_customer_links row exists', async () => {
    vi.mocked(verifyTelegramWebApp).mockReturnValue({
      id: 999,
      first_name: 'Alex',
    });
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    const res = await ordersGET(req('ok'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/not linked/i);
  });

  it('returns 401 when initData is stale (past max auth age)', async () => {
    vi.mocked(verifyTelegramWebApp).mockReturnValue({
      id: 1,
      first_name: 'Alex',
    });
    // 25 hours ago — past the 24h MAX_AUTH_AGE_SECONDS window
    vi.mocked(getAuthDateSeconds).mockReturnValue(
      Math.floor(Date.now() / 1000) - 25 * 60 * 60,
    );
    const res = await ordersGET(req('ok'));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/stale/i);
  });

  it('returns 401 when initData is from the future (clock skew > 60s)', async () => {
    vi.mocked(verifyTelegramWebApp).mockReturnValue({
      id: 1,
      first_name: 'Alex',
    });
    // 2 minutes in the future — beyond the 60s clock-skew tolerance
    vi.mocked(getAuthDateSeconds).mockReturnValue(
      Math.floor(Date.now() / 1000) + 120,
    );
    const res = await ordersGET(req('ok'));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/stale/i);
  });

  it('returns orders array with per-order line items and thumbnails', async () => {
    vi.mocked(verifyTelegramWebApp).mockReturnValue({
      id: 1,
      first_name: 'Alex',
    });
    mockMaybeSingle.mockResolvedValue({
      data: { bc_customer_id: 42 },
      error: null,
    });
    vi.mocked(getCustomerOrders).mockResolvedValue([
      {
        id: 111,
        date_created: 'Sat, 14 Mar 2026 00:00:00 +0000',
        total_inc_tax: '180.00',
        status: 'Completed',
        customer_id: 42,
      },
    ]);
    vi.mocked(getOrderProducts).mockResolvedValue([
      {
        id: 1,
        product_id: 30,
        name: 'BPC-157 + TB-500',
        sku: 'UP-BPC157',
        quantity: 2,
        base_price: '90.00',
      },
    ]);
    vi.mocked(getProductImages).mockResolvedValue([
      {
        id: 9,
        url_thumbnail: 'https://cdn.bigcommerce.com/thumb.jpg',
        url_standard: 'https://cdn.bigcommerce.com/std.jpg',
        is_thumbnail: true,
      },
    ]);

    const res = await ordersGET(req('ok'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.first_name).toBe('Alex');
    expect(body.orders).toHaveLength(1);
    expect(body.orders[0]).toMatchObject({
      id: 111,
      total: '180.00',
      thumbnail: 'https://cdn.bigcommerce.com/thumb.jpg',
    });
    expect(body.orders[0].items[0]).toMatchObject({
      sku: 'UP-BPC157',
      quantity: 2,
    });
  });

  it('skips failed per-order fetches and returns the rest', async () => {
    vi.mocked(verifyTelegramWebApp).mockReturnValue({
      id: 1,
      first_name: 'Alex',
    });
    mockMaybeSingle.mockResolvedValue({
      data: { bc_customer_id: 42 },
      error: null,
    });
    vi.mocked(getCustomerOrders).mockResolvedValue([
      {
        id: 111,
        date_created: 'Sat, 14 Mar 2026 00:00:00 +0000',
        total_inc_tax: '180.00',
        status: 'Completed',
        customer_id: 42,
      },
      {
        id: 222,
        date_created: 'Wed, 02 Feb 2026 00:00:00 +0000',
        total_inc_tax: '140.00',
        status: 'Completed',
        customer_id: 42,
      },
    ]);
    vi.mocked(getOrderProducts)
      .mockResolvedValueOnce([
        {
          id: 1,
          product_id: 30,
          name: 'X',
          sku: 'UP-BPC157',
          quantity: 1,
          base_price: '90.00',
        },
      ])
      .mockRejectedValueOnce(new Error('boom'));
    vi.mocked(getProductImages).mockResolvedValue([]);

    const res = await ordersGET(req('ok'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.orders).toHaveLength(1);
    expect(body.orders[0].id).toBe(111);
  });
});

function checkoutReq(initData: string, body: unknown): Request {
  return new Request('http://localhost/api/reorder/checkout', {
    method: 'POST',
    headers: {
      'X-Telegram-Init-Data': initData,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/reorder/checkout', () => {
  beforeEach(() => {
    process.env.BC_CLIENT_ID = 'test_client_id';
    process.env.BC_CLIENT_SECRET = 'test_secret_long_enough_for_hs256';
    process.env.BIGCOMMERCE_STORE_HASH = 'yemcm3khpa';
    process.env.BC_STORE_URL = 'https://ultimate-peptides.com';
  });

  it('401 when initData invalid', async () => {
    vi.mocked(verifyTelegramWebApp).mockReturnValue(null);
    const res = await checkoutPOST(
      checkoutReq('bad', { selected_order_ids: [111] }),
    );
    expect(res.status).toBe(401);
  });

  it('400 when body is empty or malformed', async () => {
    vi.mocked(verifyTelegramWebApp).mockReturnValue({
      id: 1,
      first_name: 'A',
    });
    mockMaybeSingle.mockResolvedValue({
      data: { bc_customer_id: 42 },
      error: null,
    });
    const res = await checkoutPOST(checkoutReq('ok', { foo: 'bar' }));
    expect(res.status).toBe(400);
  });

  it('400 when selected_order_ids is empty', async () => {
    vi.mocked(verifyTelegramWebApp).mockReturnValue({
      id: 1,
      first_name: 'A',
    });
    mockMaybeSingle.mockResolvedValue({
      data: { bc_customer_id: 42 },
      error: null,
    });
    const res = await checkoutPOST(
      checkoutReq('ok', { selected_order_ids: [] }),
    );
    expect(res.status).toBe(400);
  });

  it('403 when an order belongs to a different customer', async () => {
    vi.mocked(verifyTelegramWebApp).mockReturnValue({
      id: 1,
      first_name: 'A',
    });
    mockMaybeSingle.mockResolvedValue({
      data: { bc_customer_id: 42 },
      error: null,
    });
    vi.mocked(getCustomerOrders).mockResolvedValue([
      {
        id: 999, // the customer's actual orders — 111 is not in the set
        date_created: '',
        total_inc_tax: '0',
        status: 'x',
        customer_id: 42,
      },
    ]);
    const res = await checkoutPOST(
      checkoutReq('ok', { selected_order_ids: [111] }),
    );
    expect(res.status).toBe(403);
  });

  it('aggregates line items across orders and returns checkout_url', async () => {
    vi.mocked(verifyTelegramWebApp).mockReturnValue({
      id: 1,
      first_name: 'A',
    });
    mockMaybeSingle.mockResolvedValue({
      data: { bc_customer_id: 42 },
      error: null,
    });
    vi.mocked(getCustomerOrders).mockResolvedValue([
      {
        id: 111,
        date_created: '',
        total_inc_tax: '0',
        status: 'x',
        customer_id: 42,
      },
      {
        id: 222,
        date_created: '',
        total_inc_tax: '0',
        status: 'x',
        customer_id: 42,
      },
    ]);
    vi.mocked(getOrderProducts)
      .mockResolvedValueOnce([
        {
          id: 1,
          product_id: 30,
          name: 'X',
          sku: 'UP-BPC157',
          quantity: 2,
          base_price: '90',
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 2,
          product_id: 30,
          name: 'X',
          sku: 'UP-BPC157',
          quantity: 1,
          base_price: '90',
        },
        {
          id: 3,
          product_id: 31,
          name: 'Y',
          sku: 'UP-BACWATER',
          quantity: 1,
          base_price: '35',
        },
      ]);
    vi.mocked(createCart).mockResolvedValue({
      id: 'cart-xyz',
      customer_id: 42,
      line_items: [],
    });

    const res = await checkoutPOST(
      checkoutReq('ok', { selected_order_ids: [111, 222] }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.checkout_url).toMatch(
      /^https:\/\/ultimate-peptides\.com\/login\/token\/[A-Za-z0-9_\-.]+$/,
    );
    // Aggregation — UP-BPC157 qty 2+1=3
    const call = vi.mocked(createCart).mock.calls[0][0];
    const bpc = call.line_items.find((l) => l.sku === 'UP-BPC157');
    expect(bpc?.quantity).toBe(3);
    const bac = call.line_items.find((l) => l.sku === 'UP-BACWATER');
    expect(bac?.quantity).toBe(1);
  });
});
