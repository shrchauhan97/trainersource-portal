# TrainerSource App - Comprehensive Knowledge Graph

## Generation Summary

**Generated:** 2026-05-25  
**Output File:** `.understand-anything/intermediate/batch-analysis.json`  
**Framework:** Next.js 16 + React 19 + TypeScript  
**Database:** Supabase (PostgreSQL)

---

## Knowledge Graph Statistics

- **Total Nodes:** 446
- **Total Edges:** 322
- **File Size:** 173 KB

### Node Breakdown by Type

| Type | Count | Description |
|------|-------|-------------|
| module | 13 | High-level architectural modules |
| file | 227 | TypeScript/TSX files in src/ |
| function | 103 | Exported functions and actions |
| component | 87 | React components |
| database | 7 | Database tables |

### Edge Breakdown by Type

| Type | Count | Description |
|------|-------|-------------|
| exports | 224 | File → Function/Component exports |
| contains | 56 | Module → File containment |
| implements | 9 | Module → File implementation |
| reads_writes | 33 | API → Database data access |

---

## Major Architectural Modules

### 1. Core Application (`module:core`)
- **Files:** `src/app/layout.tsx`, `src/middleware.ts`
- **Purpose:** Next.js root layout, middleware for authentication and geo-routing
- **Key Functions:** Session management, domain redirect (Vercel → trainer-source.com)

### 2. API Routes (`module:api`)
- **Files:** 14 major routes in `src/app/api/*`
- **Purpose:** REST endpoints for codes, gates, webhooks, authentication
- **Key Endpoints:**
  - `/api/codes/validate` - Access code validation (CORS)
  - `/api/gate/verify` - BigCommerce store gate check
  - `/api/webhooks/bigcommerce` - Order creation handler
  - `/api/admin/codes` - Admin code management
  - `/api/commissions` - Commission tracking
  - `/api/payouts` - Payout batch processing

### 3. Authentication (`module:auth`)
- **Files:** `src/lib/auth.ts`, `src/lib/bot-auth.ts`
- **Key Functions:**
  - `getCurrentUser()` - Get authenticated user
  - `getUserRole()` - Determine user role (admin/trainer/suspended)
  - `requireBotSecret()` - Bot authentication

### 4. Supabase Integration (`module:supabase`)
- **Files:** `src/lib/supabase/server.ts`, `src/lib/supabase/service.ts`, `src/lib/supabase/middleware.ts`
- **Clients:**
  - Server client (SSR) - Uses anon key + session cookies
  - Service role client - Bypasses RLS for backend operations
- **Security:** Row-level security (RLS) policies for admin/trainer/anon

### 5. Telegram Mini Apps (`module:telegram`)
- **Routes:** `/mini/launcher`, `/mini/calc`, `/mini/reorder`, `/mini/partner`
- **Features:**
  - Telegram WebApp integration
  - Reconstitution calculator
  - Reorder flow
  - Partner dashboard
- **Auth:** Telegram `initData` verification

### 6. BigCommerce Integration (`module:bigcommerce`)
- **Key Files:** `src/lib/bigcommerce.ts`, `src/lib/bc-rest-client.ts`, `src/lib/bc-sso.ts`
- **Features:**
  - Order webhook handler
  - SSO integration
  - Access gate for storefront
  - Customer attribution

### 7. Admin Dashboard (`module:admin`)
- **Routes:** `/admin/*`
- **Features:**
  - Trainer management
  - Customer directory
  - Commission tracking
  - Payout batching
  - Lifecycle actions (suspend/restore)

### 8. Trainer Dashboard (`module:trainer`)
- **Routes:** `/dashboard/*`
- **Features:**
  - Code generation
  - Commission history
  - Client list
  - Settings management

### 9. Onboarding Flow (`module:onboarding`)
- **Routes:** `/onboarding/*`
- **Steps:**
  1. Application
  2. Qualifications
  3. Training/Quiz
  4. Go Live
- **Data:** Saved to `onboarding_steps` table with RLS protection

### 10. React Components (`module:components`)
- **Admin UI:** SubmitButton, LifecycleActionForm, AdminSidebar
- **Dashboard:** GenerateCodeForm, DashboardShell
- **Landing:** Sidebar, MainContent, PublicTopNav
- **Onboarding:** ApplicationForm, SubTabs, Stepper

### 11. Shared Libraries (`module:lib`)
- **Auth:** getCurrentUser, getUserRole, getCurrentAdminEmail
- **Data:** fetchTrainerCodes, fetchTrainerCommissions, fetchTrainerClients
- **Validation:** Form validators, password policies
- **Utilities:** Constants, email, issue-code, lifecycle

### 12. Database Schema (`module:database`)
- **Tables:** admins, trainers, access_codes, customers, orders, commissions, payouts
- **Enums:** TrainerStatus, CommissionStatus, CodeStatus, etc.
- **Indexes:** 17 indexes on critical columns for performance

---

## Data Flow Diagram

```
User                     Frontend              Backend               Database
───────────────────────────────────────────────────────────────────────────
                         /login
                            →  POST /auth/callback
                                    ↓
                              Verify email
                                    ↓
                              Set session
                                    ↓
                          ← Redirect to dashboard

Trainer                  /dashboard
                            →  GET /api/trainer/codes
                                    ↓
                              Read access_codes
                                    ← Query trainers table
                          ← Return codes + earnings

Customer                   /r/[code]
                            →  POST /api/codes/validate
                                    ↓
                              Verify code (RPC)
                                    ↓
                              Create customer
                                    ↓
                              Return session
                          ← Set session token

BigCommerce Webhook      (order:created event)
                            →  POST /api/webhooks/bigcommerce
                                    ↓
                              Verify auth header
                                    ↓
                              Create order + commission
                                    ↓
                              Update trainer stats
                                    ← Insert to tables

Telegram User            /mini/partner
                            →  GET /api/mini/partner/summary
                                    ↓
                              Verify Telegram initData
                                    ↓
                              Fetch trainer summary
                                    ← Join tables
                          ← Show codes + earnings
```

---

## Critical Request Flows

### 1. Access Code Validation (Public)
**Route:** `POST /api/codes/validate`  
**Auth:** CORS origin check  
**Database:**
- Read: `access_codes`, `trainers`, `customers`
- Write: `customers`, `audit_attempts`  
**Returns:** `{ valid, session_token, customer_id }`

### 2. Trainer Commission Fetch
**Route:** `GET /api/commissions` (trainer-only)  
**Auth:** Trainer session + role check  
**Database:**
- Read: `commissions`, `orders`, `customers`  
**Returns:** Paginated commissions with customer/order details

### 3. Payout Batch Creation
**Route:** `POST /api/payouts` (admin-only)  
**Auth:** Admin session + role check  
**Database:**
- Read: `commissions` (pending)
- Write: `payouts`, Update `commissions` (pending→approved)  
**Returns:** Batch ID + selected commissions

### 4. BigCommerce Order Webhook
**Route:** `POST /api/webhooks/bigcommerce`  
**Auth:** Bearer token (webhook secret)  
**Database:**
- Read: `customers` (by BC ID), `trainers` (attribution)
- Write: `orders`, `commissions` (pending)  
**Returns:** `{ ok: true }`

---

## Type System

**Core Domain Types:**
- `Admin` - Email, role, created_at
- `Trainer` - Name, email, commission_rate, status, slug
- `Customer` - Email, phone, country, city, trainer_id, status
- `AccessCode` - Code, type, status, expires_at, trainer_id
- `Order` - BigCommerce ID, customer, total, status
- `Commission` - Amount, status, type (first_sale|reorder), trainer_id
- `Payout` - Total, status (pending|sent|confirmed), period dates

**Status Enums:**
- Trainer: applied | onboarding | active | suspended
- Commission: pending | approved | paid
- Payout: pending | sent | confirmed
- Code: active | consumed | expired

---

## Configuration

**Key Environment Variables:**
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Backend-only service role
- `TELEGRAM_BOT_TOKEN` - Telegram Mini App bot token
- `BIGCOMMERCE_WEBHOOK_SECRET` - Webhook authentication
- `ACCESS_GATE_ALLOWED_ORIGINS` - CORS allowlist
- `ACCESS_GATE_ALLOWED_COUNTRIES` - Country gating

---

## Key Files Summary

| File | Purpose | Complexity |
|------|---------|-----------|
| `src/middleware.ts` | Session + geo routing | Medium |
| `src/lib/auth.ts` | Role determination | Medium |
| `src/app/api/codes/validate/route.ts` | Code consumption gate | High |
| `src/app/api/webhooks/bigcommerce/route.ts` | Order processing | High |
| `src/app/admin/layout.tsx` | Admin dashboard shell | Medium |
| `src/app/dashboard/layout.tsx` | Trainer dashboard shell | Medium |
| `src/components/admin/data.ts` | Admin data queries | High |
| `src/lib/trainer-data.ts` | Trainer data queries | Medium |

---

## Testing Coverage

- **Unit Tests:** `tests/unit/` - Auth, data fetching, validation
- **Integration Tests:** `tests/integration/` - Database operations, API flows
- **E2E Tests:** `tests/e2e/` - Browser-based flows with Playwright
- **API Tests:** Scripts for smoke testing production endpoints

---

## Performance Considerations

- **Database Indexes:** 17 indexes on critical query paths
- **Supabase RLS:** Defense-in-depth with Row-Level Security
- **Service Role Caching:** Single cached client for edge functions
- **CORS:** Origin-based allowlist for code validation
- **Code Expiry:** Cron job (`/api/cron/expire-codes`) runs daily

---

Generated knowledge graph with 446 nodes and 322 edges.  
Ready for visualization and architecture analysis.
