# Reports Section — ERP Upgrade Plan

**Status:** Planning / review only. No code, schema, migration, version, or installer change was made.
**Repo state at review:** `package.json` version `1.9.5`, branch `main`.
**Date:** 2026-08-17

---

## 1. The finding that changes this plan

**HomeConnect already has a full analytics engine. Reports is not it.**

The `dashboard` feature ([backend/src/features/dashboard/](backend/src/features/dashboard/)) is a mature 39-file module with range presets, previous-period comparison, caching, nine endpoints, and five Recharts components. The `reports` feature is a single legacy slice — customer debts only — that predates it.

So the request "make Reports a real ERP reporting section" must **not** be answered by building a second analytics engine. That would create two sources of financial truth, which is the one outcome this repo's architecture has consistently refused.

**The correct move:** Reports becomes the **period-scoped, row-level, exportable, print-ready layer** over the analytics services that already exist, plus a small set of genuinely-missing report-only queries.

| | Dashboard (exists) | Reports (to build) |
|---|---|---|
| Purpose | *Glanceable operational state* | *Auditable business document* |
| Shape | Cards, charts, live | Rows, totals, print, CSV |
| Period | Presets to **today** | Closed periods, full months |
| Audience | Daily operation | Monthly review, saved and filed |

---

## 2. Current state audit (inspected, not assumed)

### 2.1 Routes and pages

| Layer | Location |
|---|---|
| Backend mount | [app.ts:115](backend/src/app.ts#L115) — `/api/v1/reports` → `monthlyDebtsRoutes` |
| Backend feature | [backend/src/features/reports/monthly-debts/](backend/src/features/reports/monthly-debts/) — 8 files, one slice only |
| Frontend route | [App.tsx:82](frontend/src/App.tsx#L82) — `reports` → `ReportsPage` |
| Frontend page | [ReportsPage.tsx](frontend/src/pages/ReportsPage.tsx) — 261 lines, two tabs |
| Frontend feature | [frontend/src/features/reports/](frontend/src/features/reports/) — 9 files |

### 2.2 Existing backend report APIs — three, all customer-only

```
GET /api/v1/reports/monthly-debts               ADMIN  snapshot of who owed what at month end
GET /api/v1/reports/monthly-debts/export.csv    ADMIN  same, CSV, limit 10000
GET /api/v1/reports/monthly-financial-activity  ADMIN  debts/plans/payments created in month
```

### 2.3 Tables and queries used

[monthly-debts.repository.ts](backend/src/features/reports/monthly-debts/monthly-debts.repository.ts) touches **four tables only**: `Debt`, `InstallmentPlan`, `Payment` (+ `PaymentAllocation`), `Customer`.

### 2.4 Ledger coverage — the core limitation

| Domain | Used by Reports? |
|---|---|
| Customer ledger (debts, plans, payments, allocations) | ✅ Yes, thoroughly |
| Supplier ledger | ❌ **No** |
| Sales orders | ❌ **No** |
| Inventory / stock movements | ❌ **No** |
| Products | ❌ **No** |
| Suppliers / receiving | ❌ **No** |

The user's description is accurate: Reports is one table about customer debt.

### 2.5 Quality of what exists — better than it looks

The existing slice is genuinely well-built and must be **kept, not replaced**:

- Correct business-date handling via `businessDateToPrisma` / `prismaDateToBusinessDate` / `compareBusinessDates` — no UTC off-by-one.
- Point-in-time correctness: `paymentValidAtCutoff` and `cancelledOnOrBeforeCutoff` mean a payment voided *after* month end still counts *at* month end. This is real accounting rigour and is the standard the new reports must meet.
- `PREPAID_PURCHASE` debts deliberately excluded from standard debt totals.
- Money handled with `Decimal` + `sumMoney`/`subtractMoney`, serialized via `moneyToApiString`.

### 2.6 Risky frontend-only calculations — **none found**

Grep for `reduce(`, `parseFloat`, `Number(` across `frontend/src/features/reports/` and the dashboard sections returned **zero financial math**. Every total is backend-computed and rendered as a string. This is a strength; the plan preserves it as a hard rule.

### 2.7 Export and print — partial

- **CSV:** only `monthly-debts`. Server-built with UTF-8 BOM (Excel-safe for Arabic) and correct `"` escaping — [monthly-debts.service.ts:485-525](backend/src/features/reports/monthly-debts/monthly-debts.service.ts#L485-L525). Good pattern to extend.
- **Print:** a real `@page A4` stylesheet with `thead` repeat and page-break rules — [ReportsPage.tsx:250-261](frontend/src/pages/ReportsPage.tsx#L250-L261). Good; needs generalising.
- **Excel/PDF:** none.

### 2.8 Date filtering — month-only

A single `YYYY-MM` month picker. **No custom range, no "last month", no comparison.** `monthToBusinessRange` returns a whole calendar month only.

### 2.9 Permissions

- Reports backend: `requireRole(['ADMIN'])` on all three routes.
- Reports frontend: `ReportsPage` returns an admin-only notice for non-admins ([ReportsPage.tsx:53-62](frontend/src/pages/ReportsPage.tsx#L53-L62)).
- **⚠️ Inconsistency found:** dashboard analytics routes carry **no role guard** except `month-end` ([dashboard.routes.ts:9-19](backend/src/features/dashboard/dashboard.routes.ts#L9-L19)). `customer-financial` and `supplier-financial` are reachable by any authenticated user, including `EMPLOYEE`. Reports treats the same data as admin-only. This is a pre-existing gap, not something this plan creates — see Open Decision D4. **This plan does not weaken anything; it flags a possible existing over-exposure.**

---

## 3. What already exists vs what is actually missing

This table is the heart of the plan. Building what is already built would be the expensive mistake.

| User's request | Already exists | Verdict |
|---|---|---|
| Customer debt movement (opening → new → collected → closing) | `month-end` returns `MonthEndMovement` with `opening/newAmount/collected/adjustments/closing/reconciled` | ✅ **Exists — reuse** |
| Supplier debt movement | same `month-end`, supplier block + `withBalance` | ✅ **Exists — reuse** |
| Top debt customers | `customer-analytics.topDebtors` | ✅ Exists |
| Top suppliers owed | `supplier-analytics.topBalances` | ✅ Exists |
| Debt ageing (overdue buckets) | `customer-analytics.ageDistribution`, 5 buckets to 90+ | ✅ Exists |
| Collections vs new debt trend | `customer-analytics.trend` + `monthlyComparison` | ✅ Exists |
| Risk/attention section | `dashboard-alerts` — severity, count, amount, offenders, route | ✅ **Exists — reuse** |
| Low/out-of-stock | `InventoryRepository.summary()` | ✅ Exists |
| Stock integrity (ledger vs quantity) | `getStockIntegrity()` — `OK`/`MISMATCH`/`PENDING_ONBOARDING` | ✅ Exists |
| Top products by quantity sold | `sales-analytics.topProducts` | ✅ Exists |
| Charts | Recharts 3.10 + 5 chart components | ✅ Exists |
| Period + previous period | `resolveDashboardRange` computes `previousFrom`/`previousTo` | ✅ **Exists — reuse** |
| **New customers in period** | `totalCustomers` is an unfiltered `customer.count()` — no `createdAt` filter | ❌ **Missing** |
| **Sales totals for a period** | Only `salesToday`. Ranged data is `salesByDay` **rows** — no period total, no AOV, no paid/unpaid split | ❌ **Missing** |
| **Customers who did *not* pay** | `distinctPayers` counts who did; the complement is never computed | ❌ **Missing** |
| **Supplier receiving report** | Receiving lives in inventory; no report reads it | ❌ **Missing** |
| **Stock movement summary by type** | Movements are listed, never grouped/summed per type per period | ❌ **Missing** |
| **Slow-moving / stock-but-no-sales** | Nothing computes absence of movement | ❌ **Missing** |
| **Row-level exportable tables** | Only monthly-debts has rows + CSV | ❌ **Missing** |
| **Closed-period ranges** | Every preset ends at *today*; can't ask for "all of July" | ❌ **Missing** |

**Roughly 60% of the request already exists in the dashboard and is simply not surfaced in Reports.**

⚠️ **The `salesByDay` trap.** Sales period totals are the single most likely place a developer would sum rows in the frontend. That would violate §2.6 and produce a number the backend cannot vouch for. Period sales totals **must** be added as a backend metric (CP-R3).

---

## 4. Recommended Reports structure

```
Reports / التقارير
│
├── 1. Monthly Review   ← default landing, the "what happened this month" page
│      Sales · Customers · Customer debt movement · Suppliers · Inventory · Risk · Actions
│
├── 2. Customers        New customers · Debt report · Payments · Did-not-pay
├── 3. Suppliers        Debt report · Payments · Receiving · Risk
├── 4. Sales            Orders · Performance · Unpaid
├── 5. Inventory        Stock risk · Movement summary · Receiving reconciliation · Product performance
└── 6. Risk & Actions   Deterministic findings + suggested actions
```

### 4.1 Reporting period

Add a **closed-period** resolver beside the existing preset resolver — do not modify `resolveDashboardRange`, whose "to today" behaviour is correct for a live dashboard:

```
thisMonth | lastMonth | custom(from,to) | thisWeek | today
```

`lastMonth` and an explicit `custom` range are the two that Reports genuinely needs and the dashboard cannot express. Reuse `resolveMonthRange`, `addDays`, `differenceInDays` from [dashboard-range.ts](backend/src/features/dashboard/shared/dashboard-range.ts) — all business-date safe. Every response carries `{ from, to, previousFrom, previousTo, generatedAt }` so a printed report states its own scope.

### 4.2 Ledger separation — enforced by response shape

The response is namespaced so the four domains **cannot** be added together by accident:

```jsonc
{
  "meta":      { "from": "...", "to": "...", "previousFrom": "...", "previousTo": "..." },
  "sales":     { "orderCount", "totalAmount", "paidAmount", "unpaidAmount", "averageOrderValue" },
  "customers": { "newCustomers", "activeCustomers", "paidCount", "didNotPayCount",
                 "movement": { "opening", "newDebt", "collected", "adjustments", "closing" } },
  "suppliers": { "movement": { ... }, "topOwed": [] },
  "inventory": { "lowStock", "outOfStock", "movementsByType": {} },
  "risk":      { "findings": [] }
}
```

Rules carried from the request into the design:
- Supplier **receiving** is reported under `inventory`, never under `suppliers.movement`, unless a `SupplierTransaction` exists. A delivery is not a debt.
- A sales order is "paid" only per existing `SalesOrderPaymentStatus`; Reports never re-derives it.
- No single "total business number" that mixes customer receivable with supplier payable.
- **`PREPAID_PURCHASE` stays excluded** from customer debt totals, matching the existing service.

### 4.3 Risk section — deterministic, no AI

Reuse `dashboard-alerts` findings and add period-comparison rules that need two periods:

| Rule | Condition |
|---|---|
| Debt outrunning sales | `customers.movement.newDebt` growth % > `sales.totalAmount` growth % |
| Collection shortfall | `collected` < `newDebt` for 2 consecutive months |
| Supplier squeeze | `suppliers.newDebt` growth > `customers.collected` growth |
| Concentration | top customer's outstanding > 25% of total receivable |
| Fast-moving stockout risk | product in `topProducts` **and** at/below `lowStockThreshold` |
| Dead stock | `stockQuantity > 0` and zero `SALE_FULFILLMENT` movements in period |
| Receiving unreconciled | receiving document whose items lack matching `PURCHASE_RECEIPT` movements |

Each finding: `{ key, severity, label {en,ar}, count, amount?, offenders[], route }` — the existing `DashboardAlert` shape, so the frontend alert component is reused as-is.

Every threshold is a named constant in one config file, not scattered magic numbers. **No AI in v1.** A later Ollama layer may *explain* backend numbers; it must never produce them.

### 4.4 Backend API

Follow the existing `/api/v1/reports` mount and the dashboard's `{ meta, data }` envelope:

```
GET /api/v1/reports/monthly-review?period=lastMonth
GET /api/v1/reports/customers/new?from&to
GET /api/v1/reports/customers/debts          ← keep existing monthly-debts, add range support
GET /api/v1/reports/customers/payments?from&to
GET /api/v1/reports/suppliers/debts?from&to
GET /api/v1/reports/suppliers/receiving?from&to
GET /api/v1/reports/sales/orders?from&to
GET /api/v1/reports/sales/unpaid
GET /api/v1/reports/inventory/movements?from&to
GET /api/v1/reports/inventory/reconciliation?from&to
GET /api/v1/reports/<slice>/export.csv?...    ← one shared CSV builder
```

`monthly-review` **composes existing services** (`MonthEndService`, `CustomerAnalyticsService`, `SupplierAnalyticsService`, `SalesAnalyticsService`, `DashboardAlertsService`, `InventoryService.getInventorySummary`) rather than re-querying. Read-only: no transaction, no write client, no mutation route on this router — ever.

Extract the CSV escaper from `monthly-debts.service.ts` into `reports/shared/csv.ts` (BOM + quote-escaping preserved) so every slice exports identically.

### 4.5 Frontend

Tabs matching §4 with a shared `<ReportPeriodSelector>` (this month / last month / custom). Reuse `StatCard`, the `ReportStates` trio, and the five existing Recharts components. Generalise the print stylesheet out of `ReportsPage.tsx` into `reports/print.css`.

**Charts, only where they earn it:** collections vs new debt (line, exists), debt age distribution (bar, exists), top 5 debtors and top 5 suppliers owed (horizontal bars), stock movements by type (bar, new). Everything else stays a table — tables print and export; charts do neither well.

**Hard rule:** the frontend renders backend money strings. It never sums, subtracts, or averages them.

---

## 5. Recommended first version scope

**`v1.9.6` — deterministic reports only.** Every change is additive and read-only: new endpoints, new pages, **no schema change, no migration, no ledger logic touched**. It does not merit a major bump. Reserve **v2.0.0** for the financial-truth/COGS foundation, and put any AI/Ollama analytics in its own later version.

**Ship first (the 80/20):** the **Monthly Review page**. It reuses six existing services, needs only the three missing metrics (new customers, sales period totals, did-not-pay), and alone answers most of the user's questions. Row-level report tables follow.

**Explicitly deferred:** PDF export, Excel (`.xlsx`), multi-branch, saved/scheduled reports, frozen month-end snapshot tables, AI narrative, COGS/margin/profit (no cost-of-sale data exists — any "profit" figure would be invented).

---

## 6. Checkpoints

| CP | Version | Content | Ships |
|---|---|---|---|
| **CP-R1** | — | Current-state audit | ✅ this document |
| **CP-R2** | 1.9.6 | `reports/shared/`: closed-period resolver, `{meta,data}` envelope, CSV builder, risk-threshold config. Backend only, fully unit-tested. | no UI |
| **CP-R3** | 1.9.6 | **The three missing metrics**: new customers in period, sales period totals (count/total/paid/unpaid/AOV), did-not-pay list. Backend + tests. | no UI |
| **CP-R4** | 1.9.6 | `GET /reports/monthly-review` — composes existing services + CP-R3. | no UI |
| **CP-R5** | 1.9.6 | Monthly Review frontend: period selector, cards, comparison, risk, actions. | ✅ |
| **CP-R6** | 1.9.6 | Customer + supplier row-level reports (incl. supplier receiving) + CSV. | ✅ |
| **CP-R7** | 1.9.6 | Sales + inventory reports incl. receiving reconciliation. | ✅ |
| **CP-R8** | 1.9.6 | Generalised print view; CSV across all slices. | ✅ |
| **CP-R9** | 1.9.6 | Release review, regression, version bump, package. | gate |


Each checkpoint ends green: typecheck, focused tests, full suite, lint.

### Testing plan

**Backend** — period boundaries (first/last day, month rollover, DST-free business dates), `lastMonth` vs `thisMonth`, new customers excludes soft-deleted, sales totals match `SalesOrderPaymentStatus`, customer/supplier movement `opening + new − collected + adjustments = closing`, did-not-pay is the exact complement of `distinctPayers`, **no ledger mixing** (customer totals unaffected by supplier fixtures and vice versa), ADMIN-only guards, empty-data returns zeros not nulls, and a **read-only assertion** (no `create`/`update`/`delete`/`$transaction` anywhere under `features/reports`).

**Frontend** — Monthly Review renders; period selector drives the query key; tables render backend strings verbatim; empty/loading/error states; print and CSV buttons; non-admin sees the notice. Plus a guard test that no report component calls `reduce`/`parseFloat` on a money field.

**Regression** — existing customer ledger, supplier ledger, sales, inventory, and dashboard suites must stay green untouched.

---

## 7. Open decisions

- **D1 — Period semantics.** Should "This month" in Reports mean *month-to-date* (dashboard behaviour) or *the whole calendar month*? Recommendation: **month-to-date, labelled explicitly**, with "Last month" always a full closed month.
- **D2 — Replace or extend the existing monthly-debts slice?** Recommendation: **extend.** Its point-in-time correctness is hard-won; add range support and keep the month path working.
- **D3 — Employee access.** Keep all Reports ADMIN-only? Recommendation: **yes**, matching current behaviour. Revisit only if the owner wants employees to see a stock-only report.
- **D4 — The dashboard permission gap (§2.9).** `customer-financial` / `supplier-financial` are currently unguarded. Tighten to ADMIN, or leave as-is? Recommendation: **raise it as its own small security checkpoint**, decided by the owner, not bundled silently into this work.
- **D5 — Caching.** Reuse `DashboardCache` for report responses? Recommendation: **yes for Monthly Review** (short TTL), **no for CSV export**, which must always be live.
- **D6 — Currency.** `DashboardMeta` hardcodes `'USD'`. Confirm this matches how the shop actually reports before it is printed on a monthly document.

---

## 8. Confirmation

- ✅ **No implementation** — no backend or frontend source modified
- ✅ **No migration** — no schema change, no migration file
- ✅ **No version bump** — `package.json` remains `1.9.5`
- ✅ **No installer built**
- ✅ **Nothing staged, committed, or pushed**
- ✅ **No business PC database touched** — read-only source inspection only

**Only file created:** `claude/plans/reports-section-erp-upgrade-plan.md` (this document).

---

*Planning document only. Reports are read-only by design: no plan item creates a debt, payment, ledger entry, stock movement, sales order, or price change.*
