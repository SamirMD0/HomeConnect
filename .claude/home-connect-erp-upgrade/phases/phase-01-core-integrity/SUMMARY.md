# PHASE 1 — SUMMARY

**Branch:** `develop` (Phase 1 implementation safely fast-forwarded from the former temporary branch)
**Base:** `main` at `ac6ae9f555dd69d61ca79be527cc1a80513643d9` — **unchanged, nothing merged**
**Implementation head at review:** `cdeacd7`
**Reviewed:** 2026-09-06
**Scope of this document:** what was actually implemented in code, verified against the branch — not what the plan proposed.

```
14 commits · 171 files · +5,264 / −2,289 · 5 migrations
34 files added · 15 deleted · 122 modified
```

---

## Phase 1 objective

Close every path by which money, debt, supplier balances, inventory, or payments could go wrong, and build the safety net that makes months of AI-assisted change survivable — **without redesigning the financial or inventory cores, which the audit found to be already correct.**

The phase adds *assurance* (CI with real database tests, standing integrity reports, verified backups and restores) and closes *specific named gaps* (no startup secret gate, no session revocation, no idempotency on supplier writes, stale product costs, a parallel legacy money module, no currency model, no VAT model). It deliberately preserves ADR-02: **balances stay derived, never stored.**

---

## Completed work

### T1 · Continuous integration with database tests

| | |
|---|---|
| **What changed** | New `.github/workflows/ci.yml` running typecheck, lint, the full test suite including all ten previously-skipped database integration files, and the build, against a Postgres 16 service. New `test:ci` script setting all eight `RUN_*_DB_TESTS` flags via `cross-env`. New `scripts/assert-test-database.mjs` refusing to run destructive suites unless the target database name marks it as a throwaway. A CI step parses the vitest JSON report and **fails the job on any skipped test**. |
| **Why it changed** | CP-4 / R-13. The tests proving this system's core guarantees — CAS conflict aborts, transaction rollback, constraint enforcement under concurrency — were written and never run. Months of AI-assisted work on a financial system with no automatic regression detection was the single largest avoidable risk. |
| **Files/modules** | `.github/workflows/ci.yml`, `package.json`, `scripts/assert-test-database.mjs`, `vitest.config.ts`, `backend/src/test/setup.ts` |
| **Database impact** | None on any real database. CI provisions a throwaway named `homeconnect_ci_phase4_phase5_phase6`, which satisfies the three suites that guard themselves on the database *name* without weakening those guards. |
| **Business impact** | None directly. Everything else in this phase depends on it. |
| **Tests** | The pipeline is the deliverable. It was proven to go red on a deliberately broken test ([run 33882813349](https://github.com/SamirMD0/HomeConnect/actions/runs/33882813349)) and the break was reverted on a scratch branch. |
| **Status** | **Done and verified.** 275 files, 2,259 tests, 0 skipped. |

Two follow-up commits were needed for PostgreSQL contention under CI: `6fac833` backs off serializable transaction retries, `0763b90` disables cross-file parallelism (`--no-file-parallelism`) because independent `SERIALIZABLE` transactions conflict through predicate locks. Concurrency tests *within* a file still run concurrently, so the concurrency guarantees are still exercised.

---

### T5 · Fail startup on a missing JWT secret

| | |
|---|---|
| **What changed** | New `backend/src/lib/env.ts` exporting `requireEnv(name)`, which throws at module load with a message pointing at `Setup-HomeConnect.ps1`. `auth.middleware.ts` and `auth.service.ts` now call it instead of falling back to a literal. New `backend/src/load-env.ts` loads the env file as an **import side effect**, because import hoisting meant a `dotenv` call written below the imports ran *after* modules that read `JWT_SECRET` at module scope. |
| **Why it changed** | CP-1 / R-17. A `production.env` missing the key booted on `fallback_secret_key_change_in_production`, a secret published in the source. Anyone reaching the port could forge an admin token, silently. |
| **Files/modules** | `backend/src/lib/env.ts` (new), `backend/src/load-env.ts` (new), `backend/src/index.ts`, `backend/src/middleware/auth.middleware.ts`, `backend/src/services/auth.service.ts` |
| **Database impact** | None. |
| **Business impact** | The application now refuses to start without the secret. **An installed config lacking the key will fail to boot rather than run insecurely** — see Outstanding Issues. |
| **Tests** | `backend/src/lib/env.test.ts` (3), `backend/src/load-env.test.ts` — missing variable throws with the actionable message; present variable boots normally; env-file precedence order asserted. |
| **Status** | **Done.** No fallback literal remains in production code. |

---

### T6 · Re-check user status on every request

| | |
|---|---|
| **What changed** | New `backend/src/lib/user-session-status.ts` with `requireActiveUserSession(userId)`: a 30-second in-memory cache over a `findUnique` selecting `role`, `isActive`, `deletedAt`, rejecting deleted or inactive users. `requireAuth` calls it after signature verification. The refresh path rejects revoked users. Deactivating or deleting a user invalidates their cache entry immediately. |
| **Why it changed** | CP-5 / R-18. `requireAuth` verified the JWT signature and nothing else, so a deactivated employee kept working until token expiry and could refresh further. |
| **Files/modules** | `backend/src/lib/user-session-status.ts` (new), `backend/src/middleware/auth.middleware.ts`, `backend/src/services/auth.service.ts`, `backend/src/services/users.service.ts`, `backend/src/controllers/users.controller.ts` |
| **Database impact** | One extra cached lookup per authenticated request. Negligible at this scale. |
| **Business impact** | Deactivating an employee ends their access within the cache TTL on both the access and refresh paths. |
| **Tests** | `auth.middleware.test.ts` (deactivated → 401, deleted → 401, active unaffected, cache expiry), `auth.service.test.ts` (refresh rejected for a revoked user), `users.service.test.ts` (deactivation invalidates the cache). |
| **Status** | **Done.** Revocation is bounded by the 30-second TTL, by design. |

---

### T7 · Idempotency on supplier purchases and receivings

| | |
|---|---|
| **What changed** | Nullable `idempotencyKey` with a unique index on `SupplierTransaction` and `SupplierReceiving`, reusing the proven payment pattern exactly: unique key plus a SHA-256 request fingerprint, so a replay with the same key returns the original record and a *different* payload under the same key is a conflict. Both frontend forms generate the key **once per form instance** via `useRef(createClientIdempotencyKey(...))` and reuse it across retries. |
| **Why it changed** | CP-3 / R-05. A network retry or a resubmit created a duplicate payable or **duplicate stock**, requiring an admin void and leaving permanent audit noise. The `isLoading` button guard only stops the double-click. |
| **Files/modules** | `20260827090000_add_supplier_idempotency`, `schema.prisma`, `supplier-purchases.{service,repository,validator}.ts`, `supplier-receivings.{service,repository,validator}.ts`, `supplier-transactions.{service,repository}.ts`, `SupplierPurchaseFormDialog.tsx`, `SupplierReceivingForm.tsx` |
| **Database impact** | Two additive nullable columns and two unique indexes. No backfill. PostgreSQL permits multiple NULLs in a unique index, so existing rows and existing clients are unaffected. **No `(supplierId, receiptNumber)` constraint was added** — deliberately, because suppliers reuse and re-issue receipt numbers and a hard constraint would block a genuine purchase at the counter. |
| **Business impact** | A duplicate submission creates exactly one payable and one stock increase. |
| **Tests** | `supplier-idempotency-migration.test.ts`, `supplier-purchase-db.integration.test.ts` (+199 lines), `supplier-receiving-db.integration.test.ts` (+138 lines): same key twice → one record; same key, different fingerprint → conflict; absent key → still works; concurrent identical submissions → one succeeds. |
| **Status** | **Done.** The frontend key is generated on mount, not on submit — verified by reading both forms. |

---

### T8 · Update product cost price from receipts

| | |
|---|---|
| **What changed** | Posting a supplier purchase with PRODUCT lines now updates `Product.costPrice` to the **quantity-weighted ex-VAT unit price** of every qualifying line for that product in the purchase, and writes a `ServiceAudit` `CHANGE_PRICE` entry recording old → new, the source purchase, receipt number, weighted quantity and line count. It runs inside the purchase's existing `runFinancialTransaction`, so a later failure rolls the cost change back with the document. A new **Product Cost Changes** report gives the owner oversight without adding friction at the counter. The receiving void dialog now warns when voiding a receiving whose purchase changed a cost. |
| **Why it changed** | CP-8 / R-06. `SupplierPurchaseLine.unitPrice` held the real price and `Product.costPrice` was never updated from it, so the pricing engine computed selling prices from a stale cost and the shop silently under-priced in a rising market — with no error, no audit entry, and no margin reporting to detect it. |
| **Files/modules** | `supplier-purchases.service.ts` (`updateProductCostsFromPurchase`), `products.repository.ts`, `products.service.ts`, `report-rows.{service,repository,routes,types}.ts`, `reports.registry.ts`, `report-columns.tsx`, `ReceivingVoidDialog.tsx` |
| **Database impact** | No schema change. Writes to `products.costPrice` and `service_audits`. |
| **Business impact** | **Changes selling prices for preset-priced products**, immediately, on posting. Voiding the receiving does **not** revert the cost — the goods were genuinely purchased at that price. |
| **Tests** | `supplier-purchases.service.test.ts` (+139), `supplier-purchase-db.integration.test.ts`: posting updates cost and writes the audit; MANUAL lines never touch cost; multi-line purchases update each product exactly once; unchanged cost writes no audit row. |
| **Status** | **Code done. Owner sign-off outstanding** — see Outstanding Issues (Critical). |

---

### T9a · Remove the legacy customer transaction system

| | |
|---|---|
| **What changed** | Removed the Legacy Ledger panel from `CustomerProfilePage`, deleted `frontend/src/features/transactions/` entirely, unmounted `/api/v1/transactions` and deleted its router, controller, service, repository, types and validator, removed `getCustomerTransactions` / `getCustomerBalance` from `customers.controller.ts`, dropped the `Transaction` model and the `transactions` table, and dropped the `TransactionType` / `TransactionStatus` enums. **`activity_logs`, the `ActivityLog` model, and `features/dashboard/activity/*` were deliberately left untouched.** |
| **Why it changed** | CP-6 / R-22. A second, parallel customer-money system with a live-mounted router: an API caller could write money records invisible to every screen, and any future report joining `transactions` would double-count against `debts`. |
| **Files/modules** | `20260830183000_remove_legacy_transactions`, `app.ts`, `schema.prisma`, 6 backend transaction files deleted, 5 frontend transaction files deleted, `CustomerProfilePage.tsx`, `CustomerFinancialProfile.tsx` |
| **Database impact** | **DESTRUCTIVE and NOT reversible by down-migration.** `transactions` was confirmed to hold zero rows before the migration was written (`LEGACY_TRANSACTIONS_AUDIT.md`). Recovery is a restore of the pre-deployment backup, not a revert. `activity_logs` was retained because `dashboard-activity.repository.ts` reads it; it also holds zero rows. |
| **Business impact** | A visible — though permanently blank — panel disappears from the Customer Profile screen. |
| **Tests** | Full suite green after removal; typecheck proves no dead imports; the route is gone from `app.ts`. |
| **Status** | **Code done. Owner sign-off outstanding** — it is the owner's screen. |

---

### T10 · Financial integrity reports

| | |
|---|---|
| **What changed** | Two new read-only report slices. **Customer Financial Integrity** computes `Σ(non-cancelled obligations) − Σ(non-voided allocations)` per customer independently, and compares it against the reported outstanding from `ReceivablesService`, flagging any mismatch and any case where allocations exceed obligations. **Supplier Financial Integrity** does the same for `Σ(active increases) − Σ(active decreases)` against the reported supplier balance. Both are CSV-exportable and both are linked from Settings → Maintenance alongside the existing inventory reconciliation. |
| **Why it changed** | R-01 / R-02. ADR-02 makes drift structurally impossible *today*; these reports are what prove it stays true after months of change, and are exactly the check an AI-introduced regression would trip. |
| **Files/modules** | `report-rows.repository.ts` (+175), `report-rows.service.ts` (+116), `report-rows.routes.ts`, `reports.registry.ts`, `report-columns.tsx`, `MaintenancePanel.tsx` |
| **Database impact** | Read-only. |
| **Business impact** | Anyone with ADMIN can check on demand whether the books reconcile. |
| **Tests** | `report-rows.service.test.ts` (+96) — including detection of a deliberately corrupted balance in a fixture. A reconciliation report that cannot fail is decoration. |
| **Status** | **Done.** Clean on live data, 2026-09-06 (below). |

---

### T13 · Dual currency foundation

| | |
|---|---|
| **What changed** | `Currency` enum (USD, LBP). New append-only, effective-dated `ExchangeRate` table with `Decimal(18,6)` rates and a positive-rate check. `currency` / `exchangeRate` / base-amount columns on debts, installment plans, installments, payments, payment allocations, service jobs, sales orders, sales order items, supplier transactions and supplier purchase lines. `money.ts` became currency-aware: **USD 2 dp, LBP 0 dp, both ROUND_HALF_UP**. New `domain/currency-allocation.ts` converts a payment-side amount into the obligation's currency; **`PaymentAllocation.amount` stays in the obligation's currency, so `calculateDebtBalance` is untouched.** An ADMIN-only `features/financial/exchange-rates/` slice and an `ExchangeRatePanel` in Settings record the operative rate. |
| **Why it changed** | ADR-19 / R-08. The business trades in both currencies and retrofitting later costs several times more. |
| **Files/modules** | `20260901090000_add_dual_currency_foundation` (39 statements), `schema.prisma`, `money.ts` (+176/−…), `currency-allocation.ts` (new), `exchange-rates/*` (new, 6 files), `payments.service.ts`, `debts.{service,validator}.ts`, `installment-plans.{service,validator}.ts`, `receivables.service.ts`, `customer-financial-summary.service.ts`, `dashboard-financial.service.ts`, `frontend/src/features/exchange-rates/*` (new) |
| **Database impact** | Additive. Every existing row backfilled `currency = USD`, `exchangeRate = 1`, `baseAmount = amount`. **No amount was modified.** CHECK constraints enforce a positive rate, rate = 1 whenever currency is USD, and whole-number amounts whenever currency is LBP. |
| **Business impact** | A debt in USD can be recorded as paid in LBP and the remaining balance stays exact. Adding a new rate changes no historical value. |
| **Tests** | `currency-allocation.test.ts`, `money.test.ts`, `financial-db.integration.test.ts` (+114), `exchange-rates.routes.test.ts` (ADMIN-only), plus currency assertions across the debts, payments and installment suites. |
| **Status** | **Foundation done. Not yet operational on every write path** — sales orders and supplier purchases are still pinned to USD in the service layer. See Outstanding Issues (Important) and Phase 2 T10. |

---

### T14 · VAT foundation

| | |
|---|---|
| **What changed** | New `TaxRate` (code, `ratePercent Decimal(6,3)`, effective dates) and `TaxProfile` (points at a rate, `isDefault`) tables — **no `vat = 11` field anywhere**, per the owner's explicit direction. `Product.taxProfileId` (nullable → falls back to the default profile, never silently exempt) and `Product.priceIncludesVat`. `SalesOrderItem` and `SupplierPurchaseLine` gained `taxRateSnapshot`, `taxCodeSnapshot`, `unitPriceExVat`, `vatAmount`, `lineTotalIncVat`, with a CHECK enforcing `lineTotalIncVat = lineTotal + vatAmount`. A pure `domain/vat.ts` does per-line calculation with per-line rounding, deriving inclusive VAT **by subtraction**. Sales order totals are the exact sum of the rounded inclusive line amounts. The pricing preview now shows the VAT breakdown. |
| **Why it changed** | ADR-20 / R-38. VAT is required at a Lebanese default of 11%; rates change by legislation and historical invoices must not. **No historical invoice reads `TaxRate`, so changing a rate cannot alter one** — the same discipline as the cost snapshot. |
| **Files/modules** | `20260903120000_add_vat_foundation` (27 statements), `20260906150000_seed_default_tax_configuration` (new), `schema.prisma`, `features/tax/*` (new), `domain/vat.ts` (new), `sales-orders.service.ts`, `supplier-purchases.service.ts`, `pricing-calculator.controller.ts`, `PricingPreviewCard.tsx`, `prisma/seed.ts` |
| **Database impact** | Additive: two new tables plus nullable/defaulted columns. Existing lines backfilled `taxRateSnapshot = 0`, `vatAmount = 0`, `lineTotalIncVat = lineTotal`. **They were genuinely sold without VAT — backfilling 11% would falsify history and misstate the first VAT return.** `taxCodeSnapshot` is left NULL for history, which correctly means "unclassified", not "zero-rated". |
| **Business impact** | Once a default profile exists, **every new sales-order line and supplier-purchase line carries VAT**. See Outstanding Issues (Critical) — the inclusive/exclusive question is not settled. |
| **Tests** | `vat.test.ts` (+57), `vat-migration.test.ts`, `tax-configuration-migration.test.ts` (new), plus VAT assertions in the sales-order and supplier-purchase service suites. |
| **Status** | **Foundation done, with one defect found and fixed during this review** (below). |

---

### Fix found during this review · Default tax configuration never reaches an upgraded install

| | |
|---|---|
| **What changed** | New migration `20260906150000_seed_default_tax_configuration` seeds the `LB_STANDARD` (11.000%) and `LB_ZERO` (0.000%) rates and their profiles on an existing installation. |
| **Why it changed** | T14's configuration was created **only** by `prisma/seed.ts`. An upgrade runs `migrate deploy` and nothing else, so it would never run. Every sales-order item and every supplier-purchase line resolves its rate through `TaxRepository.requireEffectiveProfile`, which **throws** when no active default profile exists. The live database confirms the gap: `tax_rates` and `tax_profiles` are both empty there today, while the VAT schema is already applied. Deployed as it stood, the first sale and the first purchase after upgrading would have failed at the counter with no way to recover from the UI. The unit tests did not catch it because they mock `TaxRepository`. |
| **Files/modules** | `backend/prisma/migrations/20260906150000_seed_default_tax_configuration/migration.sql`, `backend/src/features/tax/tax-configuration-migration.test.ts` |
| **Database impact** | Additive, idempotent, writes no money and modifies no existing row. `createdById` resolves to the earliest non-deleted ADMIN. On a brand-new database migrations run before the seed, so no user exists, the statements insert nothing, and `seed.ts` creates the same rows moments later. `isDefault` is computed as "only if no other active default exists", so an installation that already nominated a different default keeps it. |
| **Business impact** | Makes the VAT foundation deployable. **It does not decide the VAT policy question** — see Outstanding Issues (Critical). |
| **Tests** | `tax-configuration-migration.test.ts` (6 assertions). Verified on a scratch database in both directions: fresh `migrate` + `seed`, and an upgrade where the admin exists and the tax tables are empty. Applying the SQL a second time inserts nothing. |
| **Status** | **Done, committed as `cdeacd7`.** |

---

### Supporting work

| Item | What | Status |
|---|---|---|
| Environment load order | `load-env.ts` fixes import hoisting so `JWT_SECRET` is on `process.env` before the first application import evaluates | Done |
| Serializable retry backoff | `financial/infrastructure/transaction.ts` backs off between `P2034` retries | Done |
| Supplier balance review | `SUPPLIER_BALANCE_REVIEW.md` records the verified derived-balance behavior | Done and tracked |
| Operational documentation | `BASELINE.md`, `RESTORE_RUNBOOK.md`, `ROLLBACK_PLAN.md`, `LEGACY_TRANSACTIONS_AUDIT.md`, `IDEMPOTENCY_PATTERN.md`, `CURRENCY_DESIGN.md`, `VAT_DESIGN.md`, `JWT_TRACE.md`, `COST_PRICE_TRACE.md`, `PURCHASE_TRACE.md`, plus dated T4 and T8 evidence | Written and tracked on `develop` |

---

## Database / schema changes

### New models

| Model | Table | Purpose |
|---|---|---|
| `ExchangeRate` | `exchange_rates` | Append-only, effective-dated USD↔LBP rates, `Decimal(18,6)`, FK to the creating user with `onDelete: Restrict` |
| `TaxRate` | `tax_rates` | Configurable VAT rate, `Decimal(6,3)`, effective-dated, unique `code` |
| `TaxProfile` | `tax_profiles` | Named classification pointing at a rate; partial unique index allows exactly one active default |

### Removed models

| Model | Table | Note |
|---|---|---|
| `Transaction` | `transactions` | **Dropped.** Confirmed empty first. Not reversible by down-migration. |
| — | `TransactionType`, `TransactionStatus` enums | Dropped. `TransactionStatus` used `DROP TYPE IF EXISTS` because it existed in the deployed schema but not in the committed migration history. |

`ActivityLog` / `activity_logs` was **retained** — `dashboard-activity.repository.ts` reads it, and it has no FK to `Transaction`, so the two separated cleanly.

### New fields

| Table | Fields |
|---|---|
| `debts` | `currency`, `exchangeRate`, `baseOriginalAmount` |
| `installment_plans` | `currency`, `exchangeRate`, `baseTotalAmount` |
| `installments` | `baseAmountDue` |
| `payments` | `currency`, `exchangeRate`, `baseAmount` |
| `payment_allocations` | `paymentAmount`, `exchangeRate` (**`amount` unchanged, still in the obligation's currency**) |
| `products` | `priceCurrency`, `taxProfileId`, `priceIncludesVat` |
| `service_jobs` | `currency`, `exchangeRate`, `baseEstimatedPrice`, `baseFinalPrice` |
| `sales_orders` | `currency`, `exchangeRate`, `baseSubtotal`, `baseDeliveryFee`, `baseTotalAmount`, `basePaidAmount`, `baseRemainingAmount` |
| `sales_order_items` | `baseUnitPrice`, `baseDiscountAmount`, `baseLineTotal`, `taxRateSnapshot`, `taxCodeSnapshot`, `unitPriceExVat`, `vatAmount`, `lineTotalIncVat` |
| `supplier_transactions` | `idempotencyKey`, `currency`, `exchangeRate`, `baseAmount` |
| `supplier_receivings` | `idempotencyKey` |
| `supplier_purchase_lines` | `baseUnitPrice`, `baseLineTotal`, `taxRateSnapshot`, `taxCodeSnapshot`, `unitPriceExVat`, `vatAmount`, `lineTotalIncVat` |

### Indexes and constraints

- **Unique:** `supplier_transactions.idempotencyKey`, `supplier_receivings.idempotencyKey`, `exchange_rates(fromCurrency, toCurrency, effectiveFrom)`, `tax_rates.code`, `tax_profiles.code`, and a **partial** unique index permitting one active default tax profile.
- **Indexes:** `exchange_rates(fromCurrency, toCurrency, effectiveFrom)`, `exchange_rates(createdAt)`, `tax_rates(isActive, effectiveFrom, effectiveTo)`, `tax_profiles(taxRateId)`, `tax_profiles(isActive, isDefault)`, `products(taxProfileId)`.
- **Foreign keys:** `exchange_rates.createdById → users`, `tax_rates.createdById → users`, `tax_profiles.taxRateId → tax_rates`, `products.taxProfileId → tax_profiles` — all `onDelete: Restrict`, consistent with the rest of the schema.
- **CHECK constraints:** positive exchange rates everywhere; rate = 1 whenever currency is USD; whole-number amounts whenever currency is LBP (`trunc(x) = x`) on debts, installment plans, payments, service jobs, sales orders, supplier transactions and product prices; tax rate between 0 and 100; `vatAmount >= 0`; and `lineTotalIncVat = lineTotal + vatAmount` on both line tables.
- **Money columns remain `Decimal(12,2)`.** No `Float` or `Double` appears anywhere in the schema.
- **No stored balance column** was introduced on `Customer`, `Supplier` or `Debt`. ADR-02 holds.

### Migrations

| Migration | Type | Reversible | Existing-data impact |
|---|---|---|---|
| `20260827090000_add_supplier_idempotency` | Additive | Yes — drop two indexes and two nullable columns | None. Existing rows keep NULL |
| `20260830183000_remove_legacy_transactions` | **Destructive** | **No** — recovery is a backup restore | None *only because* the table was confirmed empty first |
| `20260901090000_add_dual_currency_foundation` | Additive + data backfill | Yes — drop the added columns and `exchange_rates` | Every money row stamped `USD` / rate 1 / base = amount. **No amount modified** |
| `20260903120000_add_vat_foundation` | Additive + data backfill | Yes — drop the added columns and both tables | Existing lines get rate 0 / VAT 0 / inc = ex. **Every historical total unchanged to the cent** |
| `20260906150000_seed_default_tax_configuration` | Additive data-only | Yes — delete the four seeded rows | None. Inserts only what is missing |

### Migrations that could affect existing production data

1. **`20260830183000_remove_legacy_transactions` — irreversible.** It drops a table. It is safe *only* on the evidence that `transactions` held zero rows, recorded in `LEGACY_TRANSACTIONS_AUDIT.md`. `SELECT COUNT(*) = 0` must be re-confirmed on the target database immediately before deployment, and a verified backup must exist. A down-migration cannot recreate deleted rows or prove their contents.
2. **`20260901090000_add_dual_currency_foundation` — backfills every money row.** It writes `currency`, `exchangeRate` and base amounts on ten tables. It never touches an original amount, and the CHECK constraints it adds will *reject* the migration if any existing LBP-shaped data violates the whole-number rule — but the backfill assumes **every historical amount is USD**. That assumption is correct for the reviewed data set.
3. **`20260903120000_add_vat_foundation` — backfills every invoice and purchase line** at a zero rate. This is deliberate and is the only defensible choice: those documents were genuinely issued without VAT.
4. **All four are already applied to the live database** at `localhost:5433/homeconnect`, recorded at `2026-09-04 15:40:52`, ahead of this branch being merged. See Outstanding Issues (Critical).

---

## Financial / inventory integrity changes

| Area | What Phase 1 changed | Integrity position |
|---|---|---|
| **Customer balances** | Unchanged in derivation. `PaymentAllocation.amount` deliberately stays in the obligation's currency so `calculateDebtBalance` never had to change. | Still derived. Verified clean on live data. |
| **Supplier balances** | Unchanged in derivation. Supplier writes gained idempotency; `SUPPLIER_BALANCE_REVIEW.md` records the review. | Still derived. Verified clean on live data. |
| **Payments** | Gained `currency`, `exchangeRate`, `baseAmount`. Cross-currency payments are converted at allocation time; **manual reallocation of a cross-currency allocation is explicitly rejected** rather than silently re-converted. | No second source of truth. |
| **Allocations** | Gained `paymentAmount` and `exchangeRate` — the payment-side view. `amount` is untouched and remains the only value balance calculations consume. | ADR-02 intact. |
| **Purchases** | Idempotency key; VAT snapshot per line; ex-VAT and inclusive line totals stored; cost update writes inside the same transaction. | One payable per submission. |
| **Receiving** | Idempotency key. Void dialog warns when the underlying purchase changed a product cost. | One stock increase per submission. |
| **Stock movements** | No change to the compare-and-set machinery. | Ledger remains authoritative and auditable. |
| **Inventory reconciliation** | No change to the check; it is now linked from Maintenance alongside the two new financial reports. | 0 mismatches on live data. |
| **Sales-order cash** | **Unchanged — CP-2 is still open.** `SalesOrder.paidAmount` still creates no `Payment`. This is Phase 2 T8. | Known gap, unmeasured. |
| **Product cost** | Now updated from posted purchases, weighted, ex-VAT, audited. Voiding a receiving does not revert it. | Every change has a `ServiceAudit` row. |
| **Currency** | Snapshotted per transaction; rates are append-only and effective-dated. | **Old transactions are never recalculated at a current rate.** |
| **VAT** | Snapshotted per line (`taxRateSnapshot`, `taxCodeSnapshot`). Document totals are the exact sum of rounded line amounts, never independently rounded. | **Changing a `TaxRate` provably cannot alter a historical invoice** — no historical line reads the table. |
| **Historical immutability** | Preserved throughout. Both backfills write only new columns. | Held. |
| **Transaction boundaries** | Every new write is inside `runFinancialTransaction`. Exactly one bare `prisma.$transaction` exists in the codebase, inside that shared helper. Repositories accept and use the passed `tx`. | Held. |

**Live verification, 2026-09-06 (read-only, database `homeconnect`):**

```text
inventory reconciliation   totalProducts=86  ok=4  notInInventory=81
                           pendingOnboarding=1  mismatch=0
customer financial         count=105  ok=105  mismatches=0
                           reported=22114.00  independent=22114.00  difference=0.00
supplier financial         count=3    ok=3    mismatches=0
                           reported=1205821.00  independent=1205821.00  difference=0.00
```

Identical to the 2026-09-04 baseline. The one `PENDING_ONBOARDING` product (HC-000004, stock 99, no opening movement) is unchanged and must not be described as reconciled until an authorised opening count is recorded.

---

## Security changes

| Area | Change | Evidence |
|---|---|---|
| **JWT configuration** | `requireEnv('JWT_SECRET')` throws at module load. The hardcoded `fallback_secret_key_change_in_production` is gone from **all production code**. | `env.test.ts`, grep of `backend/src` excluding tests |
| **Startup ordering** | `load-env.ts` guarantees the env file is loaded before any module that reads a secret at module scope is evaluated. | `load-env.test.ts` |
| **Revoked / deleted users** | Re-checked on every authenticated request through a 30-second cache, on both the access and the refresh path. Deactivation invalidates the cache entry immediately. | `auth.middleware.test.ts`, `auth.service.test.ts`, `users.service.test.ts` |
| **Authorization** | Both new route families are role-gated: `exchangeRatesRoutes.use(requireRole([Role.ADMIN]))`, and every report row route including the two new integrity slices carries `requireRole(['ADMIN'])` on both the JSON and CSV endpoints. The frontend gates Reports and Settings panels to ADMIN as well. | `exchange-rates.routes.test.ts`, `report-rows.routes.test.ts`, `SettingsPage.test.tsx` |
| **Attack surface** | `/api/v1/transactions` unmounted — a route that could write customer money records invisible to every screen. | `app.ts` |
| **Secret handling** | No secret is logged; redaction tests remain green. CI uses a CI-only JWT value that is never a real secret. | `redaction.test.ts`, `ci.yml` |
| **Branch / data isolation** | Not applicable — multi-branch architecture is explicitly out of scope. | — |

---

## CI / testing improvements

**Pipeline.** `.github/workflows/ci.yml` runs on pushes to `develop` and pull requests with a Postgres 16 service: `npm ci` → `prisma generate` → `prisma migrate deploy` → typecheck → lint → `test:ci` → **skip assertion** → build. Concurrency group cancels superseded runs.

**The skip assertion is the point of the whole task.** The job parses the vitest JSON report and fails on `numFailedTests > 0` **or** any skipped or todo test. Reaching "all eight flags set" while three files still skipped would have produced exactly the false confidence T1 exists to remove.

**Database safety.** `scripts/assert-test-database.mjs` runs before vitest and aborts unless the target database name matches `/(^|[_-])(test|ci)([_-]|$)|phase\d/i`. Five of the eight suites have no self-guard and are destructive; on a developer machine `DATABASE_URL` normally points at the real database. The three suites that *do* self-guard on the database name kept those guards untouched — CI simply names its throwaway `homeconnect_ci_phase4_phase5_phase6` to satisfy all three at once.

**Suites enabled.** All ten previously-skipped database integration files now run: financial, inventory, inventory-awaiting-deduction, sales-order stock fulfilment, supplier purchase, supplier receiving, phase-4 debt, phase-5 installment, phase-6 customer summary, plus customer financial summary.

**Tests added or extended** (selection): `env.test.ts`, `load-env.test.ts`, `auth.middleware.test.ts`, `auth.service.test.ts`, `users.service.test.ts`, `supplier-idempotency-migration.test.ts`, `vat.test.ts`, `vat-migration.test.ts`, `tax-configuration-migration.test.ts`, `currency-allocation.test.ts`, `money.test.ts`, `exchange-rates.routes.test.ts`, `report-rows.service.test.ts`, `supplier-purchases.service.test.ts`, `supplier-receivings.service.test.ts`, `sales-orders.service.test.ts`, `supplier-purchase-db.integration.test.ts`, `supplier-receiving-db.integration.test.ts`, `financial-db.integration.test.ts`, `ReportDetailPage.test.tsx`, `SettingsPage.test.tsx`, `maintenance.components.test.tsx`.

**Results.**

| Gate | Result | Where |
|---|---|---|
| Hosted CI on the PR | `passed=2259 failed=0 skipped=0`, 3m45s | [run 34040477880](https://github.com/SamirMD0/HomeConnect/actions/runs/34040477880) |
| Deliberate red proof | Failed as intended, then reverted | [run 33882813349](https://github.com/SamirMD0/HomeConnect/actions/runs/33882813349) |
| Local `test:ci`, 2026-09-06 | 275 files, 2,259 tests, **0 skipped**, 209.95s | this review |
| Local `test:ci` on `develop`, 2026-09-06 | 276 files, 2,266 tests, **0 failed, 0 skipped**, 199.47s | disposable `homeconnect_test_phase4_phase5_phase6` database |
| Typecheck / lint / build on `develop` | All exit 0; lint has 65 pre-existing warnings and 0 errors; build has the existing chunk-size warning | this checkpoint |
| Local `test:ci` after the tax fix | 276 files, **2,266 tests, 0 failed, 0 skipped**, 213.20s | this review |
| `npm run typecheck` | Pass (frontend + backend) | this review |
| `npm run lint` | **0 errors**, 65 warnings | this review |
| `npm run build` | Pass | this review |
| `npm run rehearse:migrations` | **PASSED** — 36 migrations applied to an empty scratch database, 0 pending / 0 failed / 0 mismatched; a simulated half-applied migration was detected | this review |
| Integrity reports on live data | All three clean (above) | this review |

**Tests still skipped: none.** That is enforced by CI, not asserted by hand.

---

## Outstanding Phase 1 Issues

### Critical

**C1 · The VAT inclusive/exclusive question is unanswered, and the answer changes every price.**
The VAT migration backfilled `priceIncludesVat = false` for all 86 products, and `LB_STANDARD` at 11% is the default profile. Together that means the first sale after deployment **adds 11% on top of every price entered**. If the shop's displayed prices already include VAT — the norm in Lebanese retail — then every customer is over-charged by 11% and the VAT return is overstated. The correct default may be `priceIncludesVat = true`, or a zero-rated default until the shop is VAT-registered. **This is a business decision, not a code defect, and it must be answered before any deployment.** Nothing in the code can decide it.

**C2 · The live database is already migrated; the deployed application is not.**
All four Phase 1 migrations are recorded as applied to `localhost:5433/homeconnect` at `2026-09-04 15:40:52`, while `main` is still at `ac6ae9f`. The `transactions` table has been dropped, but `main`'s code still mounts `/api/v1/transactions`, still calls `TransactionsService`, and `CustomerProfilePage` still renders the Legacy Ledger. Any build from `main` pointed at that database will error on those paths. `tax_rates` and `tax_profiles` are empty there, so a Phase 1 build pointed at it would fail every sale and purchase until `20260906150000` is applied. **The schema and the code must be brought back into step deliberately, with a backup taken first.**

**C3 · T8 selling-price change has not been signed off.**
Posting a purchase now changes preset-derived selling prices immediately. `T8_AFFECTED_PRODUCTS_2026-09-04.md` records that the currently calculable change list is **empty** (one preset-priced product, no active purchase line to simulate from) — that is not evidence that future receipts cannot change prices. REVIEW.md is explicit: *a silent price change is a business incident, not a deployment.*

**C4 · T9a removes a visible panel without owner sign-off.**
The Legacy Ledger has never displayed data, but it is the owner's screen.

**C5 · No verified off-machine backup.** `OFF_MACHINE_BACKUP_EVIDENCE.md` is entirely `NOT YET PERFORMED — BLOCKED ON OWNER`. REVIEW.md lists "backups only on the business PC's disk" as an explicit **NOT COMPLETE** condition. This is R-15, and the plan calls it possibly the highest value-per-hour item in the project.

**C6 · No timed restore rehearsal on real data.** `RESTORE_RUNBOOK.md` is written and complete as a procedure, but every evidence row is `NOT YET PERFORMED — BLOCKED ON OWNER`. REVIEW.md lists "restore not rehearsed on real data" as an explicit **NOT COMPLETE** condition. Rollback from the irreversible T9 migration *is* a restore — an unrehearsed restore makes that rollback path a hypothesis.

**C7 · Production `JWT_SECRET` not confirmed.** T5 makes the application refuse to start without it. If the installed `production.env` lacks the key, deploying this branch turns a silent security defect into a hard outage. The plan flags this explicitly: *must verify the installed production config actually has the key before shipping.*

### Important

**I1 · No INV-14 route-authorization meta-test exists.** REVIEW.md cites it twice as the evidence that every mutating route carries a role check. Individual route tests cover the new endpoints, but nothing prevents a future route from shipping without authorization.

**I2 · `fallback_secret_key_change_in_production` still appears in 31 test files.** Production code is clean, and CI sets `JWT_SECRET`, so the literal is unreachable — but REVIEW.md's check reads "grep for `fallback_secret` — must find nothing", and it does find something. Either the helpers should read the CI value without a fallback, or the check should be restated to exclude tests.

**I3 · Currency is not operational on sales orders or supplier purchases.** Both services pass `Currency.USD` as a literal in every VAT and totals call. The columns exist and the domain is currency-aware, but no operator can transact in LBP through those paths. Debts, payments, allocations and installment plans *are* currency-aware. This is the T13 "foundation" boundary, and closing it is Phase 2 T10 — but Phase 2's plan describes T10 as UI-and-documents with "no DB impact", which understates it.

**I4 · T8's cost update rounds with USD rules unconditionally.** `divideMoney(..., Currency.USD, ...)` computes the weighted cost regardless of the purchase currency. It is correct today because purchases are USD-only, but the moment I3 is closed, an LBP purchase would write a two-decimal cost into a product whose `priceCurrency` is LBP — which the `products_lbp_whole_prices_check` constraint would reject, failing the purchase. **Fix this as part of Phase 2 T10, not after.**

**I5 · No repair SQL exists for any Phase 1 migration.** The rehearsal confirms a genuinely half-applied migration is *detected* but cannot be re-applied automatically, because Prisma migration SQL is not idempotent. `backend/prisma/repair/` holds a repair file for every past release that needed one. By convention those are written reactively, so this is a gap to be aware of during deployment rather than a defect — but the two backfilling migrations are the largest in the project's history (39 and 27 statements) and are the likeliest to be interrupted.

**I6 · Resolved: Phase 1 evidence is tracked.** `.gitignore` now exposes only `.claude/home-connect-erp-upgrade/` while keeping other `.claude` content ignored. Plans, reviews, summaries, and evidence are versioned on `develop`.

**I7 · No UI screenshots captured** for the new Exchange Rate panel, the three new report cards, the VAT pricing breakdown or the receiving void warning.

**I8 · Historical branch pointers remain.** The revised policy creates no phase branches and uses only `develop` for new work. Existing feature/temporary pointers are cleanup items only after their tips are verified preserved; they do not change the checkpoint verdict.

### Optional / follow-up

- **O1** · `calculateSalesOrderTotals` in `domain/sales-order-totals.ts` is now dead in production — all three service paths use `calculateVatAwareOrderTotals`. Only tests still call it.
- **O2** · The delivery fee is excluded from the VAT base. That is probably right, but it was never explicitly decided.
- **O3** · 65 lint warnings, mostly unused catch bindings. Zero errors.
- **O4** · HC-000004 remains `PENDING_ONBOARDING` (stock 99, no opening movement) and needs an authorised opening count.
- **O5** · **T9b deferred by design.** Dashboard Recent Activity: retire the panel or reimplement it over the five audit tables. `activity_logs` is retained, empty, and read by `dashboard-activity.repository.ts`.
- **O6** · **T11 (liveness predicates) descoped** to Phase 5 per MASTER_PLAN §10.
- **O7** · The frontend bundle has chunks over 500 kB.
- **O8** · The plan mentions seeding an *exempt* classification; only `LB_STANDARD` and `LB_ZERO` were seeded, and `vat-migration.test.ts` asserts that exclusion deliberately. Worth confirming the shop never needs an exempt code.

---

## Known technical debt

| Item | Deliberate? | Note |
|---|---|---|
| T9b Dashboard Recent Activity | Yes | Product decision deferred; `activity_logs` retained rather than guessed at |
| T11 liveness predicates | Yes | Descoped to Phase 5 to fund currency and VAT |
| Sales-order cash gap (CP-2) | Yes | Phase 2 T8; must be *measured* before it is designed |
| Currency pinned to USD on sales and purchases | Yes | The T13/Phase-2-T10 boundary, but larger than Phase 2's plan says |
| Cross-currency allocations cannot be manually reallocated | Yes | Rejected explicitly rather than silently re-converted at a current rate |
| 30-second session-revocation window | Yes | The cache TTL, chosen over a per-request query |
| Dead `calculateSalesOrderTotals` | No | Left behind by the VAT change |
| `fallback_secret` literal in test helpers | No | Harmless, but it fails a stated review check |
| No route-authorization meta-test | No | Cited in REVIEW.md as existing evidence; it does not exist |
| No repair SQL for the five Phase 1 migrations | Partly | Repair files are written reactively by convention |

---

## Risks introduced by Phase 1

| # | Risk | Severity | Why | Mitigation in place |
|---|---|---|---|---|
| R-A | **VAT applied on top of already-VAT-inclusive shelf prices** | **High** | `priceIncludesVat = false` for all products with an 11% default profile | None. Requires C1 to be answered |
| R-B | **Live schema is ahead of live code** | **High** | Four migrations applied 2026-09-04; `main` unchanged | None. Requires C2 to be reconciled |
| R-C | **T9 is not reversible** | **High** | `DROP TABLE transactions` | Confirmed-empty evidence + backup restore path, **but the restore is unrehearsed (C6)** |
| R-D | **Silent selling-price movement from cost updates** | Medium | Cost updates flow straight into preset pricing | Every change audited; Product Cost Changes report; void dialog warning. **Owner not yet told (C3)** |
| R-E | **Startup now fails hard without `JWT_SECRET`** | Medium | Deliberate, but converts a silent defect into an outage | Actionable error message; Electron startup monitor matcher. **Production config unconfirmed (C7)** |
| R-F | **Dual-currency complexity across ten tables** | Medium | Largest schema change in the project | CHECK constraints; USD/rate-1 backfill; `PaymentAllocation.amount` untouched so balance code never changed |
| R-G | **Currency half-implemented** | Medium | Schema everywhere, behaviour only on some paths | Cannot be reached by an operator yet — sales and purchases are USD-pinned |
| R-H | **Rounding at scale in LBP** | Medium | LBP is 0 dp; a 89,500:1 rate makes one unit of rounding meaningless but many units visible | Per-line rounding, ROUND_HALF_UP, totals summed from rounded lines and never re-rounded |
| R-I | **Idempotency keys are nullable** | Low | An old or scripted client omitting a key still writes | Deliberate for backward compatibility; both shipped forms always send one |
| R-J | **A half-applied backfill migration cannot self-heal** | Low-Medium | 39- and 27-statement migrations, non-idempotent SQL | Detection works; recovery needs a hand-written repair file (I5) |
| R-K | **Report surface grew** | Low | Three new ADMIN-only read-only slices | Role-gated on both JSON and CSV routes |

---

## Phase 1 verdict

```text
NOT COMPLETE
```

**The engineering is done. The phase is not.**

Every code deliverable in the plan is implemented, tested and verified: CI runs the database suites with zero skips and has been observed going red; the hardcoded secret is gone; sessions revoke; supplier writes are idempotent; costs update and are audited; the legacy money module is gone; both integrity reports exist, are role-gated, and detect injected corruption; currency and VAT foundations are in place with history provably immutable. Typecheck, lint, build, the migration rehearsal and all three integrity reports on live data pass. One genuine deployment-blocking defect was found during this review and fixed.

But Phase 1's own merge gate names conditions that are unmet, and they are unmet for reasons no amount of code will change:

- **backups have not been verified off-machine** (explicit NOT COMPLETE condition);
- **a restore has not been rehearsed or timed on real data** (explicit NOT COMPLETE condition) — which is also the only rollback path for the one irreversible migration;
- **the T8 selling-price change has not been communicated to the owner** (explicit PR-readiness condition);
- **T9a's removal of a visible screen has not been signed off**;
- **the production `JWT_SECRET` has not been confirmed** before shipping a change that hard-fails without it;
- and this review found that **the VAT inclusive/exclusive default has never actually been decided**, which determines whether every price the shop charges moves by 11%.

REVIEW.md is explicit that `COMPLETE WITH FOLLOW-UP` is *not* a way to defer a failing gate. Multiple gates below the line are failing, so the honest verdict is `NOT COMPLETE`.

The question that decides the phase — *if the business PC failed tomorrow morning, could the business be trading again today, and would the restored numbers be provably correct?* — currently answers **"the numbers, yes; the trading, unknown."** The integrity reports prove the second half. The first half is exactly what C5 and C6 exist to establish, and neither has been done.

**Calling this complete because the build is green would be the specific mistake the plan warns against.**

### What this blocks

Under the revised `develop` checkpoint policy, `NOT COMPLETE` blocks Phase 2 implementation. C1, C2, C5, C6 and C7 must be closed, or the owner must explicitly change the gate. I3 and I4 already update Phase 2's plan but do not override the Phase 1 blockers.

It also blocks deployment and the eventual merge to `main`.

---

## Appendix · Git state at the close of this review

```text
branch      develop
phase head  cdeacd7  fix: seed default tax configuration on upgrade
main        ac6ae9f555dd69d61ca79be527cc1a80513643d9  — UNCHANGED
tag         phase-01-core-integrity-checkpoint → cdeacd7
next        Phase 2 on develop, blocked while verdict is NOT COMPLETE
```

Nothing was merged or pushed to `main`. No phase-specific branch was created under the revised policy.
