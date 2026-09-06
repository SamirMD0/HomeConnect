# SYSTEM DISCOVERY

Evidence-based map of what Home Connect actually is, verified from code on 2026-08-25 at commit `ac6ae9f` (v2.0.0, working tree clean).

Nothing in this document is taken from prior descriptions, README claims, or planning docs. Every statement names the file that proves it.

---

## 1. The single most important structural fact

**Home Connect is a single-machine Electron desktop application, not a web or cloud system.**

| Evidence | File |
|---|---|
| `main: "dist/electron/desktop/src/index.js"`, electron-builder NSIS target | `package.json` |
| Server binds loopback by default: `const HOST = process.env.HOST \|\| '127.0.0.1'` | [backend/src/index.ts:23](backend/src/index.ts#L23) |
| Frontend served from disk by the Electron main process | [desktop/src/static-frontend-server.ts](desktop/src/static-frontend-server.ts) |
| Router is `HashRouter`, not `BrowserRouter` — a `file://`-friendly choice | [frontend/src/App.tsx:2](frontend/src/App.tsx#L2) |
| Installer output `release/2.0.0/HomeConnect-Setup-2.0.0.exe` | `package.json` build config |

Everything downstream follows from this. There is no multi-tenant surface, no remote access, no server to attack from the network, and equally: no way for a second location to reach the same database as designed today. **Assess this system as a well-built single-site desktop ERP, because that is what the code is.**

---

## 2. Technology stack (verified)

| Layer | Actual technology | Evidence |
|---|---|---|
| Desktop shell | Electron 43 | `package.json` devDependencies |
| Frontend framework | React 19 + Vite 8 | `package.json`, `frontend/` |
| Routing | react-router-dom 7, `HashRouter` | [frontend/src/App.tsx](frontend/src/App.tsx) |
| Server state | TanStack React Query 5 | [frontend/src/App.tsx](frontend/src/App.tsx) |
| Forms | react-hook-form 7 + `@hookform/resolvers` + Zod | `package.json` |
| Styling | Tailwind CSS 4, `clsx`, `tailwind-merge` | `package.json` |
| Animation | framer-motion 12 | [frontend/src/layouts/DashboardLayout.tsx](frontend/src/layouts/DashboardLayout.tsx) |
| Charts | recharts 3 | `package.json` |
| Icons | lucide-react | throughout |
| Backend framework | Express 5 | [backend/src/app.ts](backend/src/app.ts) |
| Database | **PostgreSQL** (local) | `datasource db { provider = "postgresql" }` — [schema.prisma:9](backend/prisma/schema.prisma#L9) |
| ORM | Prisma 5.22 | `package.json` |
| Validation | Zod 4 via a `validate` middleware | [backend/src/middleware/validate.middleware.ts](backend/src/middleware/validate.middleware.ts) |
| AuthN | JWT access token (in-memory) + refresh token (httpOnly cookie) | [backend/src/services/auth.service.ts](backend/src/services/auth.service.ts), [frontend/src/services/api.ts](frontend/src/services/api.ts) |
| Password hashing | bcrypt, cost 12 | [auth.service.ts:155](backend/src/services/auth.service.ts#L155) |
| AuthZ | `requireRole` middleware (49 call sites) + per-domain policy modules | [role.middleware.ts](backend/src/middleware/role.middleware.ts) |
| HTTP hardening | helmet, cors allowlist, compression, cookie-parser | [backend/src/app.ts:56-63](backend/src/app.ts#L56-L63) |
| Logging | winston | [backend/src/lib/logger.ts](backend/src/lib/logger.ts) |
| Scheduled jobs | node-cron (backup scheduler only) | [backup.scheduler.ts](backend/src/features/backup/backup.scheduler.ts) |
| Caching | bespoke in-process dashboard cache | [dashboard-cache.ts](backend/src/features/dashboard/shared/dashboard-cache.ts) |
| PDF / export | jspdf, xlsx, plus server-side CSV endpoints | `package.json`, `report-rows.routes.ts` |
| Barcode | jsbarcode (EAN-13 / UPC-A / EAN-8) | `package.json`, label pages |
| Printing | `window.print()` via Electron; no thermal/ESC-POS driver | label + receiving pages |
| Testing | Vitest 4 + supertest + Testing Library | `vitest.config.ts` |
| **Monitoring** | **none** | no APM, Sentry, or metrics dependency |
| **CI/CD** | **none** | no `.github/`, no pipeline config anywhere |
| **Message queue / background workers** | **none** | only the cron backup |

### Things searched for and confirmed absent

These were searched case-insensitively across `backend/src` and `frontend/src`:

| Searched | Result |
|---|---|
| `warehouse` | Only the **lucide-react icon name** used as a decorative glyph on the Inventory page. No warehouse model, table, or concept. |
| `branch` | Only nullable `branchId` columns with **no `Branch` model, no FK, no filtering**. Dead scaffolding. |
| `journal`, `chart of account`, `trial balance`, `debit` | **Zero matches.** No accounting engine of any kind. |
| `exchangeRate`, `LBP` | **Zero matches.** Currency is a hardcoded literal type `currency: 'USD'` ([dashboard.types.ts:23](backend/src/features/dashboard/dashboard.types.ts#L23)). |
| `VAT`, `tax` | Only false positives (`private`, `metadata`). No tax handling. |
| `payroll`, `salesman`, `loyalty`, `credit limit` | **Zero matches.** |
| `COGS`, `grossProfit`, `margin` | **Zero matches** for realized profit. `profitAmount` exists only in the forward-looking *pricing formula* ([pricing-calculator.ts](backend/src/features/pricing/domain/pricing-calculator.ts)), never as realized margin. |

---

## 3. Project structure

```
Home Connect/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma          28 models, 45 enums, 1289 lines
│   │   ├── migrations/            33 migrations, 20260723 → 20260817
│   │   ├── repair/                hand-authored repair SQL, versioned per release
│   │   └── data-fixes/
│   └── src/
│       ├── app.ts                 route mounting + middleware chain
│       ├── index.ts               server bootstrap, loopback bind, cron start
│       ├── features/              ← the real architecture lives here
│       ├── controllers/           ← LEGACY (auth, customers, dashboard, transactions, users)
│       ├── services/ repositories/ validators/  ← LEGACY siblings of the above
│       ├── middleware/            auth, role, validate, error, logger
│       └── lib/                   prisma, logger, errors, redaction, scan-code, search
├── frontend/src/
│   ├── App.tsx                    32 routes, all behind ProtectedRoute
│   ├── layouts/DashboardLayout.tsx  15-item bilingual sidebar
│   ├── features/                  ← 20 vertical slices, each api/components/hooks/types
│   ├── pages/                     thin route shells that compose features
│   ├── components/ui/             shared design-system primitives
│   └── services/api.ts            axios instance + refresh interceptor
├── desktop/src/                   Electron main: window, CSP, backend process, readiness
└── scripts/Setup-HomeConnect.ps1  operator install: creates production.env, generates secrets
```

### Two coexisting backend architectures

This is the clearest architectural signal in the repo.

**Legacy (v1.0-era):** `controllers/` + `services/` + `repositories/` + `validators/` at `backend/src/` top level. Five domains: auth, customers, dashboard, transactions, users. Layered but generic.

**Current (v1.0.4+):** `backend/src/features/<domain>/` vertical slices, each containing `*.routes.ts`, `*.controller.ts`, `*.service.ts`, `*.repository.ts`, `*.validator.ts`, `*.types.ts`, and colocated tests. Financial and supplier domains additionally carry `domain/` (pure logic), `authorization/` (policy), and `audit/` subfolders.

The migration is largely complete. Auth, users, and dashboard legitimately still live in the legacy layout. **`transactions` is the exception: it is orphaned.** See §6.

---

## 4. The database

- **28 models, 45 enums, 33 migrations.**
- All money is `Decimal @db.Decimal(12, 2)`. **A repo-wide search found zero `Float` or `Double` money columns.** This is the single best database decision in the project.
- Percentages use `Decimal(6,3)`; quantities use `Int`.
- Foreign keys are pervasive and almost universally `onDelete: Restrict` — history cannot be orphaned by a delete.
- Every business table carries `createdAt`/`updatedAt`; mutable ones carry actor columns (`createdById`, `updatedById`, `cancelledById`, `voidedById`, `reversedById`).
- Indexing is deliberate: composite indexes matching real query shapes (`[customerId, status]`, `[fulfillmentStatus, orderDate]`, `[productId, createdAt]`, `[supplierId, receiptNumber]`).
- `pg_trgm` is enabled with search-normalization columns and dedicated search indexes (migrations `20260801090000`–`20260801092000`, `20260805092000`).
- Schema comments are unusually good — several explain *why* a constraint was rejected, not just what exists. See the `RepairHistory` comment at [schema.prisma:1261-1268](backend/prisma/schema.prisma#L1261-L1268) explaining why a proposed unique constraint was deliberately not applied.

### Soft deletes are inconsistent

`Customer`, `User`, `Transaction` use `deletedAt`. `Supplier` uses `archivedAt`. `Debt`/`InstallmentPlan` use `cancelledAt`. `Payment` uses `voidedAt`. `SupplierReceiving` uses a `status` enum plus `voidedAt`. Each is defensible in isolation; collectively there is no single "is this record live" predicate, which is a real source of query bugs.

---

## 5. Complete request/data flow trace

Traced end-to-end: **recording a customer payment against a debt.**

```
1.  UI            frontend/src/features/customer-financial/components/*
                  react-hook-form + Zod resolver; Button disabled while isPending
                  → useMutation

2.  API layer     frontend/src/features/customer-financial/api/financial-mutations.api.ts
                  → axios instance (services/api.ts)
                  → request interceptor attaches in-memory Bearer token
                  → 401 triggers single-flight refresh via httpOnly cookie

3.  Transport     POST /api/v1/payments

4.  Middleware    helmet → cors → compression → json → cookieParser
                  → requestLogger → blockWritesDuringRestore   ← refuses writes mid-restore
                  → requireAuth (JWT verify)

5.  Route         features/financial/payments/payments.routes.ts
                  → validate(schema)  (Zod, backend/src/middleware/validate.middleware.ts)

6.  Controller    payments.controller.ts — HTTP concerns only, no business logic

7.  Service       payments.service.ts
                  → normalizeIdempotencyKey()      infrastructure/idempotency.ts
                  → runFinancialTransaction()      infrastructure/transaction.ts
                     └─ inside the Prisma transaction:
                        · idempotency replay lookup by unique key
                        · assertPositiveMoney()    domain/money.ts   (Decimal, never float)
                        · allocatePayment()        domain/payment-allocation.ts
                        · immutability policy      domain/immutable-policy.ts
                        · Payment + PaymentAllocation rows created
                        · debt/installment STATUS recomputed and written
                        · FinancialCorrectionAudit written when a correction path

8.  Repository    payments.repository.ts — Prisma calls, tx-client threaded through

9.  Database      PostgreSQL, single ACID transaction

10. Error path    lib/errors.ts typed errors → middleware/error.middleware.ts
                  → uniform { success, error: { code, message } } envelope
                  → lib/redaction.ts strips secrets from logs

11. Response      { success, data, meta } envelope

12. UI state      React Query invalidates the affected query keys; toast; list refetches
```

### What this trace proves

- **Layering is real and enforced.** Controllers hold no business logic; services never touch `req`/`res`; pure domain logic (`money.ts`, `balances.ts`, `payment-allocation.ts`, `installment-schedule.ts`) has no Prisma import and is independently unit-testable.
- **Transaction boundaries are explicit** via a single `runFinancialTransaction` helper rather than ad-hoc `prisma.$transaction` calls scattered around.
- **The `tx` client is threaded through repositories** (`tx?: Prisma.TransactionClient` is the standard signature), so nothing silently escapes the transaction.
- **This is not tightly coupled code.** It is a clean, conventional, well-separated architecture.

---

## 6. The legacy `Transaction` system — **live, not orphaned** (corrected)

> **CORRECTED 2026-08-30.** The section below claimed this module was unreachable. It is not. `CustomerProfilePage.tsx:10` imports `TransactionList` (the Legacy Ledger renders on every Customer Profile), `transactions.api.ts` calls the `/transactions` router, `customers.controller.ts:109,122` use `TransactionsService`, and `dashboard-activity.repository.ts:9` **reads** `activity_logs` — I only grepped writers.
>
> Both surfaces are **live but permanently empty** (0 rows in each table, nothing writes them). See `FEATURE_INVENTORY.md` §E for the full correction and the revised T9 scope.

### Original finding (retained for the record — see correction above)

A finding that must not be missed.

`Transaction` (the model), `transactions.routes.ts`, `transactions.controller.ts`, `transactions.service.ts`, and `transactions.repository.ts` all exist and the router is **live-mounted** at [app.ts:128](backend/src/app.ts#L128):

```ts
app.use('/api/v1/transactions', requireAuth, transactionsRoutes);
```

But:

- **`frontend/src/App.tsx` has no `/transactions` route.**
- **`DashboardLayout.tsx` has no transactions nav item.**
- No frontend feature slice imports it.
- It is the **only** writer of the `ActivityLog` table ([transactions.repository.ts:136,164,192](backend/src/repositories/transactions.repository.ts#L136)) — meaning the generic activity log is effectively dead, and real auditing happens instead through five purpose-built audit tables.

So the app carries a second, parallel, self-contained customer-money system that the UI cannot reach but the API still exposes to any authenticated user. It is a maintenance liability and a reporting-correctness hazard (a report that joined `transactions` would double-count against `debts`).

---

## 7. Authentication and session design (verified, and better than expected)

| Property | Implementation |
|---|---|
| Access token | JWT, held **in a JS variable in memory only** — [api.ts:16](frontend/src/services/api.ts#L16) |
| Refresh token | httpOnly cookie, `withCredentials: true` |
| Refresh concurrency | Single-flight promise guard prevents refresh stampede |
| Password storage | bcrypt cost 12 |
| Brute force | Account lockout: 5 attempts → 15-minute lock, persisted on `User.failedLoginAttempts` / `lockedUntil` |
| Step-up auth | Sensitive actions require re-entering the admin **account password**, logged to `AdminVerificationLog` — [lib/admin-verification.ts](backend/src/lib/admin-verification.ts) |

**No token is ever written to `localStorage`.** The only `localStorage` uses in the whole frontend are UI preferences (search history, label dimensions, table-vs-grid view). That is materially better than the typical React ERP.

---

## 8. Electron hardening

[desktop/src/content-security-policy.ts](desktop/src/content-security-policy.ts) sets a strict production CSP: `script-src 'self'`, **no `unsafe-eval`, no inline script**. The file documents that the built bundle was checked for `eval(` and `new Function(`, and that dev mode relaxes only *inline* script for Vite's react-refresh preamble while still blocking eval. `connect-src` is limited to the loopback backend origin.

This is careful, informed security work.

---

## 9. Deployment and operations

- **Install:** `scripts/Setup-HomeConnect.ps1` creates `%APPDATA%/HomeConnect/config/production.env`, and **generates `JWT_SECRET` from `RandomNumberGenerator`** ([Setup-HomeConnect.ps1:142,156](scripts/Setup-HomeConnect.ps1#L142)).
- **Migrations ship inside the installer** (`extraResources` maps `backend/prisma/migrations` → `prisma/migrations`) and are applied **from inside the app** via Settings → Maintenance, behind a verified backup.
- **Preflight** ([features/preflight](backend/src/features/preflight/)) checks env file, required vars, DATABASE_URL parsing, Postgres tool discovery, and port reachability — but it is exposed as an **admin API endpoint only**, not a startup gate. See RISK_REGISTER.
- **Diagnostics export** produces a redacted support bundle; secrets are reported as `"JWT_SECRET": "set"` and scrubbed from any captured output ([diagnostics-export.service.ts:159-167](backend/src/features/diagnostics/diagnostics-export.service.ts#L159)).
- **No CI.** All validation (`npm test`, `npm run typecheck`, `npm run lint`) is run by hand.

---

## 10. Scale

| Metric | Value |
|---|---|
| Tracked files | 1,310 |
| TypeScript/TSX lines (production) | ~69,500 |
| TypeScript/TSX lines (tests) | ~34,300 |
| Test files | 270 (176 backend, 80 frontend, 14 desktop) |
| Test-to-production ratio | ≈ 0.49 |
| Prisma models / enums / migrations | 28 / 45 / 33 |
| Frontend routes / feature slices | 32 / 20 |
| API route mounts | 40 |

This is a substantial, real codebase — not a prototype by volume, and the test ratio is not cosmetic.
