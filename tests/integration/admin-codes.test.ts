import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CODE_EXPIRY_DAYS } from '@/lib/constants';
import type { AccessCode, Admin, Customer, Trainer } from '@/lib/types';

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
const runId = randomUUID().replace(/-/g, '').slice(0, 12);
const codeExpiryWindowMs = CODE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
const expiryToleranceMs = 5 * 60 * 1000;

if (!supabaseUrl) {
  throw new Error('SUPABASE_URL is required for integration tests.');
}

if (!serviceRoleKey) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for integration tests.');
}

let supabase: SupabaseClient;

const createdAdmins = new Set<string>();
const createdTrainers = new Set<string>();
const createdAccessCodes = new Set<string>();
const createdCustomers = new Set<string>();

beforeAll(async () => {
  supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { error: deleteAdminError } = await supabase
    .from('admins')
    .delete()
    .eq('email', 'test-admin-codes@trainersource.test');

  if (deleteAdminError) {
    throw deleteAdminError;
  }

  const { data: admin, error: adminError } = await supabase
    .from('admins')
    .insert({
      email: 'test-admin-codes@trainersource.test',
      name: 'Test Admin Codes',
      role: 'superadmin',
    })
    .select('*')
    .single<Admin>();

  if (adminError) {
    throw adminError;
  }

  createdAdmins.add(admin.id);
});

afterAll(async () => {
  if (!supabase) {
    return;
  }

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
  }

  if (createdAccessCodes.size > 0) {
    const { error: deleteAccessCodesError } = await supabase
      .from('access_codes')
      .delete()
      .in('id', [...createdAccessCodes]);

    if (deleteAccessCodesError) {
      throw deleteAccessCodesError;
    }
  }

  if (createdTrainers.size > 0) {
    const { error: deleteTrainersError } = await supabase.from('trainers').delete().in('id', [...createdTrainers]);

    if (deleteTrainersError) {
      throw deleteTrainersError;
    }
  }

  if (createdAdmins.size > 0) {
    const { error: deleteAdminsError } = await supabase.from('admins').delete().in('id', [...createdAdmins]);

    if (deleteAdminsError) {
      throw deleteAdminsError;
    }
  }
});

describe('TrainerSource admin access code integration', () => {
  it('generates a single founder code', async () => {
    const expectedExpiry = Date.now() + codeExpiryWindowMs;
    const code = `F${randomUUID().replace(/-/g, '').slice(0, 7)}`.toUpperCase();
    const { data, error } = await supabase
      .from('access_codes')
      .insert({
        code,
        type: 'founder',
        trainer_id: null,
        status: 'active',
        expires_at: new Date(expectedExpiry).toISOString(),
      })
      .select('*')
      .single<AccessCode>();

    expect(error).toBeNull();

    if (!data) {
      throw new Error('Expected founder access code insert to return data.');
    }

    createdAccessCodes.add(data.id);
    expect(data.code).toMatch(/^[A-Z0-9]{8}$/);
    expect(data.trainer_id).toBeNull();
    expect(data.type).toBe('founder');
    expect(Math.abs(new Date(data.expires_at).getTime() - expectedExpiry)).toBeLessThan(expiryToleranceMs);
  });

  it('generates an organic code', async () => {
    const expectedExpiry = Date.now() + codeExpiryWindowMs;
    const code = `O${randomUUID().replace(/-/g, '').slice(0, 7)}`.toUpperCase();
    const { data, error } = await supabase
      .from('access_codes')
      .insert({
        code,
        type: 'organic',
        trainer_id: null,
        status: 'active',
        expires_at: new Date(expectedExpiry).toISOString(),
      })
      .select('*')
      .single<AccessCode>();

    expect(error).toBeNull();

    if (!data) {
      throw new Error('Expected organic access code insert to return data.');
    }

    createdAccessCodes.add(data.id);
    expect(data.code).toMatch(/^[A-Z0-9]{8}$/);
    expect(data.trainer_id).toBeNull();
    expect(data.type).toBe('organic');
    expect(Math.abs(new Date(data.expires_at).getTime() - expectedExpiry)).toBeLessThan(expiryToleranceMs);
  });

  it('founder code has no trainer attribution', async () => {
    const code = `F${randomUUID().replace(/-/g, '').slice(0, 7)}`.toUpperCase();
    const { data: accessCode, error: accessCodeError } = await supabase
      .from('access_codes')
      .insert({
        code,
        type: 'founder',
        trainer_id: null,
        status: 'active',
        expires_at: new Date(Date.now() + codeExpiryWindowMs).toISOString(),
      })
      .select('*')
      .single<AccessCode>();

    expect(accessCodeError).toBeNull();

    if (!accessCode) {
      throw new Error('Expected founder access code insert to return data.');
    }

    createdAccessCodes.add(accessCode.id);

    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .insert({
        email: `founder-customer-${runId}-${randomUUID()}@trainersource.test`,
        name: 'Founder Customer',
        country: 'Singapore',
        city: 'Singapore',
        trainer_id: null,
        access_code_id: accessCode.id,
      })
      .select('*')
      .single<Customer>();

    expect(customerError).toBeNull();

    if (!customer) {
      throw new Error('Expected founder customer insert to return data.');
    }

    createdCustomers.add(customer.id);

    const { data: consumedCode, error: consumeError } = await supabase
      .from('access_codes')
      .update({
        status: 'consumed',
        consumed_by: customer.id,
        consumed_at: new Date().toISOString(),
      })
      .eq('id', accessCode.id)
      .select('*')
      .single<AccessCode>();

    expect(consumeError).toBeNull();

    if (!consumedCode) {
      throw new Error('Expected founder access code update to return data.');
    }

    expect(customer.trainer_id).toBeNull();
    expect(consumedCode.trainer_id).toBeNull();
    expect(consumedCode.consumed_by).toBe(customer.id);
  });

  it('organic code has no trainer attribution', async () => {
    const code = `O${randomUUID().replace(/-/g, '').slice(0, 7)}`.toUpperCase();
    const { data: accessCode, error: accessCodeError } = await supabase
      .from('access_codes')
      .insert({
        code,
        type: 'organic',
        trainer_id: null,
        status: 'active',
        expires_at: new Date(Date.now() + codeExpiryWindowMs).toISOString(),
      })
      .select('*')
      .single<AccessCode>();

    expect(accessCodeError).toBeNull();

    if (!accessCode) {
      throw new Error('Expected organic access code insert to return data.');
    }

    createdAccessCodes.add(accessCode.id);

    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .insert({
        email: `organic-customer-${runId}-${randomUUID()}@trainersource.test`,
        name: 'Organic Customer',
        country: 'Singapore',
        city: 'Singapore',
        trainer_id: null,
        access_code_id: accessCode.id,
      })
      .select('*')
      .single<Customer>();

    expect(customerError).toBeNull();

    if (!customer) {
      throw new Error('Expected organic customer insert to return data.');
    }

    createdCustomers.add(customer.id);

    const { data: consumedCode, error: consumeError } = await supabase
      .from('access_codes')
      .update({
        status: 'consumed',
        consumed_by: customer.id,
        consumed_at: new Date().toISOString(),
      })
      .eq('id', accessCode.id)
      .select('*')
      .single<AccessCode>();

    expect(consumeError).toBeNull();

    if (!consumedCode) {
      throw new Error('Expected organic access code update to return data.');
    }

    expect(customer.trainer_id).toBeNull();
    expect(consumedCode.trainer_id).toBeNull();
    expect(consumedCode.consumed_by).toBe(customer.id);
  });

  it('code expiry works', async () => {
    const code = `X${randomUUID().replace(/-/g, '').slice(0, 7)}`.toUpperCase();
    const { data: accessCode, error: accessCodeError } = await supabase
      .from('access_codes')
      .insert({
        code,
        type: 'founder',
        trainer_id: null,
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

    const { data: expiredCodes, error: queryError } = await supabase
      .from('access_codes')
      .select('id, expires_at')
      .eq('id', accessCode.id)
      .lt('expires_at', new Date().toISOString());

    expect(queryError).toBeNull();
    expect(expiredCodes).toHaveLength(1);
    expect(expiredCodes?.[0]?.id).toBe(accessCode.id);
  });

  it('bulk code generation creates five unique valid codes', async () => {
    const { data, error } = await supabase
      .from('access_codes')
      .insert(
        Array.from({ length: 5 }, (_, index) => ({
          code: `B${index}${randomUUID().replace(/-/g, '').slice(0, 6)}`.toUpperCase(),
          type: index % 2 === 0 ? 'founder' : 'organic',
          trainer_id: null,
          status: 'active',
          expires_at: new Date(Date.now() + codeExpiryWindowMs).toISOString(),
        }))
      )
      .select('*');

    expect(error).toBeNull();
    expect(data).toHaveLength(5);

    for (const accessCode of data ?? []) {
      createdAccessCodes.add(accessCode.id);
      expect(accessCode.code).toMatch(/^[A-Z0-9]{8}$/);
    }

    expect(new Set((data ?? []).map((accessCode) => accessCode.code)).size).toBe(5);
  });

  it('queries codes by type', async () => {
    const trainerEmail = `type-trainer-${runId}-${randomUUID()}@trainersource.test`;
    const { data: trainer, error: trainerError } = await supabase
      .from('trainers')
      .insert({
        email: trainerEmail,
        name: 'Type Query Trainer',
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

    const { data: insertedCodes, error: insertError } = await supabase
      .from('access_codes')
      .insert([
        {
          code: `F${randomUUID().replace(/-/g, '').slice(0, 7)}`.toUpperCase(),
          type: 'founder',
          trainer_id: null,
          status: 'active',
          expires_at: new Date(Date.now() + codeExpiryWindowMs).toISOString(),
        },
        {
          code: `O${randomUUID().replace(/-/g, '').slice(0, 7)}`.toUpperCase(),
          type: 'organic',
          trainer_id: null,
          status: 'active',
          expires_at: new Date(Date.now() + codeExpiryWindowMs).toISOString(),
        },
        {
          code: `T${randomUUID().replace(/-/g, '').slice(0, 7)}`.toUpperCase(),
          type: 'trainer',
          trainer_id: trainer.id,
          status: 'active',
          expires_at: new Date(Date.now() + codeExpiryWindowMs).toISOString(),
        },
      ])
      .select('*');

    expect(insertError).toBeNull();

    for (const accessCode of insertedCodes ?? []) {
      createdAccessCodes.add(accessCode.id);
    }

    const insertedCodeIds = (insertedCodes ?? []).map((accessCode) => accessCode.id);

    const { data: founderCodes, error: founderQueryError } = await supabase
      .from('access_codes')
      .select('id, type')
      .in('id', insertedCodeIds)
      .eq('type', 'founder');

    expect(founderQueryError).toBeNull();
    expect(founderCodes).toHaveLength(1);
    expect(founderCodes?.[0]?.type).toBe('founder');

    const { data: organicCodes, error: organicQueryError } = await supabase
      .from('access_codes')
      .select('id, type')
      .in('id', insertedCodeIds)
      .eq('type', 'organic');

    expect(organicQueryError).toBeNull();
    expect(organicCodes).toHaveLength(1);
    expect(organicCodes?.[0]?.type).toBe('organic');

    const { data: trainerCodes, error: trainerQueryError } = await supabase
      .from('access_codes')
      .select('id, type, trainer_id')
      .in('id', insertedCodeIds)
      .eq('type', 'trainer');

    expect(trainerQueryError).toBeNull();
    expect(trainerCodes).toHaveLength(1);
    expect(trainerCodes?.[0]?.type).toBe('trainer');
    expect(trainerCodes?.[0]?.trainer_id).toBe(trainer.id);
  });

  it('queries codes by status', async () => {
    const activeCodeValue = `A${randomUUID().replace(/-/g, '').slice(0, 7)}`.toUpperCase();
    const { data: activeCode, error: activeCodeError } = await supabase
      .from('access_codes')
      .insert({
        code: activeCodeValue,
        type: 'founder',
        trainer_id: null,
        status: 'active',
        expires_at: new Date(Date.now() + codeExpiryWindowMs).toISOString(),
      })
      .select('*')
      .single<AccessCode>();

    expect(activeCodeError).toBeNull();

    if (!activeCode) {
      throw new Error('Expected active access code insert to return data.');
    }

    createdAccessCodes.add(activeCode.id);

    const consumedCodeValue = `C${randomUUID().replace(/-/g, '').slice(0, 7)}`.toUpperCase();
    const { data: consumedCode, error: consumedCodeError } = await supabase
      .from('access_codes')
      .insert({
        code: consumedCodeValue,
        type: 'organic',
        trainer_id: null,
        status: 'active',
        expires_at: new Date(Date.now() + codeExpiryWindowMs).toISOString(),
      })
      .select('*')
      .single<AccessCode>();

    expect(consumedCodeError).toBeNull();

    if (!consumedCode) {
      throw new Error('Expected consumed access code seed insert to return data.');
    }

    createdAccessCodes.add(consumedCode.id);

    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .insert({
        email: `status-customer-${runId}-${randomUUID()}@trainersource.test`,
        name: 'Status Customer',
        country: 'Singapore',
        city: 'Singapore',
        trainer_id: null,
        access_code_id: consumedCode.id,
      })
      .select('*')
      .single<Customer>();

    expect(customerError).toBeNull();

    if (!customer) {
      throw new Error('Expected status customer insert to return data.');
    }

    createdCustomers.add(customer.id);

    const { error: consumeError } = await supabase
      .from('access_codes')
      .update({
        status: 'consumed',
        consumed_by: customer.id,
        consumed_at: new Date().toISOString(),
      })
      .eq('id', consumedCode.id);

    expect(consumeError).toBeNull();

    const codeIds = [activeCode.id, consumedCode.id];

    const { data: activeCodes, error: activeQueryError } = await supabase
      .from('access_codes')
      .select('id, status')
      .in('id', codeIds)
      .eq('status', 'active');

    expect(activeQueryError).toBeNull();
    expect(activeCodes).toHaveLength(1);
    expect(activeCodes?.[0]?.id).toBe(activeCode.id);

    const { data: consumedCodes, error: consumedQueryError } = await supabase
      .from('access_codes')
      .select('id, status, consumed_by')
      .in('id', codeIds)
      .eq('status', 'consumed');

    expect(consumedQueryError).toBeNull();
    expect(consumedCodes).toHaveLength(1);
    expect(consumedCodes?.[0]?.id).toBe(consumedCode.id);
    expect(consumedCodes?.[0]?.consumed_by).toBe(customer.id);
  });
});
