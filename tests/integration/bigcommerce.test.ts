import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { createBigCommerceCustomer, getBigCommerceCustomerByEmail } from '@/lib/bigcommerce';

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

const runId = randomUUID().replace(/-/g, '').slice(0, 12);
const hasRealBigCommerceCredentials =
  Boolean(process.env.BIGCOMMERCE_STORE_HASH) &&
  Boolean(process.env.BIGCOMMERCE_ACCESS_TOKEN) &&
  process.env.BIGCOMMERCE_STORE_HASH !== 'your_store_hash_here' &&
  process.env.BIGCOMMERCE_ACCESS_TOKEN !== 'your_access_token_here';

const createdBigCommerceCustomerIds: number[] = [];

afterAll(async () => {
  if (!hasRealBigCommerceCredentials || createdBigCommerceCustomerIds.length === 0) {
    return;
  }

  const storeHash = process.env.BIGCOMMERCE_STORE_HASH;
  const accessToken = process.env.BIGCOMMERCE_ACCESS_TOKEN;

  if (!storeHash || !accessToken) {
    return;
  }

  const response = await fetch(
    `https://api.bigcommerce.com/stores/${storeHash}/v3/customers?id:in=${createdBigCommerceCustomerIds.join(',')}`,
    {
      method: 'DELETE',
      headers: {
        'X-Auth-Token': accessToken,
        Accept: 'application/json',
      },
    },
  );

  if (!response.ok) {
    console.warn(`Leftover BigCommerce test customers: ${createdBigCommerceCustomerIds.join(', ')}`);
  }
});

describe('BigCommerce integration', () => {
  it('BigCommerce client module exports expected functions', async () => {
    expect(typeof createBigCommerceCustomer).toBe('function');
    expect(typeof getBigCommerceCustomerByEmail).toBe('function');
  });

  it('throws when createBigCommerceCustomer is called without BigCommerce env vars', async () => {
    const originalStoreHash = process.env.BIGCOMMERCE_STORE_HASH;
    const originalAccessToken = process.env.BIGCOMMERCE_ACCESS_TOKEN;

    delete process.env.BIGCOMMERCE_STORE_HASH;
    delete process.env.BIGCOMMERCE_ACCESS_TOKEN;

    try {
      await expect(
        createBigCommerceCustomer({
          email: `bc-missing-create-${runId}@trainersource.test`,
          first_name: 'Missing',
          last_name: 'Env',
        })
      ).rejects.toThrow('Missing BigCommerce configuration');
    } finally {
      if (originalStoreHash === undefined) {
        delete process.env.BIGCOMMERCE_STORE_HASH;
      } else {
        process.env.BIGCOMMERCE_STORE_HASH = originalStoreHash;
      }

      if (originalAccessToken === undefined) {
        delete process.env.BIGCOMMERCE_ACCESS_TOKEN;
      } else {
        process.env.BIGCOMMERCE_ACCESS_TOKEN = originalAccessToken;
      }
    }
  });

  it('throws when getBigCommerceCustomerByEmail is called without BigCommerce env vars', async () => {
    const originalStoreHash = process.env.BIGCOMMERCE_STORE_HASH;
    const originalAccessToken = process.env.BIGCOMMERCE_ACCESS_TOKEN;

    delete process.env.BIGCOMMERCE_STORE_HASH;
    delete process.env.BIGCOMMERCE_ACCESS_TOKEN;

    try {
      await expect(getBigCommerceCustomerByEmail(`bc-missing-lookup-${runId}@trainersource.test`)).rejects.toThrow(
        'Missing BigCommerce configuration',
      );
    } finally {
      if (originalStoreHash === undefined) {
        delete process.env.BIGCOMMERCE_STORE_HASH;
      } else {
        process.env.BIGCOMMERCE_STORE_HASH = originalStoreHash;
      }

      if (originalAccessToken === undefined) {
        delete process.env.BIGCOMMERCE_ACCESS_TOKEN;
      } else {
        process.env.BIGCOMMERCE_ACCESS_TOKEN = originalAccessToken;
      }
    }
  });

  it('returns null when getBigCommerceCustomerByEmail receives an empty string', async () => {
    await expect(getBigCommerceCustomerByEmail('')).resolves.toBeNull();
  });
});

const describeBigCommerceLive = hasRealBigCommerceCredentials ? describe : describe.skip;

describeBigCommerceLive('BigCommerce live API integration', () => {
  it('createBigCommerceCustomer creates a customer', async () => {
    const email = `bc-create-${runId}@trainersource.test`;
    const customer = await createBigCommerceCustomer({
      email,
      first_name: 'Integration',
      last_name: 'Create',
    });

    expect(typeof customer.id).toBe('number');
    expect(customer.created).toBe(true);
    createdBigCommerceCustomerIds.push(customer.id);
  });

  it('getBigCommerceCustomerByEmail finds an existing customer', async () => {
    const email = `bc-lookup-${runId}@trainersource.test`;

    const createdCustomer = await createBigCommerceCustomer({
      email,
      first_name: 'Integration',
      last_name: 'Lookup',
    });

    createdBigCommerceCustomerIds.push(createdCustomer.id);
    expect(createdCustomer.created).toBe(true);

    const customer = await getBigCommerceCustomerByEmail(email);

    expect(customer).not.toBeNull();
    expect(customer?.id).toBe(createdCustomer.id);
  });

  it('duplicate customer creation is handled gracefully', async () => {
    const email = `bc-duplicate-${runId}@trainersource.test`;
    const input = {
      email,
      first_name: 'Integration',
      last_name: 'Duplicate',
    };

    const firstCustomer = await createBigCommerceCustomer(input);

    createdBigCommerceCustomerIds.push(firstCustomer.id);

    // SHA-122: createBigCommerceCustomer now returns {id, created} so the
    // validate route can decide whether to send the storefront welcome
    // email. The 422 duplicate-fallback path returns created:false.
    await expect(createBigCommerceCustomer(input)).resolves.toEqual({
      id: firstCustomer.id,
      created: false,
    });
  });
});
