import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';

import { CODE_EXPIRY_DAYS } from '@/lib/constants';
import type { AccessCode, Customer, Trainer } from '@/lib/types';

const envPath = path.resolve(process.cwd(), '.env.local');

if (existsSync(envPath)) {
  const envFile = readFileSync(envPath, 'utf8');

  for (const rawLine of envFile.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');

    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const codeExpiryWindowMs = CODE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

if (!supabaseUrl) {
  throw new Error('SUPABASE_URL is required for E2E tests.');
}

if (!serviceRoleKey) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for E2E tests.');
}

let supabase: SupabaseClient;

const createdTrainers = new Set<string>();
const createdAccessCodes = new Set<string>();
const createdCustomers = new Set<string>();

test.beforeAll(async () => {
  supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
});

test.afterEach(async () => {
  if (createdCustomers.size > 0) {
    const { error: unlinkError } = await supabase
      .from('access_codes')
      .update({ consumed_by: null, consumed_at: null })
      .in('consumed_by', [...createdCustomers]);

    if (unlinkError) {
      throw unlinkError;
    }

    const { error: deleteCustomersError } = await supabase.from('customers').delete().in('id', [...createdCustomers]);

    if (deleteCustomersError) {
      throw deleteCustomersError;
    }

    createdCustomers.clear();
  }

  if (createdAccessCodes.size > 0) {
    const { error: deleteAccessCodesError } = await supabase
      .from('access_codes')
      .delete()
      .in('id', [...createdAccessCodes]);

    if (deleteAccessCodesError) {
      throw deleteAccessCodesError;
    }

    createdAccessCodes.clear();
  }

  if (createdTrainers.size > 0) {
    const { error: deleteTrainersError } = await supabase.from('trainers').delete().in('id', [...createdTrainers]);

    if (deleteTrainersError) {
      throw deleteTrainersError;
    }

    createdTrainers.clear();
  }
});

test.describe('Access gate API', () => {
  test('POST /api/codes/validate with valid active code', async ({ request }) => {
    const trainerEmail = `access-gate-valid-trainer-${randomUUID()}@trainersource.test`;
    const { data: trainer, error: trainerError } = await supabase
      .from('trainers')
      .insert({
        email: trainerEmail,
        name: 'Access Gate Valid Trainer',
        country: 'Singapore',
        city: 'Singapore',
        status: 'active',
        commission_rate: 0.2,
        reorder_commission_rate: 0.1,
        max_clients: 100,
      })
      .select('*')
      .single<Trainer>();

    expect(trainerError).toBeNull();

    if (!trainer) {
      throw new Error('Expected trainer insert to return data.');
    }

    createdTrainers.add(trainer.id);

    const codeValue = `V${randomUUID().replace(/-/g, '').slice(0, 7)}`.toUpperCase();
    const { data: accessCode, error: accessCodeError } = await supabase
      .from('access_codes')
      .insert({
        code: codeValue,
        type: 'trainer',
        trainer_id: trainer.id,
        status: 'active',
        expires_at: new Date(Date.now() + codeExpiryWindowMs).toISOString(),
      })
      .select('*')
      .single<AccessCode>();

    expect(accessCodeError).toBeNull();

    if (!accessCode) {
      throw new Error('Expected access code insert to return data.');
    }

    createdAccessCodes.add(accessCode.id);

    const email = `access-gate-valid-customer-${randomUUID()}@trainersource.test`;
    const response = await request.post('/api/codes/validate', {
      data: {
        code: accessCode.code,
        email,
        name: 'Access Gate Valid Customer',
        country: 'Singapore',
        city: 'Singapore',
      },
      headers: {
        origin: 'https://ultimate-peptides.com',
      },
    });

    expect(response.status()).toBe(200);

    const body: { valid?: boolean; customer_id?: string } = await response.json();

    expect(body.valid).toBe(true);
    expect(body.customer_id).toBeTruthy();

    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select('*')
      .eq('id', body.customer_id ?? '')
      .single<Customer>();

    expect(customerError).toBeNull();

    if (!customer) {
      throw new Error('Expected customer lookup to return data.');
    }

    createdCustomers.add(customer.id);
    expect(customer.trainer_id).toBe(trainer.id);
    expect(customer.access_code_id).toBe(accessCode.id);

    const { data: storedCode, error: storedCodeError } = await supabase
      .from('access_codes')
      .select('*')
      .eq('id', accessCode.id)
      .single<AccessCode>();

    expect(storedCodeError).toBeNull();

    if (!storedCode) {
      throw new Error('Expected stored access code lookup to return data.');
    }

    expect(storedCode.status).toBe('consumed');
    expect(storedCode.consumed_by).toBe(customer.id);
  });

  test('POST /api/codes/validate with consumed code', async ({ request }) => {
    const trainerEmail = `access-gate-consumed-trainer-${randomUUID()}@trainersource.test`;
    const { data: trainer, error: trainerError } = await supabase
      .from('trainers')
      .insert({
        email: trainerEmail,
        name: 'Access Gate Consumed Trainer',
        country: 'Singapore',
        city: 'Singapore',
        status: 'active',
        commission_rate: 0.2,
        reorder_commission_rate: 0.1,
        max_clients: 100,
      })
      .select('*')
      .single<Trainer>();

    expect(trainerError).toBeNull();

    if (!trainer) {
      throw new Error('Expected trainer insert to return data.');
    }

    createdTrainers.add(trainer.id);

    const codeValue = `C${randomUUID().replace(/-/g, '').slice(0, 7)}`.toUpperCase();
    const { data: accessCode, error: accessCodeError } = await supabase
      .from('access_codes')
      .insert({
        code: codeValue,
        type: 'trainer',
        trainer_id: trainer.id,
        status: 'consumed',
        expires_at: new Date(Date.now() + codeExpiryWindowMs).toISOString(),
      })
      .select('*')
      .single<AccessCode>();

    expect(accessCodeError).toBeNull();

    if (!accessCode) {
      throw new Error('Expected consumed access code insert to return data.');
    }

    createdAccessCodes.add(accessCode.id);

    const response = await request.post('/api/codes/validate', {
      data: {
        code: accessCode.code,
        email: `access-gate-consumed-customer-${randomUUID()}@trainersource.test`,
        name: 'Access Gate Consumed Customer',
        country: 'Singapore',
        city: 'Singapore',
      },
      headers: {
        origin: 'https://ultimate-peptides.com',
      },
    });

    expect(response.status()).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      valid: false,
      reason: 'consumed',
    });
  });

  test('POST /api/codes/validate with expired code', async ({ request }) => {
    const trainerEmail = `access-gate-expired-trainer-${randomUUID()}@trainersource.test`;
    const { data: trainer, error: trainerError } = await supabase
      .from('trainers')
      .insert({
        email: trainerEmail,
        name: 'Access Gate Expired Trainer',
        country: 'Singapore',
        city: 'Singapore',
        status: 'active',
        commission_rate: 0.2,
        reorder_commission_rate: 0.1,
        max_clients: 100,
      })
      .select('*')
      .single<Trainer>();

    expect(trainerError).toBeNull();

    if (!trainer) {
      throw new Error('Expected trainer insert to return data.');
    }

    createdTrainers.add(trainer.id);

    const codeValue = `E${randomUUID().replace(/-/g, '').slice(0, 7)}`.toUpperCase();
    const { data: accessCode, error: accessCodeError } = await supabase
      .from('access_codes')
      .insert({
        code: codeValue,
        type: 'trainer',
        trainer_id: trainer.id,
        status: 'active',
        expires_at: new Date(Date.now() - 60 * 1000).toISOString(),
      })
      .select('*')
      .single<AccessCode>();

    expect(accessCodeError).toBeNull();

    if (!accessCode) {
      throw new Error('Expected expired access code insert to return data.');
    }

    createdAccessCodes.add(accessCode.id);

    const response = await request.post('/api/codes/validate', {
      data: {
        code: accessCode.code,
        email: `access-gate-expired-customer-${randomUUID()}@trainersource.test`,
        name: 'Access Gate Expired Customer',
        country: 'Singapore',
        city: 'Singapore',
      },
      headers: {
        origin: 'https://ultimate-peptides.com',
      },
    });

    expect(response.status()).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      valid: false,
      reason: 'expired',
    });
  });

  test('POST /api/codes/validate returning customer', async ({ request }) => {
    const trainerEmail = `access-gate-returning-trainer-${randomUUID()}@trainersource.test`;
    const { data: trainer, error: trainerError } = await supabase
      .from('trainers')
      .insert({
        email: trainerEmail,
        name: 'Access Gate Returning Trainer',
        country: 'Singapore',
        city: 'Singapore',
        status: 'active',
        commission_rate: 0.2,
        reorder_commission_rate: 0.1,
        max_clients: 100,
      })
      .select('*')
      .single<Trainer>();

    expect(trainerError).toBeNull();

    if (!trainer) {
      throw new Error('Expected trainer insert to return data.');
    }

    createdTrainers.add(trainer.id);

    const codeValue = `R${randomUUID().replace(/-/g, '').slice(0, 7)}`.toUpperCase();
    const { data: accessCode, error: accessCodeError } = await supabase
      .from('access_codes')
      .insert({
        code: codeValue,
        type: 'trainer',
        trainer_id: trainer.id,
        status: 'active',
        expires_at: new Date(Date.now() + codeExpiryWindowMs).toISOString(),
      })
      .select('*')
      .single<AccessCode>();

    expect(accessCodeError).toBeNull();

    if (!accessCode) {
      throw new Error('Expected returning-customer access code insert to return data.');
    }

    createdAccessCodes.add(accessCode.id);

    const email = `access-gate-returning-customer-${randomUUID()}@trainersource.test`;
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .insert({
        email,
        name: 'Returning Customer',
        country: 'Singapore',
        city: 'Singapore',
        trainer_id: trainer.id,
        access_code_id: accessCode.id,
      })
      .select('*')
      .single<Customer>();

    expect(customerError).toBeNull();

    if (!customer) {
      throw new Error('Expected returning customer insert to return data.');
    }

    createdCustomers.add(customer.id);

    const { error: consumeError } = await supabase
      .from('access_codes')
      .update({
        status: 'consumed',
        consumed_by: customer.id,
        consumed_at: new Date().toISOString(),
      })
      .eq('id', accessCode.id);

    expect(consumeError).toBeNull();

    const response = await request.post('/api/codes/validate', {
      data: {
        code: accessCode.code,
        email,
        name: 'Returning Customer',
        country: 'Singapore',
        city: 'Singapore',
      },
      headers: {
        origin: 'https://ultimate-peptides.com',
      },
    });

    expect(response.status()).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      valid: true,
      customer_id: customer.id,
    });
  });

  test('POST /api/codes/validate code not found', async ({ request }) => {
    const response = await request.post('/api/codes/validate', {
      data: {
        code: 'ZZZZZZZZ',
        email: `access-gate-not-found-${randomUUID()}@trainersource.test`,
        name: 'Unknown Customer',
        country: 'Singapore',
        city: 'Singapore',
      },
      headers: {
        origin: 'https://ultimate-peptides.com',
      },
    });

    expect(response.status()).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      valid: false,
      reason: 'not_found',
    });
  });

  test('POST /api/admin/codes returns 401 for unauthenticated requests', async ({ request }) => {
    const response = await request.post('/api/admin/codes', {
      data: {
        type: 'founder',
        count: 1,
      },
    });

    expect(response.status()).toBe(401);
  });
});
