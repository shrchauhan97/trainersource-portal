# Supabase — setup + demo walkthrough

Everything in this directory is for spinning up a fresh Supabase project and
reproducing the end-to-end demo (landing → apply → admin approve → access code
validate → order/commission → payout). All scripts are idempotent and safe to
re-run.

## 1. Provision Supabase (one-time, ~2 min)

1. https://supabase.com → **New project** → region `Southeast Asia (Singapore)`
2. Save the DB password somewhere (not needed for dev, but you'll want it if you
   ever need direct psql access).
3. **Project Settings → API** — grab:
   - Project URL
   - `anon public` (or `sb_publishable_*`) key
   - `service_role` (or `sb_secret_*`) key — **secret, never commit**

## 2. Wire env

Copy `.env.example` at the repo root to `.env.local` and fill in:

- `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_URL` → project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_ANON_KEY` → anon key
- `SUPABASE_SERVICE_ROLE_KEY` → service role key
- `BIGCOMMERCE_WEBHOOK_SECRET` → any strong random string (used by the webhook
  handler; must match whatever you configure on the BC webhook destination)
- `ENABLE_DEV_LOGIN=1` → opens `/api/dev/login` for the walkthrough (see below).
  Leave blank in any shared environment.

## 3. Apply schema

Open https://supabase.com/dashboard/project/YOUR-REF/sql/new, paste the contents
of `schema.sql`, and run. Creates 7 tables + 9 enum types + indexes. Idempotent.

Then paste `rls.sql` and run. Enables RLS on all 7 tables and creates the
policy set that grants admins full access, trainers scoped access to their
own rows, and denies all anon access (review finding H3). Also idempotent.
Service-role traffic (webhooks, /api/codes/validate, /api/session/check,
the apply flow) bypasses RLS — application-level gating is the security
boundary for those paths.

## 4. Seed demo data

```
node supabase/seed.mjs
```

Creates two confirmed auth users and their matching domain rows:

| Role | Email | Password | Notes |
|---|---|---|---|
| Admin | `admin@demo.test` | `DemoAdmin123!` | `admins` row, role=superadmin |
| Trainer | `trainer@demo.test` | `DemoTrainer123!` | `trainers` row, status=active, 20%/10%, slug=`demo-trainer` |

Also mints one access code, `DEMO0001`, trainer-type, attributed to Demo Trainer,
7-day expiry.

Re-running the seed is safe — auth users and domain rows are looked up before
insert, and the access code is only created if missing.

## 5. Walk the demo

```
pnpm dev
```

Dev-login shortcut (requires `ENABLE_DEV_LOGIN=1` in `.env.local`):

- Admin: http://localhost:3000/api/dev/login?email=admin%40demo.test&password=DemoAdmin123%21&redirect=/admin
- Trainer: http://localhost:3000/api/dev/login?email=trainer%40demo.test&password=DemoTrainer123%21&redirect=/dashboard

Without the shortcut, the only login path is the magic-link flow at `/login`,
which requires a real inbox to click through.

### End-to-end flow

1. **Landing** → `/`
2. **Apply as a trainer** → `/apply` (fills `trainers` with `status=applied`)
3. **Admin login** → admin dev-login URL above → `/admin` shows 1 pending
4. **Approve applicant** → `/admin/trainers/[id]` → status=active
5. **Exercise C1 + H2 fixes** from a terminal:
   ```
   curl -X POST http://localhost:3000/api/codes/validate \
     -H "Content-Type: application/json" \
     -H "Origin: https://ultimate-peptides.com" \
     -d '{"code":"DEMO0001","email":"buyer@demo.test","name":"Test Buyer","country":"Singapore","city":"Singapore"}'
   # First call: {"valid":true,"customer_id":"..."}
   # Replay:     {"valid":false,"reason":"consumed"}  ← atomic consume
   ```
6. **Exercise C4 fix** (webhook auth):
   ```
   curl -X POST http://localhost:3000/api/webhooks/bigcommerce \
     -H "Authorization: Bearer $BIGCOMMERCE_WEBHOOK_SECRET" \
     -H "Content-Type: application/json" \
     -d '{"scope":"store/order/created","data":{"id":1,"customer_id":1}}'
   # Without auth header or wrong bearer → 401
   # Correct bearer → passes auth, then hits BC fetch (will 500 without a real store)
   ```
7. **Seed a mock order + commission** (skips the BC fetch):
   ```
   node supabase/seed-order.mjs
   ```
   Requires the Test Buyer from step 5 to exist. Inserts a $247.50 paid order
   attributed to Demo Trainer and a $49.50 pending commission at 20%.
8. **Commission → payout → confirmed** — from `/admin/commissions` and
   `/admin/payouts`:
   - Approve commission → Create payout batch → Mark sent (with a Wise txn id)
     → Confirm. The final confirm cascades the commission to `paid`.

## Files

| File | Purpose |
|---|---|
| `schema.sql` | Idempotent DDL: 7 tables, 9 enums, 13 indexes. Paste into Supabase SQL Editor. |
| `rls.sql` | Enables RLS and installs the policy set. Apply AFTER `schema.sql`. Idempotent. |
| `seed.mjs` | Creates the two auth users + admin/trainer/code rows via the admin REST API. |
| `seed-order.mjs` | One-shot mock-order + commission for walking the payout UI flow without needing live BC. |

## Notes

- RLS is enabled via `rls.sql`. Policies: admins can do anything; trainers
  can read/update their own rows plus read their own related data
  (codes/customers/orders/commissions/payouts); anon has no access at all.
  Server-side endpoints that need to act unauthenticated — the webhook
  handler, `/api/codes/validate`, `/api/session/check`, and the apply flow
  — go through the service-role client (bypasses RLS). Application-level
  gating (`requireAdmin()` / `requireTrainer()`) remains the primary access
  control on server actions; RLS is defense-in-depth against anon-key leaks.
- The validate endpoint CORS allowlist is in `ACCESS_GATE_ALLOWED_ORIGINS`
  (comma-separated). For local dev against the storefront, include
  `http://localhost:3000` alongside `https://ultimate-peptides.com`.
