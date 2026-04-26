This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Telegram Mini Apps

The portal hosts Telegram Mini App routes under `/mini/*`:

- `/mini/launcher` — BotFather-registered entrypoint, routes by `?app=` param
- `/mini/calc` — Reconstitution calculator (M1)
- `/mini/reorder` — Reorder (M2)
- `/mini/partner` — Partner dashboard (M3)

### M2 Reorder

`/mini/reorder` loads the authenticated customer's last 5 BigCommerce orders
as cards, lets them multi-select SKUs, and redirects to BC checkout via
Customer Login SSO.

Env required on Vercel:
- `BC_CLIENT_ID` — BC App client id (distinct from BIGCOMMERCE_ACCESS_TOKEN)
- `BC_CLIENT_SECRET` — BC App client secret (HS256 JWT signing key)
- `BC_STORE_URL` — storefront base URL (default `https://ultimate-peptides.com`)
- `BIGCOMMERCE_STORE_HASH` — shared with `src/lib/bigcommerce.ts`
- `BIGCOMMERCE_ACCESS_TOKEN` — shared with `src/lib/bigcommerce.ts`
- `TELEGRAM_BOT_TOKEN` — same value as bot's Railway env (used to verify initData HMAC)
- `SUPABASE_SERVICE_ROLE_KEY` + `NEXT_PUBLIC_SUPABASE_URL` (or `SUPABASE_URL`)

Flow: Mini App → `GET /api/reorder/orders` (verify initData → look up
`bc_customer_id` in `bc_customer_links` → BC v2 orders + products + images) →
user selects → `POST /api/reorder/checkout` (re-verify ownership → aggregate
SKUs by summing quantities → BC v3 cart → mint Customer Login JWT → return
redirect URL) → Mini App calls `Telegram.WebApp.openLink` → BC
`/login/token/<jwt>` → `/cart.php`.

Security hardening in the route handlers:
- HMAC-SHA256 initData verification with timing-safe comparison
- 24h `auth_date` staleness window + 60s clock-skew tolerance for future-dated values
- IDOR prevention: client-supplied `selected_order_ids` are re-verified against the customer's server-fetched recent orders
- No BC upstream response bodies are leaked to the client — all 502/500 paths use `console.error` server-side and return minimal generic client messages
- Service-role Supabase client; `bc_customer_links` RLS permits only service role
