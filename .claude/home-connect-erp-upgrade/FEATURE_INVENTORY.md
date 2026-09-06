# FEATURE INVENTORY

Every business feature discovered in the codebase, classified by what the code actually supports. Discovered from the schema, the 40 mounted route groups, the 32 frontend routes, and the 20 frontend feature slices — not from the README or from the brief.

**Legend**

| Status | Meaning |
|---|---|
| `COMPLETE` | Full stack present, authorized, tested, reachable from the UI |
| `MOSTLY COMPLETE` | Full stack, but a named gap |
| `PARTIAL` | Works for the main path; real cases missing |
| `UI ONLY` / `BACKEND ONLY` | One side exists |
| `ORPHANED` | Implemented and mounted, but unreachable from the UI |
| `ABSENT` | Searched for; does not exist |

Tests column reflects the verified run on 2026-08-25: **2,181 passing, 10 files skipped** (all skipped files are the DB integration suites, gated behind `RUN_*_DB_TESTS` env flags).

---

## A. Discovered features — the master table

| # | Feature | Status | DB | API | UI | Perms | Tests | Notes |
|---|---|---|---|---|---|---|---|---|
| 1 | Customer CRUD + soft delete | COMPLETE | ✔ | ✔ | ✔ | ✔ | ✔ | `deletedAt`, indexed on name/phone |
| 2 | Customer fuzzy search | COMPLETE | ✔ | ✔ | ✔ | ✔ | ✔ | `pg_trgm` + normalization columns + dedicated indexes |
| 3 | Customer notes / address / active flag | COMPLETE | ✔ | ✔ | ✔ | ✔ | ✔ | notes are full-text indexed |
| 4 | Customer financial summary | COMPLETE | ✔ | ✔ | ✔ | ✔ | ✔ | `/customers/:id/financial-summary` |
| 5 | Customer activity timeline | COMPLETE | ✔ | ✔ | ✔ | ✔ | ✔ | `/customers/:id/activity` |
| 6 | **Debts (customer credit sales)** | COMPLETE | ✔ | ✔ | ✔ | ✔ | ✔ | The core money model. Immutable + cancel-with-reason |
| 7 | **Payments + partial payments** | COMPLETE | ✔ | ✔ | ✔ | ✔ | ✔ | Decimal-safe throughout |
| 8 | **Payment allocation to obligations** | COMPLETE | ✔ | ✔ | ✔ | ✔ | ✔ | `PaymentAllocation` join; one payment → many debts/installments |
| 9 | **Payment idempotency** | COMPLETE | ✔ | ✔ | ✔ | ✔ | ✔ | Unique key + SHA-256 fingerprint replay detection. **Payments only** |
| 10 | Payment void + reallocate | COMPLETE | ✔ | ✔ | ✔ | ✔ | ✔ | Void is a flag, never a delete |
| 11 | **Installment plans + schedules** | COMPLETE | ✔ | ✔ | ✔ | ✔ | ✔ | Monthly & weekly; deterministic schedule generation |
| 12 | Installment overdue detection | COMPLETE | ✔ | ✔ | ✔ | ✔ | ✔ | Computed against a business date, not `now()` |
| 13 | **Prepaid purchases (layaway)** | COMPLETE | ✔ | ✔ | ✔ | ✔ | ✔ | Deposit → deliver → auto-create remainder debt. Reversible |
| 14 | **Financial corrections + audit** | COMPLETE | ✔ | ✔ | ✔ | ✔ | ✔ | 9 correction actions, before/after JSON, reason mandatory |
| 15 | **Admin step-up verification** | COMPLETE | ✔ | ✔ | ✔ | ✔ | ✔ | Re-enter account password; logged to `AdminVerificationLog` |
| 16 | Financial ledger (obligations register) | MOSTLY COMPLETE | ✔ | ✔ | ✔ | ✔ | ✔ | Filterable list of Debts/Plans/Payments. **No running balance column** |
| 17 | Accounts receivable + aging tiers | COMPLETE | ✔ | ✔ | ✔ | ✔ | ✔ | Dedicated `receivables.tier.ts` + projection tests |
| 18 | **Supplier CRUD + archive** | COMPLETE | ✔ | ✔ | ✔ | ✔ | ✔ | |
| 19 | **Supplier ledger / payables** | COMPLETE | ✔ | ✔ | ✔ | ✔ | ✔ | Derived from `INCREASE_OWED`/`DECREASE_OWED` transactions |
| 20 | Supplier payments + partial | COMPLETE | ✔ | ✔ | ✔ | ✔ | ✔ | |
| 21 | **Supplier purchase invoices (lines)** | COMPLETE | ✔ | ✔ | ✔ | ✔ | ✔ | `SupplierPurchaseLine`; PRODUCT vs MANUAL line kinds |
| 22 | Supplier duplicate-receipt warning | COMPLETE | ✔ | ✔ | ✔ | ✔ | ✔ | Deliberately a warning, not a constraint — documented in schema |
| 23 | Purchase amount override + reason | COMPLETE | ✔ | ✔ | ✔ | ✔ | ✔ | For freight/rounding/discount; line sum retained |
| 24 | Supplier transaction remove/restore | COMPLETE | ✔ | ✔ | ✔ | ✔ | ✔ | Status flag, never a delete |
| 25 | Supplier audit trail | COMPLETE | ✔ | ✔ | ✔ | ✔ | ✔ | |
| 26 | **Product catalogue** | COMPLETE | ✔ | ✔ | ✔ | ✔ | ✔ | 24 endpoints — the richest module |
| 27 | **Sequence-generated SKU** | COMPLETE | ✔ | ✔ | ✔ | ✔ | ✔ | Unique; change + regenerate are audited |
| 28 | Manufacturer barcode | COMPLETE | ✔ | ✔ | ✔ | ✔ | ✔ | Unique; EAN-13/UPC-A/EAN-8 detection |
| 29 | Brands (as a text field) | PARTIAL | ~ | ✔ | ✔ | ✔ | ✔ | `Product.brand` is a plain indexed string — **no Brand table** |
| 30 | **Brand normalization / dedupe** | COMPLETE | ✔ | ✔ | ✔ | ✔ | ✔ | `POST /products/brands/normalize`, dry-run + audited write (v2.0.0) |
| 31 | Product specifications (ordered JSON) | COMPLETE | ✔ | ✔ | ✔ | ✔ | ✔ | Searchable |
| 32 | Product images | COMPLETE | ✔ | ✔ | ✔ | ✔ | ✔ | Separate table so lists never load bytes — good design |
| 33 | Product archive/restore | COMPLETE | ✔ | ✔ | ✔ | ✔ | ✔ | |
| 34 | Product audit trail | COMPLETE | ✔ | ✔ | ✔ | ✔ | ✔ | |
| 35 | Product duplicate check | COMPLETE | ✔ | ✔ | ✔ | ✔ | ✔ | |
| 36 | **Pricing presets (formula engine)** | COMPLETE | ✔ | ✔ | ✔ | ✔ | ✔ | expense/profit/discount-buffer/installment-markup/down-payment %, compound vs simple, 4 rounding modes |
| 37 | Per-product custom pricing override | COMPLETE | ✔ | ✔ | ✔ | ✔ | ✔ | |
| 38 | Pricing preview / calculator | COMPLETE | ✔ | ✔ | ✔ | ✔ | ✔ | `POST /pricing/calculate` |
| 39 | Preset archive/restore/set-default | COMPLETE | ✔ | ✔ | ✔ | ✔ | ✔ | |
| 40 | **Product label printing** | COMPLETE | – | ✔ | ✔ | ✔ | ✔ | Auto-fit, optional price + staff code |
| 41 | **Bulk label sheets (A4 tiled, PDF)** | COMPLETE | – | ✔ | ✔ | ✔ | ✔ | Preview → print or export |
| 42 | **Stock tracking (opt-in per product)** | COMPLETE | ✔ | ✔ | ✔ | ✔ | ✔ | `trackStock` gate; products may sit outside inventory |
| 43 | **Stock movement ledger (append-only)** | COMPLETE | ✔ | ✔ | ✔ | ✔ | ✔ | 11 movement types incl. a reserved reversal type |
| 44 | **Compare-and-set stock concurrency** | COMPLETE | ✔ | ✔ | ✔ | ✔ | ~ | Every stock path; conflict → 409. **Only DB-tested behind a skipped flag** |
| 45 | Inventory onboarding (opening counts) | COMPLETE | ✔ | ✔ | ✔ | ✔ | ✔ | Dedicated admin-only page + batch endpoint |
| 46 | **Inventory integrity reconciliation** | COMPLETE | ✔ | ✔ | ✔ | ✔ | ✔ | Verifies `stockQuantity` == movement sum == last `quantityAfter` |
| 47 | Low-stock / out-of-stock detection | COMPLETE | ✔ | ✔ | ✔ | ✔ | ✔ | Per-product `lowStockThreshold` |
| 48 | Manual stock adjustments (typed+reasoned) | COMPLETE | ✔ | ✔ | ✔ | ✔ | ✔ | MANUAL_ADD/REMOVE/STOCK_COUNT/DAMAGE_LOSS |
| 49 | **Supplier receiving documents** | COMPLETE | ✔ | ✔ | ✔ | ✔ | ✔ | Posted-once; never edited |
| 50 | **Receiving void via compensating movement** | COMPLETE | ✔ | ✔ | ✔ | ✔ | ✔ | Original document + movements preserved |
| 51 | Receiving metadata correction (admin) | COMPLETE | ✔ | ✔ | ✔ | ✔ | ✔ | Only the two fields with no stock meaning |
| 52 | Receiving reconciliation report | COMPLETE | ✔ | ✔ | ✔ | ✔ | ✔ | |
| 53 | **Sales orders (3 channels)** | COMPLETE | ✔ | ✔ | ✔ | ✔ | ✔ | SHOP_DIRECT / SHOP_DELIVERY / PHONE_ORDER |
| 54 | Sales order fulfillment workflow | COMPLETE | ✔ | ✔ | ✔ | ✔ | ✔ | 8 states with a validated transition table |
| 55 | Sales order line items + snapshots | COMPLETE | ✔ | ✔ | ✔ | ✔ | ✔ | Name/model/SKU snapshotted at sale time |
| 56 | **Sales → Debt / → Installment link** | COMPLETE | ✔ | ✔ | ✔ | ✔ | ✔ | Explicit user action, never implicit |
| 57 | **Sales stock deduct / restore** | COMPLETE | ✔ | ✔ | ✔ | ✔ | ✔ | `SalesOrderStockFulfillment` makes double-deduction unrepresentable |
| 58 | Sales order cancel / return / restore | PARTIAL | ✔ | ✔ | ✔ | ✔ | ✔ | **Return is a 3-step manual dance** — see §C.1 |
| 59 | Sales audit trail | COMPLETE | ✔ | ✔ | ✔ | ✔ | ✔ | 15 audit actions |
| 60 | **Service / repair jobs** | COMPLETE | ✔ | ✔ | ✔ | ✔ | ✔ | 12 statuses, routing, warranty, company hand-off |
| 61 | Service warranty tracking | COMPLETE | ✔ | ✔ | ✔ | ✔ | ✔ | Provider + expiry + status |
| 62 | Service audit trail | COMPLETE | ✔ | ✔ | ✔ | ✔ | ✔ | |
| 63 | Service pricing | PARTIAL | ✔ | ✔ | ✔ | ✔ | ✔ | `estimatedPrice`/`finalPrice` are **informational — they create no debt** |
| 64 | **Barcode scanning (PC wedge)** | COMPLETE | – | ✔ | ✔ | ✔ | ✔ | Scanner-mode toggle on the products page |
| 65 | **Phone-as-scanner over LAN** | COMPLETE | – | ✔ | ✔ | ✔ | ✔ | Pairing code, hashed tokens, TTLs, session caps, rate limits |
| 66 | Scanner Hub + product preview | COMPLETE | – | ✔ | ✔ | ✔ | ✔ | Scan → identify → act |
| 67 | Scan → quick sales order | COMPLETE | – | ✔ | ✔ | ✔ | ✔ | v2.0.0 |
| 68 | **Reports (16, with CSV export)** | COMPLETE | ✔ | ✔ | ✔ | ADMIN | ✔ | Full list in §B |
| 69 | Monthly review + month-end controls | COMPLETE | ✔ | ✔ | ✔ | ADMIN | ✔ | Live-recomputed |
| 70 | Analysis portal | COMPLETE | ✔ | ✔ | ✔ | ADMIN | ✔ | |
| 71 | **ERP dashboard (7 analytics domains)** | COMPLETE | ✔ | ✔ | ✔ | ✔ | ✔ | overview/customer/supplier/sales/product/service/activity |
| 72 | Dashboard exception centre (alerts) | COMPLETE | ✔ | ✔ | ✔ | ✔ | ✔ | 3 severities, deep-links to offenders |
| 73 | Dashboard caching | COMPLETE | – | ✔ | – | – | ✔ | In-process |
| 74 | **Automated + manual backups** | COMPLETE | ✔ | ✔ | ✔ | ADMIN | ✔ | node-cron scheduler |
| 75 | **Backup verification (checksum + readability)** | COMPLETE | ✔ | ✔ | ✔ | ADMIN | ✔ | SHA-256 + `pg_restore --list` |
| 76 | **Restore with pre-restore safety backup** | COMPLETE | ✔ | ✔ | ✔ | ADMIN | ✔ | Admin password gated; writes blocked during restore |
| 77 | Backup retention / maintenance | COMPLETE | ✔ | ✔ | ✔ | ADMIN | ✔ | |
| 78 | Backup import | COMPLETE | ✔ | ✔ | ✔ | ADMIN | ✔ | |
| 79 | **In-app migrations & repair runner** | COMPLETE | ✔ | ✔ | ✔ | ADMIN | ✔ | Behind a verified backup; `RepairHistory` is append-only |
| 80 | Preflight environment checks | BACKEND ONLY* | – | ✔ | ✔ | ADMIN | ✔ | *Reachable in Settings, but **not a startup gate** |
| 81 | Diagnostics + redacted support export | COMPLETE | – | ✔ | ✔ | ADMIN | ✔ | Secrets reported as `"set"`, never echoed |
| 82 | Error reporting / error log | COMPLETE | – | ✔ | ✔ | ADMIN | ✔ | |
| 83 | **WhatsApp customer messaging** | COMPLETE | – | – | ✔ | ✔ | ✔ | Prefilled `wa.me` deep link from the customer profile |
| 84 | **Bilingual UI (EN/AR)** | COMPLETE | – | ✔ | ✔ | – | ✔ | Labels are paired strings; alerts carry `{en, ar}` |
| 85 | User management + roles | PARTIAL | ✔ | ✔ | ✔ | ✔ | ✔ | Only ADMIN and EMPLOYEE — see §C.4 |
| 86 | Account lockout | COMPLETE | ✔ | ✔ | ✔ | ✔ | ✔ | 5 attempts / 15 min |
| 87 | Password change + admin-approved creation | COMPLETE | ✔ | ✔ | ✔ | ✔ | ✔ | |
| 88 | First-run setup wizard | COMPLETE | ✔ | ✔ | ✔ | – | ✔ | `/setup` creates the first admin |
| 89 | System local-status strip | COMPLETE | – | ✔ | ✔ | ✔ | ✔ | |

---

## B. Reports (all 16, all ADMIN-only, all CSV-exportable)

| Category | Reports |
|---|---|
| Overview | Monthly Review · Analysis Portal |
| Customers | Receivables Aging · Customers Who Did Not Pay · Customers Who Paid · New Customers · Customer Debts · Customer Payments · Customer Debt Snapshot · Financial Activity |
| Suppliers | Supplier Ledger · Supplier Receiving |
| Sales | Sales Report · Unpaid Sales |
| Inventory | Stock Movements · Receiving Reconciliation |
| Products | Products Bought |

**Missing and significant: there is no profit, margin, or COGS report.** Confirmed by search — see §D.

---

## C. Partial features, precisely characterised

### C.1 Sales order return — `PARTIAL`

[sales-orders.service.ts:376-408](backend/src/features/sales/sales-orders/sales-orders.service.ts#L376). Marking an order `RETURNED` **refuses to run** unless the operator has already, by hand, in this order:

1. Unlinked or cancelled the debt/installment plan from the *financial* screen;
2. Restored the deducted stock from the *stock* screen;
3. Then returned the order.

The guards are correct — they prevent silent inconsistency, and that is the right instinct. But there is **no single atomic "return this order"** that reverses money and stock together, and **no credit-note or cash-refund concept anywhere**. A returned order leaves the customer's money position to be fixed manually. This is the single largest operational gap in an otherwise strong sales module.

### C.2 Financial ledger — `MOSTLY COMPLETE`

[financial-ledger.types.ts](backend/src/features/financial/ledger/financial-ledger.types.ts) defines items of type `DEBT | INSTALLMENT_PLAN | PAYMENT`. It is a filterable, sortable **register of obligations** — not a running-balance account statement. There is no `runningBalance` field and no printable customer statement. What BIRD would call a customer account statement does not exist here in printable form.

### C.3 Brands — `PARTIAL`

`Product.brand` is a nullable indexed `String`. There is no `Brand` table, so brands cannot carry a supplier link, logo, or status. v2.0.0 added a normalization/dedupe endpoint that treats this pragmatically (majority spelling wins, Title Case breaks ties) rather than modelling it — a reasonable trade, but the ceiling is low.

### C.4 Roles — `PARTIAL`

`enum Role { ADMIN, EMPLOYEE }`. There is no permission table, no role editor, no per-module grants. Authorization is expressed as 49 `requireRole` call sites plus per-domain policy modules — **well-executed, but only two levels.** There is no way to grant an employee reports access without making them an admin, or to stop an employee from seeing every customer's debt.

### C.5 Service pricing — `PARTIAL`

`ServiceJob.estimatedPrice` / `finalPrice` exist and are shown, but no code path turns a completed service job into a `Debt`. Repair revenue is invisible to the financial system. If the shop earns meaningful money from repairs, **that revenue is not in the books at all.**

---

## D. Confirmed absent

Each was searched case-insensitively across `backend/src` and `frontend/src`.

| Capability | Evidence of absence | Does this business need it? |
|---|---|---|
| **Warehouses** | `warehouse` matches only the lucide **icon** | No — one shop, one stock pool |
| **Branches / multi-site** | `branchId` columns exist with **no `Branch` model, no FK, no filtering** | Only if a second location opens |
| **General ledger / journals / debit-credit** | zero matches | See GENERAL_LEDGER_DECISION |
| **Chart of accounts / trial balance / P&L / balance sheet** | zero matches | No — external accountant |
| **Multi-currency / exchange rates** | zero matches; `currency: 'USD'` is a hardcoded literal type | **Depends — the largest open question** |
| **VAT / tax** | zero real matches | Only if the business is VAT-registered |
| **Payroll** | zero matches | No |
| **Customer credit limit** | zero matches — no field, no check | **Yes, and it is cheap** |
| **COGS / gross profit / realized margin** | zero matches | **Yes — the biggest intelligence gap** |
| **Cash drawer / shift close / X-Z reports** | zero matches | Only if a true POS counter is wanted |
| **Thermal / ESC-POS receipt printing** | none — printing is `window.print()` only | Probably |
| **Product variants / serial numbers / units of measure** | zero matches | Unlikely for appliances |
| **Loyalty, salesman commission, quotations, purchase orders** | zero matches | No |
| **Email / SMS notifications** | none (WhatsApp deep-link only) | No |
| **CI pipeline** | no `.github/`, no pipeline file | **Yes** |
| **Monitoring / APM** | no dependency | No — single desktop |
| **E2E test framework** | no Playwright/Cypress in devDependencies | **Yes** |

---

## E. ~~`ORPHANED`~~ **LIVE LEGACY** — the legacy transaction system

> **CORRECTED 2026-08-30. The original finding below was wrong.**
>
> I checked `App.tsx` for a `/transactions` route and the sidebar for a nav item, found neither, and concluded the module was unreachable. I never checked whether its *components* were embedded in another page. They are:
>
> - **`CustomerProfilePage.tsx:10` imports `TransactionList`** — the Legacy Ledger renders on every Customer Profile.
> - **`transactions.api.ts` calls `GET/POST/PUT/DELETE /transactions`** — the router is reachable and used.
> - **`customers.controller.ts:109,122` call `TransactionsService`** for customer transactions and balance.
> - **`dashboard-activity.repository.ts:9` READS `activity_logs`.** I grepped writers (`activityLog.create`) and concluded "dead table" without grepping readers.
>
> *"No route and no external writer" is not "unreachable."*
>
> **What is actually true:** both surfaces are **live but permanently empty** — 0 rows in `transactions`, 0 in `activity_logs`, and nothing writes either. The Legacy Ledger renders blank on every customer, and the dashboard's Recent Activity panel is structurally incapable of showing data.
>
> **Consequences:** CP-6's rating of *orphaned / Risk Low / 4–8 h, mostly verification* was wrong on all three counts. T9 is a real migration of live UI, re-estimated at **10–16 h, Risk Medium**, and split:
> - **T9a** — remove the Legacy Ledger panel, the frontend slice, the `/transactions` router, the customer transaction/balance routes, and the `Transaction` model. **Keep `activity_logs`** (`ActivityLog` has no FK to `Transaction`, so they separate cleanly).
> - **T9b** — Dashboard Recent Activity: retire the panel, or reimplement it over the five audit tables. Deferred product decision; the table stays until then.

### Original finding (retained for the record — see correction above)

| Feature | Status | Detail |
|---|---|---|
| Legacy `Transaction` money model | **ORPHANED** | Model + routes + controller + service + repository all exist; router **live-mounted** at [app.ts:128](backend/src/app.ts#L128); **no frontend route or nav item reaches it** |
| `ActivityLog` table | **ORPHANED** | Written **only** by `transactions.repository.ts`; real auditing happens in 5 purpose-built audit tables instead |

A second parallel customer-money system reachable by any authenticated user via the API but invisible in the UI. It is dead weight and a live reporting hazard.

---

## F. Features I discovered that a feature list would likely omit

These are real, implemented, and easy to under-credit:

1. **Inventory integrity reconciliation** — the app can prove `stockQuantity` equals the movement sum ([inventory.repository.ts:135-136](backend/src/features/inventory/inventory.repository.ts#L135)). Most small ERPs cannot answer "is my stock arithmetic still sound?" at all.
2. **Compare-and-set stock concurrency** on *every* stock path, with a 409 on conflict.
3. **Backup restore with an automatic pre-restore safety backup** and API-wide write blocking during the restore.
4. **In-app migration + repair runner** with append-only `RepairHistory` and a mandatory verified backup before applying.
5. **Phone-as-barcode-scanner over LAN** with genuinely careful crypto (SHA-256 token hashes, `timingSafeEqual`, pairing TTL, idle + absolute session TTLs, 3-session cap, rate limits) and deliberate non-persistence so a restart invalidates every phone.
6. **A pricing formula engine** with compound vs simple modes and four rounding modes — this is a real domain feature, not a markup field.
7. **Prepaid purchase (layaway)** with automatic remainder-debt creation on delivery, and a reversible delivery.
8. **Admin step-up re-authentication** with its own audit table.
9. **Redacted diagnostics export** for support.
10. **Bilingual EN/AR throughout**, including server-generated alert payloads.
11. **Brand normalization with dry-run preview** and mandatory reason.
12. **Duplicate supplier-receipt detection** as a warning, with a schema comment explaining why a hard constraint was rejected as counter-productive at the counter.
