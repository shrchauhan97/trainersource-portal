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
  process.env.TELEGRAM_BOT_TOKEN = 'test-bot-token';
});

import { verifyTelegramWebApp } from '@/lib/telegram-auth';
import {
  getCustomerOrders,
  getOrderProducts,
  getProductImages,
} from '@/lib/bc-rest-client';
import { GET as ordersGET } from '@/app/api/reorder/orders/route';

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
