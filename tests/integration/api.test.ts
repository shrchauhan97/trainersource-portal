import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { calculateCommission } from '@/lib/commission';
import {
  CODE_EXPIRY_DAYS,
  COMMISSION_FIRST_SALE,
  COMMISSION_REORDER,
} from '@/lib/constants';
import type { AccessCode, Admin, Commission, Customer, Order, Payout, Trainer, TrainerStatus } from '@/lib/types';

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

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error('SUPABASE_URL is required for integration tests.');
}

if (!serviceRoleKey) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for integration tests.');
}

const runId = randomUUID().replace(/-/g, '').slice(0, 12);

let supabase: SupabaseClient;
let seededTrainer: Trainer;
let seededActiveCode: AccessCode;
let seededExpiredCode: AccessCode;
let seededCustomer: Customer;
let seededCommission: Commission;

const createdAdmins = new Set<string>();
const createdTrainers = new Set<string>();
const createdAccessCodes = new Set<string>();
const createdCustomers = new Set<string>();
const createdOrders = new Set<string>();
const createdCommissions = new Set<string>();
const createdPayouts = new Set<string>();

beforeAll(async () => {
  supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data: staleTrainer } = await supabase
    .from('trainers')
    .select('id')
    .eq('email', 'test-trainer@trainersource.test')
    .maybeSingle<{ id: string }>();

  if (staleTrainer) {
    const { data: staleCustomers } = await supabase
      .from('customers')
      .select('id')
      .eq('trainer_id', staleTrainer.id);

    const { data: staleAccessCodes } = await supabase
      .from('access_codes')
      .select('id')
      .eq('trainer_id', staleTrainer.id);

    const staleCustomerIds = (staleCustomers ?? []).map((customer) => customer.id);
    const staleAccessCodeIds = (staleAccessCodes ?? []).map((accessCode) => accessCode.id);

    const { data: staleOrders } = await supabase
      .from('orders')
      .select('id')
      .eq('trainer_id', staleTrainer.id);

    const staleOrderIds = (staleOrders ?? []).map((order) => order.id);

    if (staleOrderIds.length > 0) {
      const { error } = await supabase.from('commissions').delete().in('order_id', staleOrderIds);

      if (error) {
        throw error;
      }
    }

    {
      const { error } = await supabase.from('payouts').delete().eq('trainer_id', staleTrainer.id);

      if (error) {
        throw error;
      }
    }

    if (staleOrderIds.length > 0) {
      const { error } = await supabase.from('orders').delete().in('id', staleOrderIds);

      if (error) {
        throw error;
      }
    }

    if (staleCustomerIds.length > 0) {
      const { error: unlinkError } = await supabase
        .from('access_codes')
        .update({ consumed_by: null, consumed_at: null })
        .in('consumed_by', staleCustomerIds);

      if (unlinkError) {
        throw unlinkError;
      }

      const { error } = await supabase.from('customers').delete().in('id', staleCustomerIds);

      if (error) {
        throw error;
      }
    }

    if (staleAccessCodeIds.length > 0) {
      const { error } = await supabase.from('access_codes').delete().in('id', staleAccessCodeIds);

      if (error) {
        throw error;
      }
    }

    {
      const { error } = await supabase.from('trainers').delete().eq('id', staleTrainer.id);

      if (error) {
        throw error;
      }
    }
  }

  {
    const { error } = await supabase.from('admins').delete().eq('email', 'test-admin@trainersource.test');

    if (error) {
      throw error;
    }
  }

  const { data: admin, error: adminError } = await supabase
    .from('admins')
    .insert({
      email: 'test-admin@trainersource.test',
      name: 'Test Admin',
      role: 'superadmin',
    })
    .select('*')
    .single<Admin>();

  if (adminError) {
    throw adminError;
  }

  createdAdmins.add(admin.id);

  const { data: trainer, error: trainerError } = await supabase
    .from('trainers')
    .insert({
      email: 'test-trainer@trainersource.test',
      name: 'Test Trainer',
      country: 'Singapore',
      city: 'Singapore',
      status: 'active',
      commission_rate: 0.2,
      reorder_commission_rate: 0.1,
      max_clients: 100,
    })
    .select('*')
    .single<Trainer>();

  if (trainerError) {
    throw trainerError;
  }

  seededTrainer = trainer;
  createdTrainers.add(trainer.id);

  const activeCodeValue = `A${runId.slice(0, 7)}`.toUpperCase();
  const expiredCodeValue = `E${runId.slice(0, 7)}`.toUpperCase();

  const { data: activeCode, error: activeCodeError } = await supabase
    .from('access_codes')
    .insert({
      code: activeCodeValue,
      type: 'trainer',
      trainer_id: trainer.id,
      status: 'active',
      expires_at: new Date(Date.now() + CODE_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    })
    .select('*')
    .single<AccessCode>();

  if (activeCodeError) {
    throw activeCodeError;
  }

  seededActiveCode = activeCode;
  createdAccessCodes.add(activeCode.id);

  const { data: expiredCode, error: expiredCodeError } = await supabase
    .from('access_codes')
    .insert({
      code: expiredCodeValue,
      type: 'trainer',
      trainer_id: trainer.id,
      status: 'expired',
      expires_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    })
    .select('*')
    .single<AccessCode>();

  if (expiredCodeError) {
    throw expiredCodeError;
  }

  seededExpiredCode = expiredCode;
  createdAccessCodes.add(expiredCode.id);

  const { data: customer, error: customerError } = await supabase
    .from('customers')
    .insert({
      email: `test-customer-${runId}@trainersource.test`,
      name: 'Test Customer',
      country: 'Singapore',
      city: 'Singapore',
      trainer_id: trainer.id,
      access_code_id: activeCode.id,
    })
    .select('*')
    .single<Customer>();

  if (customerError) {
    throw customerError;
  }

  seededCustomer = customer;
  createdCustomers.add(customer.id);

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      bigcommerce_order_id: `seed-order-${runId}`,
      customer_id: customer.id,
      trainer_id: trainer.id,
      total: 100,
      status: 'paid',
      country: 'Singapore',
      city: 'Singapore',
    })
    .select('*')
    .single<Order>();

  if (orderError) {
    throw orderError;
  }

  createdOrders.add(order.id);

  const { data: commission, error: commissionError } = await supabase
    .from('commissions')
    .insert({
      trainer_id: trainer.id,
      order_id: order.id,
      commission_type: 'first_sale',
      rate_snapshot: 0.2,
      amount: 20,
      status: 'pending',
    })
    .select('*')
    .single<Commission>();

  if (commissionError) {
    throw commissionError;
  }

  seededCommission = commission;
  createdCommissions.add(commission.id);
});

afterAll(async () => {
  if (!supabase) {
    return;
  }

  if (createdCommissions.size > 0) {
    const { error } = await supabase.from('commissions').delete().in('id', [...createdCommissions]);

    if (error) {
      throw error;
    }
  }

  if (createdOrders.size > 0) {
    const { error } = await supabase.from('orders').delete().in('id', [...createdOrders]);

    if (error) {
      throw error;
    }
  }

  if (createdCustomers.size > 0) {
    const { error: unlinkError } = await supabase
      .from('access_codes')
      .update({ consumed_by: null, consumed_at: null })
      .in('consumed_by', [...createdCustomers]);

    if (unlinkError) {
      throw unlinkError;
    }

    const { error } = await supabase.from('customers').delete().in('id', [...createdCustomers]);

    if (error) {
      throw error;
    }
  }

  if (createdAccessCodes.size > 0) {
    const { error } = await supabase.from('access_codes').delete().in('id', [...createdAccessCodes]);

    if (error) {
      throw error;
    }
  }

  if (createdPayouts.size > 0) {
    const { error } = await supabase.from('payouts').delete().in('id', [...createdPayouts]);

    if (error) {
      throw error;
    }
  }

  if (createdTrainers.size > 0) {
    const { error } = await supabase.from('trainers').delete().in('id', [...createdTrainers]);

    if (error) {
      throw error;
    }
  }

  if (createdAdmins.size > 0) {
    const { error } = await supabase.from('admins').delete().in('id', [...createdAdmins]);

    if (error) {
      throw error;
    }
  }
});

describe('TrainerSource live Supabase integration', () => {
  describe('Database Schema Validation', () => {
    it('verifies all tables exist and are queryable', async () => {
      for (const tableName of ['admins', 'trainers', 'access_codes', 'customers', 'orders', 'commissions', 'payouts']) {
        const { count, error } = await supabase.from(tableName).select('*', { count: 'exact', head: true });

        expect(error).toBeNull();
        expect(count).not.toBeUndefined();
      }
    });

    it('inserts and reads trainers with every status enum value', async () => {
      const statuses: TrainerStatus[] = ['applied', 'onboarding', 'active', 'suspended'];
      const insertedTrainerIds: string[] = [];

      for (const status of statuses) {
        const { data, error } = await supabase
          .from('trainers')
          .insert({
            email: `${status}-${runId}@trainersource.test`,
            name: `${status} trainer`,
            country: 'Singapore',
            city: 'Singapore',
            status,
            commission_rate: 0.2,
            reorder_commission_rate: 0.1,
            max_clients: 100,
          })
          .select('*')
          .single<Trainer>();

        expect(error).toBeNull();

        if (!data) {
          throw new Error(`Expected trainer insert to return data for status ${status}.`);
        }

        expect(data.status).toBe(status);
        insertedTrainerIds.push(data.id);
        createdTrainers.add(data.id);
      }

      const { data: trainers, error } = await supabase
        .from('trainers')
        .select('id, status')
        .in('id', insertedTrainerIds);

      expect(error).toBeNull();
      expect((trainers ?? []).map((trainer) => trainer.status).sort()).toEqual([...statuses].sort());
    });

    it('enforces foreign key constraints', async () => {
      const { error } = await supabase.from('orders').insert({
        bigcommerce_order_id: `fk-failure-${runId}`,
        customer_id: randomUUID(),
        trainer_id: seededTrainer.id,
        total: 50,
        status: 'pending',
      });

      expect(error).not.toBeNull();
      expect(error?.code).toBe('23503');
    });

    it('enforces unique trainer emails', async () => {
      const { error } = await supabase.from('trainers').insert({
        email: seededTrainer.email,
        name: 'Duplicate Trainer',
        country: 'Singapore',
        city: 'Singapore',
        status: 'active',
        commission_rate: 0.2,
        reorder_commission_rate: 0.1,
        max_clients: 100,
      });

      expect(error).not.toBeNull();
      expect(error?.code).toBe('23505');
    });
  });

  describe('Access Code Lifecycle', () => {
    it('creates an active code and verifies its status', async () => {
      const { data, error } = await supabase
        .from('access_codes')
        .insert({
          code: `C${randomUUID().replace(/-/g, '').slice(0, 7)}`.toUpperCase(),
          type: 'trainer',
          trainer_id: seededTrainer.id,
          status: 'active',
          expires_at: new Date(Date.now() + CODE_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString(),
        })
        .select('*')
        .single<AccessCode>();

      expect(error).toBeNull();

      if (!data) {
        throw new Error('Expected access code insert to return data.');
      }

      expect(data.status).toBe('active');
      createdAccessCodes.add(data.id);
    });

    it('consumes a code and stores the customer reference', async () => {
      const { data: code, error: createError } = await supabase
        .from('access_codes')
        .insert({
          code: `U${randomUUID().replace(/-/g, '').slice(0, 7)}`.toUpperCase(),
          type: 'trainer',
          trainer_id: seededTrainer.id,
          status: 'active',
          expires_at: new Date(Date.now() + CODE_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString(),
        })
        .select('*')
        .single<AccessCode>();

      expect(createError).toBeNull();

      if (!code) {
        throw new Error('Expected access code insert to return data.');
      }

      createdAccessCodes.add(code.id);

      const consumedAt = new Date().toISOString();
      const { data: consumedCode, error: consumeError } = await supabase
        .from('access_codes')
        .update({
          status: 'consumed',
          consumed_by: seededCustomer.id,
          consumed_at: consumedAt,
        })
        .eq('id', code.id)
        .select('*')
        .single<AccessCode>();

      expect(consumeError).toBeNull();

      if (!consumedCode) {
        throw new Error('Expected consumed access code update to return data.');
      }

      if (!consumedCode.consumed_at) {
        throw new Error('Expected consumed access code to include consumed_at.');
      }

      expect(consumedCode.status).toBe('consumed');
      expect(consumedCode.consumed_by).toBe(seededCustomer.id);
      expect(new Date(consumedCode.consumed_at).toISOString()).toBe(consumedAt);
    });

    it('verifies the seeded expired code fields', () => {
      expect(seededExpiredCode.status).toBe('expired');
      expect(new Date(seededExpiredCode.expires_at).getTime()).toBeLessThan(Date.now());
      expect(seededExpiredCode.consumed_by).toBeNull();
    });

    it('enforces unique access codes', async () => {
      const { error } = await supabase.from('access_codes').insert({
        code: seededActiveCode.code,
        type: 'trainer',
        trainer_id: seededTrainer.id,
        status: 'active',
        expires_at: new Date(Date.now() + CODE_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString(),
      });

      expect(error).not.toBeNull();
      expect(error?.code).toBe('23505');
    });
  });

  describe('Commission Calculation', () => {
    it('calculates first-sale commission', () => {
      expect(
        calculateCommission(
          { total: 100 },
          { commission_rate: 0.2, reorder_commission_rate: 0.1 },
          true
        )
      ).toEqual({
        commissionType: 'first_sale',
        rate: 0.2,
        amount: 20,
      });
    });

    it('calculates reorder commission', () => {
      expect(
        calculateCommission(
          { total: 100 },
          { commission_rate: 0.2, reorder_commission_rate: 0.1 },
          false
        )
      ).toEqual({
        commissionType: 'reorder',
        rate: 0.1,
        amount: 10,
      });
    });

    it('falls back to default rates when configured rates are zero', () => {
      expect(calculateCommission({ total: 100 }, { commission_rate: 0, reorder_commission_rate: 0 }, true)).toEqual({
        commissionType: 'first_sale',
        rate: COMMISSION_FIRST_SALE,
        amount: 20,
      });

      expect(calculateCommission({ total: 100 }, { commission_rate: 0, reorder_commission_rate: 0 }, false)).toEqual({
        commissionType: 'reorder',
        rate: COMMISSION_REORDER,
        amount: 10,
      });
    });

    it('returns zero amount for zero-total orders', () => {
      expect(
        calculateCommission(
          { total: 0 },
          { commission_rate: 0.2, reorder_commission_rate: 0.1 },
          true
        )
      ).toEqual({
        commissionType: 'first_sale',
        rate: 0.2,
        amount: 0,
      });
    });
  });

  describe('Order → Commission Flow', () => {
    it('creates an order, calculates commission, inserts the commission, and verifies links', async () => {
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          bigcommerce_order_id: `flow-order-${randomUUID()}`,
          customer_id: seededCustomer.id,
          trainer_id: seededTrainer.id,
          total: 100,
          status: 'paid',
          country: 'Singapore',
          city: 'Singapore',
        })
        .select('*')
        .single<Order>();

      expect(orderError).toBeNull();

      if (!order) {
        throw new Error('Expected order insert to return data.');
      }

      createdOrders.add(order.id);

      const commissionCalculation = calculateCommission(order, seededTrainer, true);

      const { data: commission, error: commissionError } = await supabase
        .from('commissions')
        .insert({
          trainer_id: seededTrainer.id,
          order_id: order.id,
          commission_type: commissionCalculation.commissionType,
          rate_snapshot: commissionCalculation.rate,
          amount: commissionCalculation.amount,
          status: 'pending',
        })
        .select('*')
        .single<Commission>();

      expect(commissionError).toBeNull();

      if (!commission) {
        throw new Error('Expected commission insert to return data.');
      }

      createdCommissions.add(commission.id);

      const { data: storedCommission, error: fetchError } = await supabase
        .from('commissions')
        .select('*')
        .eq('id', commission.id)
        .single<Commission>();

      expect(fetchError).toBeNull();

      if (!storedCommission) {
        throw new Error('Expected stored commission query to return data.');
      }

      expect(storedCommission.order_id).toBe(order.id);
      expect(storedCommission.trainer_id).toBe(seededTrainer.id);
      expect(storedCommission.status).toBe('pending');
    });
  });

  describe('Payout Batching', () => {
    it('batches an approved commission into a payout and marks it paid after confirmation', async () => {
      const { data: approvedCommission, error: approveError } = await supabase
        .from('commissions')
        .update({ status: 'approved' })
        .eq('id', seededCommission.id)
        .select('*')
        .single<Commission>();

      expect(approveError).toBeNull();

      if (!approvedCommission) {
        throw new Error('Expected commission approval update to return data.');
      }

      expect(approvedCommission.status).toBe('approved');

      const { data: payout, error: payoutError } = await supabase
        .from('payouts')
        .insert({
          trainer_id: seededTrainer.id,
          total: approvedCommission.amount,
          status: 'pending',
          period_start: new Date().toISOString().slice(0, 10),
          period_end: new Date().toISOString().slice(0, 10),
        })
        .select('*')
        .single<Payout>();

      expect(payoutError).toBeNull();

      if (!payout) {
        throw new Error('Expected payout insert to return data.');
      }

      createdPayouts.add(payout.id);
      expect(Number(payout.total)).toBe(Number(approvedCommission.amount));

      const { data: linkedCommission, error: linkError } = await supabase
        .from('commissions')
        .update({ payout_id: payout.id })
        .eq('id', approvedCommission.id)
        .select('*')
        .single<Commission>();

      expect(linkError).toBeNull();

      if (!linkedCommission) {
        throw new Error('Expected payout linkage update to return data.');
      }

      expect(linkedCommission.payout_id).toBe(payout.id);

      const { data: confirmedPayout, error: confirmError } = await supabase
        .from('payouts')
        .update({ status: 'confirmed' })
        .eq('id', payout.id)
        .select('*')
        .single<Payout>();

      expect(confirmError).toBeNull();

      if (!confirmedPayout) {
        throw new Error('Expected payout confirmation update to return data.');
      }

      expect(confirmedPayout.status).toBe('confirmed');

      const { data: paidCommission, error: paidError } = await supabase
        .from('commissions')
        .update({ status: 'paid' })
        .eq('id', approvedCommission.id)
        .select('*')
        .single<Commission>();

      expect(paidError).toBeNull();

      if (!paidCommission) {
        throw new Error('Expected paid commission update to return data.');
      }

      expect(paidCommission.status).toBe('paid');
    });
  });
});
