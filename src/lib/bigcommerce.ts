import { randomBytes } from 'node:crypto';

type BigCommerceCustomerInput = {
  email: string;
  first_name: string;
  last_name: string;
  company?: string;
  phone?: string;
};

type BigCommerceCustomerRecord = {
  id: number;
  email?: string;
};

// Pulled out of the customer-create payload so the test suite can pin its
// shape without retrying the random output. The BC password policy is
// configurable per store, but the BC defaults require length>=7 with at
// least one upper, one lower, and one digit. The random base64url chunk
// almost always satisfies that, and the `A1!` suffix guarantees it even
// if the operator tightened the policy to require a symbol.
export function generateBigCommercePassword(): string {
  return `${randomBytes(24).toString('base64url')}A1!`;
}

export type CreateBigCommerceCustomerResult = {
  id: number;
  // `true` when this call actually inserted the customer; `false` when a
  // 422 duplicate-email response forced us to fall back to the existing
  // record (race with a concurrent request). The validate route uses this
  // to decide whether to send the storefront welcome email — we only want
  // to send it on the first-ever account creation.
  created: boolean;
};

type BigCommerceListResponse<T> = {
  data: T[];
};

type BigCommerceErrorResponse = {
  title?: string;
  detail?: string;
  errors?: Record<string, string>;
};

class BigCommerceApiError extends Error {
  status: number;
  details: BigCommerceErrorResponse | null;

  constructor(status: number, message: string, details: BigCommerceErrorResponse | null) {
    super(message);
    this.name = 'BigCommerceApiError';
    this.status = status;
    this.details = details;
  }
}

function getBigCommerceConfig() {
  const storeHash = process.env.BIGCOMMERCE_STORE_HASH;
  const accessToken = process.env.BIGCOMMERCE_ACCESS_TOKEN;

  if (!storeHash || !accessToken) {
    throw new Error('Missing BigCommerce configuration');
  }

  return {
    baseUrl: `https://api.bigcommerce.com/stores/${storeHash}/v3`,
    accessToken,
  };
}

async function parseJson<T>(response: Response): Promise<T | null> {
  const text = await response.text();

  if (!text) {
    return null;
  }

  return JSON.parse(text) as T;
}

async function bigCommerceFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const { baseUrl, accessToken } = getBigCommerceConfig();
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      'X-Auth-Token': accessToken,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });

  const payload = await parseJson<T | BigCommerceErrorResponse>(response);

  if (!response.ok) {
    const errorPayload = payload as BigCommerceErrorResponse | null;
    const message =
      errorPayload?.title ?? errorPayload?.detail ?? `BigCommerce request failed with status ${response.status}`;

    throw new BigCommerceApiError(response.status, message, errorPayload);
  }

  return payload as T;
}

export async function getBigCommerceCustomerByEmail(
  email: string,
): Promise<{ id: number } | null> {
  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail) {
    return null;
  }

  const response = await bigCommerceFetch<BigCommerceListResponse<BigCommerceCustomerRecord>>(
    `/customers?email:in=${encodeURIComponent(normalizedEmail)}`,
    {
      method: 'GET',
    },
  );

  const customer = response.data[0];

  return customer ? { id: customer.id } : null;
}

export async function createBigCommerceCustomer(
  params: BigCommerceCustomerInput,
): Promise<CreateBigCommerceCustomerResult> {
  try {
    const response = await bigCommerceFetch<BigCommerceListResponse<BigCommerceCustomerRecord>>(
      '/customers',
      {
        method: 'POST',
        body: JSON.stringify([
          {
            email: params.email.trim().toLowerCase(),
            first_name: params.first_name.trim(),
            last_name: params.last_name.trim(),
            ...(params.company ? { company: params.company.trim() } : {}),
            ...(params.phone ? { phone: params.phone.trim() } : {}),
            // SHA-122: BC v3 customer-create previously omitted the
            // authentication block, so the row landed with no password and
            // no BC-side welcome/reset email. A returning customer who
            // cleared localStorage (or switched device) then hit the
            // storefront login form with nothing to type. We now mint a
            // strong random password and flip `force_password_reset`, so
            // the account exists with valid credentials AND BC will
            // require a customer-driven reset on first form login. The
            // welcome email shipped by the validate route gives the
            // customer the reset link directly so they never see a
            // dead-end "wrong password" screen.
            authentication: {
              force_password_reset: true,
              new_password: generateBigCommercePassword(),
            },
          },
        ]),
      },
    );

    const customer = response.data[0];

    if (!customer) {
      throw new Error('BigCommerce customer creation returned no customer data');
    }

    return { id: customer.id, created: true };
  } catch (error) {
    if (error instanceof BigCommerceApiError && error.status === 422) {
      const existingCustomer = await getBigCommerceCustomerByEmail(params.email);

      if (existingCustomer) {
        return { id: existingCustomer.id, created: false };
      }
    }

    throw error;
  }
}
