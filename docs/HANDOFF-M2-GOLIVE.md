# Handoff — M2 Reorder Mini App go-live

**Branch:** `shaurya/m2-reorder-mini-app` (portal submodule)
**Base:** `shaurya/portal-security-release` @ d392c69 (bc_customer_links landed)
**Status:** code-complete (Tasks 1, 4–10, 14 landed; 11–13 deferred per plan)

## What shipped

13 commits on `shaurya/m2-reorder-mini-app`. Portal side:

| Commit | Subject |
|---|---|
| d38468c | chore: gitignore `.worktrees/` |
| 791cb4f | install jsonwebtoken + env + BC CDN image host |
| de5970d | merge: consume portal-security-release (M1 calc + P4 partner API) |
| c635f0a | chore(test): include `tests/mini/**/*.test.ts` in vitest |
| 062cd20 | BC Customer Login SSO JWT helper (`src/lib/bc-sso.ts`, 5 tests) |
| e164405 | portal-side BC REST client (`src/lib/bc-rest-client.ts`, 5 tests) |
| 5a14f38 | GET `/api/reorder/orders` — verify + fetch 5 orders |
| c27094d | harden `/api/reorder/orders` — future-date staleness guard + no BC body leak in 502 |
| 745c857 | POST `/api/reorder/checkout` — aggregate + SSO redirect |
| b712707 | `OrderCard` component |
| 7eab2f9 | Mini App page — cards, multi-select, MainButton sync |
| 2cd4e57 | Playwright e2e — not-linked + auth-error states |
| 9e15940 | docs: document M2 Reorder Mini App |

**Tests:** 67 unit + 3 skipped. 22 new tests from M2 (bc-sso 5 + bc-rest-client 5 + reorder-api 12). Typecheck clean. 2 pre-existing integration failures (SUPABASE_URL env not set — unrelated to M2, same baseline since before this branch).

**Security hardening applied:**
- HMAC-SHA256 initData verification with timing-safe compare (via M1's `verifyTelegramWebApp`)
- 24h `auth_date` staleness window, 60s clock-skew tolerance for future-dated values, 401 on either bound
- IDOR prevention on checkout: `selected_order_ids` re-verified against server-fetched `getCustomerOrders(bcCustomerId, 5)`
- All 5xx client bodies stripped of upstream `detail` fields; full errors go to `console.error` server-side only
- Service-role Supabase client; `bc_customer_links` RLS permits only service role
- `BIGCOMMERCE_ACCESS_TOKEN` + `BC_CLIENT_SECRET` never logged, never returned to client

## What's left before the feature is live

### Task 11 — Bot-side inline `[📱 Open reorder app]` button

Deferred. Plan 5's `trainersource-bot/src/handlers/reorder.ts` must land first (another terminal was developing P5 in parallel; check that repo's `shaurya/p5-reorder-concierge` branch). When it has:

```bash
cd trainersource-bot
# edit src/handlers/reorder.ts — append to existing InlineKeyboard:
#   .row().webApp('📱 Open reorder app', `${MINI_APP_BASE_URL}/mini/reorder`)
# add src/config.ts:
#   export const MINI_APP_BASE_URL = process.env.MINI_APP_BASE_URL ?? 'https://trainer-source.com';
# append MINI_APP_BASE_URL=https://trainer-source.com to .env.example
npm run typecheck
git add src/handlers/reorder.ts src/config.ts .env.example
git commit -m "reorder: add [Open reorder app] WebApp button to handler"
```

### Task 12 — Vercel env vars + BotFather registration (one-time, human)

1. Create a BC App via BigCommerce control panel → Apps → Create An App. Scopes: Customers R/W, Orders R, Carts R/W, Information & Settings R. Note `client_id` + `client_secret`.
2. On Vercel (`trainersource-app` project → Settings → Environment Variables), set:
   - `BC_CLIENT_ID` (from step 1)
   - `BC_CLIENT_SECRET` (from step 1)
   - `BC_STORE_URL=https://ultimate-peptides.com`
   - `TELEGRAM_BOT_TOKEN` (mirror Railway value)
   Apply to Production + Preview + Development. Redeploy.
3. On Railway (bot service → Variables), set `MINI_APP_BASE_URL=https://trainer-source.com`. Railway auto-restarts.
4. In Telegram, DM `@BotFather`: `/mybots → @peptidebutlerbot → Bot Settings → Configure Mini App → Enable Mini App → Web App URL: https://trainer-source.com/mini/launcher`. After this, any HTTPS URL under `trainer-source.com` works in `webApp` buttons — no further BotFather registration needed for `/mini/reorder`.
5. Smoke: `curl -I https://trainer-source.com/mini/reorder` → expect 200 OK (static shell).

### Task 13 — End-to-end smoke with a real Telegram account

Requires Task 11 + Task 12 complete.

1. Seed one row in `bc_customer_links` for your Telegram user id → an existing BC customer with ≥1 order:
   ```sql
   INSERT INTO bc_customer_links (telegram_user_id, bc_customer_id)
   VALUES (<your_telegram_id>, <bc_customer_id>);
   ```
2. In the bot, run `/reorder`. Verify the `[📱 Open reorder app]` button appears under the chat-flow cards.
3. Tap it. Mini App opens, shows your orders as photo cards.
4. Select 1–5 cards. MainButton reads `🛒 Checkout selected — $X.XX`.
5. Tap MainButton. Mini App redirects through BC Customer Login → `/cart.php` inside Telegram's in-app browser.
6. Verify cart contents match your aggregated selection (same SKU across orders sums quantities).

## Merge path

1. Push branch: `git push -u origin shaurya/m2-reorder-mini-app`
2. PR against `shaurya/portal-security-release` (the current integration branch carrying M1 + P4). The merge commit (`de5970d`) already consumed `shaurya/portal-security-release` — rebasing onto new tip of that branch should be trivial.
3. If `shaurya/portal-security-release` gets merged to `main` first, retarget the M2 PR against `main`.

## Known follow-ups (not blocking launch)

- No test covers missing `TELEGRAM_BOT_TOKEN` env or the Supabase `linkErr` 500 path. Forward-fix if abuse-monitoring needs them.
- Cart staleness: BC carts expire after 30 days. If a user taps MainButton then never redirects, then reopens Mini App weeks later, the old cart may still be referenced. Not a spec requirement; revisit in v2.
- `quiet_mode` on `bc_customer_links` is owned by Plan 5 (proactive re-engagement cron). M2 reads the link row but ignores `quiet_mode`. Intentional.
- The `declare global { Window.Telegram }` block conflicts with M1's `MiniAppThemeBridge` type augmentation. Resolved locally in `page.tsx` via a renamed `ReorderTelegramWebApp` interface + `getTg()` helper cast. If a future shared `src/types/telegram-webapp.ts` consolidates the typing, the local cast becomes redundant.

## Verification commands

```bash
cd trainersource-app   # (or your worktree of it)
pnpm typecheck         # → clean
pnpm vitest run        # → 67 pass, 3 skip, 2 pre-existing SUPABASE_URL integration failures (unchanged baseline)

# Playwright (requires dev server + .env.local with Supabase creds + `pnpm playwright install chromium`):
TELEGRAM_BOT_TOKEN=test-bot-token pnpm playwright test mini-reorder
```
