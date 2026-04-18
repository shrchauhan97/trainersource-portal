import { expect, test, type Locator } from '@playwright/test';

test.describe('Public Pages', () => {
  test('Landing Page', async ({ page }) => {
    const response = await page.goto('/');

    expect(response).not.toBeNull();
    expect(response?.status()).toBe(200);
    await expect(page.getByText('TrainerSource').first()).toBeVisible();
    await expect(page.getByText(/direct access for qualified research purposes/i)).toBeVisible();
    await expect(page.getByRole('link', { name: /log in|sign up|apply|join the program/i }).first()).toBeVisible();
  });

  test('Apply Page', async ({ page }) => {
    const response = await page.goto('/apply');

    expect(response).not.toBeNull();
    expect(response?.status()).toBe(200);

    const nameInput = page.getByLabel(/full name/i);
    const emailInput = page.getByLabel(/email address/i);
    const phoneInput = page.getByLabel(/phone number/i);
    const countrySelect = page.getByLabel(/^country \*/i);
    const cityInput = page.getByLabel(/^city \*/i);
    const nicheInput = page.getByLabel(/niche/i);
    const socialMediaInput = page.getByLabel(/social media handle\/url/i);

    await expect(nameInput).toBeVisible();
    await expect(emailInput).toBeVisible();
    await expect(phoneInput).toBeVisible();
    await expect(countrySelect).toBeVisible();
    await expect(cityInput).toBeVisible();
    await expect(nicheInput).toBeVisible();
    await expect(socialMediaInput).toBeVisible();

    await page.getByRole('button', { name: /apply now/i }).click();

    await expect(nameInput).toBeFocused();
    await expect.poll(() => getValidationMessage(nameInput)).not.toBe('');
    await expect.poll(() => getValidationMessage(emailInput)).not.toBe('');
    await expect.poll(() => getValidationMessage(countrySelect)).not.toBe('');
    await expect.poll(() => getValidationMessage(cityInput)).not.toBe('');
  });

  test('Login Page', async ({ page }) => {
    const response = await page.goto('/login');

    expect(response).not.toBeNull();
    expect(response?.status()).toBe(200);
    await expect(page.getByLabel(/email address/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /send magic link|sign in/i })).toBeVisible();
    await expect(page.getByText(/TrainerSource/i)).toBeVisible();
  });
});

async function getValidationMessage(locator: Locator) {
  return locator.evaluate((element) => {
    if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) {
      return element.validationMessage;
    }

    return '';
  });
}

test.describe('API Endpoints', () => {
  test('Code Validation API rejects empty payload', async ({ request }) => {
    const response = await request.post('/api/codes/validate', {
      data: {},
    });

    expect(response.status()).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      valid: false,
      reason: 'invalid_payload',
    });
  });

  test('Code Validation API returns not_found for unknown code', async ({ request }) => {
    const response = await request.post('/api/codes/validate', {
      data: {
        code: 'ZZZZZZZZ',
        email: 'nobody@test.com',
        name: 'Nobody',
        country: 'SG',
        city: 'SG',
      },
    });

    expect(response.status()).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      valid: false,
      reason: 'not_found',
    });
  });

  test('Trainers API rejects unauthenticated requests', async ({ request }) => {
    const response = await request.get('/api/trainers');

    expect(response.status()).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Unauthorized',
    });
  });

  test('Commissions API rejects unauthenticated requests', async ({ request }) => {
    const response = await request.get('/api/commissions');

    expect(response.status()).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Unauthorized',
    });
  });

  test('Admin Codes API rejects unauthenticated requests', async ({ request }) => {
    const response = await request.get('/api/admin/codes');

    expect(response.status()).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Unauthorized',
    });
  });
});

test.describe('Code Validation E2E Flows', () => {
  const runId = Math.random().toString(36).slice(2, 14);

  let activeCode: string;
  let consumedCode: string;
  let expiredCode: string;
  let returningEmail: string;

  test.beforeAll(async () => {
    const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required for E2E validate tests');
    }

    const headers = {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    };

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const expiredAt = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    activeCode = `EA${runId.slice(0, 6)}`.toUpperCase();
    consumedCode = `EC${runId.slice(0, 6)}`.toUpperCase();
    expiredCode = `EX${runId.slice(0, 6)}`.toUpperCase();
    returningEmail = `e2e-returning-${runId}@trainersource.test`;

    const activeRes = await fetch(`${supabaseUrl}/rest/v1/access_codes`, {
      method: 'POST',
      headers,
      body: JSON.stringify([
        { code: activeCode, type: 'founder', trainer_id: null, status: 'active', expires_at: expiresAt },
        { code: expiredCode, type: 'founder', trainer_id: null, status: 'active', expires_at: expiredAt },
      ]),
    });

    if (!activeRes.ok) {
      throw new Error(`Failed to seed codes: ${await activeRes.text()}`);
    }

    const customerRes = await fetch(`${supabaseUrl}/rest/v1/customers`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        email: `e2e-consumed-${runId}@trainersource.test`,
        name: 'E2E Consumed Customer',
        country: 'Singapore',
        city: 'Singapore',
        trainer_id: null,
        access_code_id: null,
      }),
    });

    if (!customerRes.ok) {
      throw new Error(`Failed to seed consumed customer: ${await customerRes.text()}`);
    }

    const [consumedCustomer] = await customerRes.json();

    const consumedRes = await fetch(`${supabaseUrl}/rest/v1/access_codes`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        code: consumedCode,
        type: 'organic',
        trainer_id: null,
        status: 'consumed',
        expires_at: expiresAt,
        consumed_by: consumedCustomer.id,
        consumed_at: new Date().toISOString(),
      }),
    });

    if (!consumedRes.ok) {
      throw new Error(`Failed to seed consumed code: ${await consumedRes.text()}`);
    }

    const returningRes = await fetch(`${supabaseUrl}/rest/v1/customers`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        email: returningEmail,
        name: 'E2E Returning Customer',
        country: 'Singapore',
        city: 'Singapore',
        trainer_id: null,
        access_code_id: null,
      }),
    });

    if (!returningRes.ok) {
      throw new Error(`Failed to seed returning customer: ${await returningRes.text()}`);
    }
  });

  test.afterAll(async () => {
    const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return;
    }

    const headers = {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    };

    for (const code of [activeCode, consumedCode, expiredCode]) {
      await fetch(
        `${supabaseUrl}/rest/v1/access_codes?code=eq.${code}`,
        {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ consumed_by: null, consumed_at: null }),
        },
      );
    }

    await fetch(
      `${supabaseUrl}/rest/v1/customers?email=like.*${runId}*`,
      { method: 'DELETE', headers },
    );

    for (const code of [activeCode, consumedCode, expiredCode]) {
      await fetch(
        `${supabaseUrl}/rest/v1/access_codes?code=eq.${code}`,
        { method: 'DELETE', headers },
      );
    }
  });

  test('Active code validates successfully and creates customer', async ({ request }) => {
    const response = await request.post('/api/codes/validate', {
      data: {
        code: activeCode,
        email: `e2e-newcust-${runId}@trainersource.test`,
        name: 'E2E New Customer',
        country: 'Singapore',
        city: 'Singapore',
      },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.valid).toBe(true);
    expect(body.customer_id).toBeTruthy();
  });

  test('Consumed code is rejected', async ({ request }) => {
    const response = await request.post('/api/codes/validate', {
      data: {
        code: consumedCode,
        email: `e2e-consumed2-${runId}@trainersource.test`,
        name: 'E2E Consumed Test',
        country: 'Singapore',
        city: 'Singapore',
      },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.valid).toBe(false);
    expect(body.reason).toBe('consumed');
  });

  test('Expired code is rejected', async ({ request }) => {
    const response = await request.post('/api/codes/validate', {
      data: {
        code: expiredCode,
        email: `e2e-expired-${runId}@trainersource.test`,
        name: 'E2E Expired Test',
        country: 'Singapore',
        city: 'Singapore',
      },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.valid).toBe(false);
    expect(body.reason).toBe('expired');
  });

  test('Returning customer bypasses code validation', async ({ request }) => {
    const response = await request.post('/api/codes/validate', {
      data: {
        code: 'ANYCODE1',
        email: returningEmail,
        name: 'E2E Returning Customer',
        country: 'Singapore',
        city: 'Singapore',
      },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.valid).toBe(true);
    expect(body.customer_id).toBeTruthy();
  });
});

test.describe('Protected Pages', () => {
  test('Dashboard redirects to login', async ({ page }) => {
    await page.goto('/dashboard');

    await expect(page).toHaveURL(/\/login/);
  });

  test('Admin redirects to login', async ({ page }) => {
    await page.goto('/admin');

    await expect(page).toHaveURL(/\/login/);
  });
});
