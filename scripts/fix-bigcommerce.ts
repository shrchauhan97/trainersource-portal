import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

type BigCommercePage = {
  id: number;
  name?: string | null;
  title?: string | null;
  body?: string | null;
  meta_description?: string | null;
  search_keywords?: string | null;
};

type BigCommerceBlogPost = {
  id: number;
  title?: string | null;
};

type BigCommerceBrand = {
  id: number;
  name: string;
};

type BigCommerceV3ListResponse<T> = {
  data: T[];
};

const SOURCE_EMAIL = 'support@powerpepgroup.com';
const TARGET_EMAIL = 'support@ultimate-peptides.com';
const PLACEHOLDER_BRANDS = new Set(['common good', 'ofs', 'sagaform']);
const DEFAULT_BLOG_POST_TITLE = 'Your first blog post!';
const PAGE_FIELDS_TO_CHECK = [
  'name',
  'title',
  'body',
  'meta_description',
  'search_keywords',
] as const;

type PageField = (typeof PAGE_FIELDS_TO_CHECK)[number];

const execute = process.argv.includes('--execute');
const dryRun = !execute || process.argv.includes('--dry-run');

function loadLocalEnv() {
  const envPath = path.join(process.cwd(), '.env.local');

  if (!existsSync(envPath)) {
    return;
  }

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
    const value = line.slice(separatorIndex + 1).trim();

    if (!key || key in process.env) {
      continue;
    }

    const unquotedValue =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
        ? value.slice(1, -1)
        : value;

    process.env[key] = unquotedValue;
  }
}

function getBigCommerceConfig() {
  const storeHash = process.env.BIGCOMMERCE_STORE_HASH;
  const accessToken = process.env.BIGCOMMERCE_ACCESS_TOKEN;

  if (!storeHash || !accessToken) {
    throw new Error('Missing BIGCOMMERCE_STORE_HASH or BIGCOMMERCE_ACCESS_TOKEN');
  }

  return {
    storeHash,
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

async function bigCommerceFetch<T>(
  apiVersion: 'v2' | 'v3',
  path: string,
  init?: RequestInit,
): Promise<T> {
  const { storeHash, accessToken } = getBigCommerceConfig();
  const response = await fetch(`https://api.bigcommerce.com/stores/${storeHash}/${apiVersion}${path}`, {
    ...init,
    headers: {
      'X-Auth-Token': accessToken,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  const payload = await parseJson<T | { title?: string; detail?: string }>(response);

  if (!response.ok) {
    const message =
      (payload as { title?: string; detail?: string } | null)?.title ??
      (payload as { title?: string; detail?: string } | null)?.detail ??
      `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return payload as T;
}

function buildPageUpdates(page: BigCommercePage) {
  const updates: Partial<Record<PageField, string>> = {};

  for (const field of PAGE_FIELDS_TO_CHECK) {
    const currentValue = page[field];

    if (typeof currentValue !== 'string' || !currentValue.includes(SOURCE_EMAIL)) {
      continue;
    }

    updates[field] = currentValue.split(SOURCE_EMAIL).join(TARGET_EMAIL);
  }

  return updates;
}

async function fixEmailDomains() {
  console.log(`Checking pages for ${SOURCE_EMAIL} → ${TARGET_EMAIL}`);
  const pages = await bigCommerceFetch<BigCommercePage[]>('v2', '/pages', {
    method: 'GET',
  });

  let updatedCount = 0;

  for (const page of pages) {
    const updates = buildPageUpdates(page);
    const changedFields = Object.keys(updates);

    if (!changedFields.length) {
      console.log(`- Page #${page.id} already clean${page.name ? ` (${page.name})` : ''}`);
      continue;
    }

    updatedCount += 1;
    console.log(
      `- ${dryRun ? '[dry-run] Would update' : 'Updating'} page #${page.id}${page.name ? ` (${page.name})` : ''} fields: ${changedFields.join(', ')}`,
    );

    if (!dryRun) {
      await bigCommerceFetch<BigCommercePage>('v2', `/pages/${page.id}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      });
    }
  }

  if (!updatedCount) {
    console.log('- No page email updates needed');
  }
}

async function deletePlaceholderBrands() {
  console.log('Checking placeholder brands');
  const response = await bigCommerceFetch<BigCommerceV3ListResponse<BigCommerceBrand>>(
    'v3',
    '/catalog/brands?limit=250',
    {
      method: 'GET',
    },
  );
  const brands = response.data;
  const matchedBrandNames = new Set<string>();

  for (const brand of brands) {
    if (!PLACEHOLDER_BRANDS.has(brand.name.trim().toLowerCase())) {
      continue;
    }

    matchedBrandNames.add(brand.name.trim().toLowerCase());
    console.log(`- ${dryRun ? '[dry-run] Would delete' : 'Deleting'} brand #${brand.id} (${brand.name})`);

    if (!dryRun) {
      await bigCommerceFetch<null>('v3', `/catalog/brands/${brand.id}`, {
        method: 'DELETE',
      });
    }
  }

  for (const name of PLACEHOLDER_BRANDS) {
    if (!matchedBrandNames.has(name)) {
      console.log(`- Brand already absent: ${name}`);
    }
  }
}

async function deleteDefaultBlogPost() {
  console.log('Checking default blog posts');
  const posts = await bigCommerceFetch<BigCommerceBlogPost[]>('v2', '/blog/posts', {
    method: 'GET',
  });
  const defaultPosts = posts.filter((post) => post.title?.trim() === DEFAULT_BLOG_POST_TITLE);

  if (!defaultPosts.length) {
    console.log('- Default blog post already absent');
    return;
  }

  for (const post of defaultPosts) {
    console.log(`- ${dryRun ? '[dry-run] Would delete' : 'Deleting'} blog post #${post.id} (${post.title})`);

    if (!dryRun) {
      await bigCommerceFetch<null>('v2', `/blog/posts/${post.id}`, {
        method: 'DELETE',
      });
    }
  }
}

async function main() {
  loadLocalEnv();
  console.log(dryRun ? 'Running BigCommerce maintenance in dry-run mode' : 'Running BigCommerce maintenance in execute mode');

  await fixEmailDomains();
  await deletePlaceholderBrands();
  await deleteDefaultBlogPost();

  console.log('Currency default must be updated manually in BigCommerce dashboard: Settings → Currencies');
}

main().catch((error) => {
  console.error('BigCommerce maintenance failed');
  console.error(error);
  process.exitCode = 1;
});
