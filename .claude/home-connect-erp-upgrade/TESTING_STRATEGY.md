# TESTING STRATEGY

## Where testing actually stands

Verified by running the suite on 2026-08-25:

```
Test Files  256 passed | 10 skipped (266)
     Tests  2181 passed | 10 skipped (2191)
   Duration  108.30s                            exit code 0
```

~34,300 lines of test against ~69,500 lines of production code — a **0.49 ratio**. That is genuinely good, and the pure-domain coverage (`money.test.ts`, `balances-statuses-allocation.test.ts`, `installment-schedule.test.ts`, `calculation-contract.test.ts`, `immutable-policy.test.ts`) is excellent.

**The problem is not quantity. It is which layer is covered.**

| Layer | Coverage | Verdict |
|---|---|---|
| Pure domain logic | Excellent | Money arithmetic, allocation, schedules, statuses, policy |
| Service (mocked repos) | Extensive | Business rules well covered |
| Route / API (supertest) | Good | Auth, validation, shape |
| Frontend components | Good | 80 files including snapshots |
| **Database integration** | **Written but skipped** | All 10 files gated behind `RUN_*_DB_TESTS` |
| **Concurrency** | **Written but skipped** | Same gating |
| **E2E** | **None** | No Playwright or Cypress |
| **CI** | **None** | No `.github/`, no pipeline |

### The gap that matters

**Eight** separate env flags gate the integration suites:

```ts
const runDatabaseTests = process.env.RUN_FINANCIAL_DB_TESTS === '1' && Boolean(process.env.DATABASE_URL);
const describeDatabase = runDatabaseTests ? describe : describe.skip;
```

| Flag | Files | Extra condition |
|---|---:|---|
| `RUN_FINANCIAL_DB_TESTS` | 1 | `DATABASE_URL` set |
| `RUN_INVENTORY_DB_TESTS` | 2 | `DATABASE_URL` set |
| `RUN_SALES_FULFILLMENT_DB_TESTS` | 2 | `DATABASE_URL` set |
| `RUN_SUPPLIER_PURCHASE_DB_TESTS` | 1 | `DATABASE_URL` set |
| `RUN_SUPPLIER_RECEIVING_DB_TESTS` | 1 | `DATABASE_URL` set |
| `RUN_PHASE4_DEBT_DB_TESTS` | 1 | **database name must contain `phase4`** |
| `RUN_PHASE5_INSTALLMENT_DB_TESTS` | 1 | **database name must contain `phase5`** |
| `RUN_PHASE6_CUSTOMER_SUMMARY_DB_TESTS` | 1 | **database name must contain `phase6`** |

**The last three are the awkward ones.** They assert on the database *name* (`databaseName.includes('phase4')`) as a guard against ever pointing a destructive test suite at a real database — a sound instinct, but it means setting the flag is not sufficient. CI must provision three separately-named databases, or T1 must relax the naming guard to something CI can satisfy while keeping the protection. **Decide this in T1; it is the one non-obvious piece of that task.**

So a green `npm test` proves the logic is right. It does **not** prove that compare-and-set conflicts abort, that transactions roll back leaving no partial state, or that unique constraints hold under concurrency — **the exact guarantees the whole system's safety rests on.**

**This is the single highest-value testing change available, and it is nearly free: the tests already exist.**

---

## Principle

**Rate testing by whether business invariants are protected, not by test count.**

An invariant is a statement that must be true after *every* operation, in every order, including after failures. Each one below gets a test that would fail loudly if the invariant broke.

---

## Priority 1 — Business invariants

These are the contract. Every one must run automatically in CI.

### INV-01 · Customer balance equals valid ledger transactions
> For any customer: `outstanding == Σ(non-cancelled debts) + Σ(non-cancelled installments) − Σ(non-voided allocations)`

**Type:** DB integration + property-based
**Why:** The central financial claim. Currently guaranteed by ADR-02 (derived balances) — this test proves the derivation stays correct as code changes.
**Edge cases:** voided payment; voided single allocation; cancelled debt with prior payments; overpayment; payment split across debt + installment; correction that reallocates.

### INV-02 · Supplier balance equals valid supplier transactions
> `balance == Σ(INCREASE_OWED where ACTIVE) − Σ(DECREASE_OWED where ACTIVE)`

**Type:** DB integration
**Edge cases:** removed then restored transaction; amount override; receiving-linked transaction; voided receiving.

### INV-03 · A successful sale affects stock exactly once
> After confirming fulfillment: `stockQuantity` decreased by exactly the ordered quantity, exactly one `SALE_FULFILLMENT` movement exists, and exactly one `SalesOrderStockFulfillment` row exists.

**Type:** DB integration
**Why:** `stockMovementId @unique` makes double-deduction unrepresentable — this proves the guard holds through the service path.
**Edge cases:** deduct twice; deduct → restore → deduct; deduct a cancelled order; multi-line order with a repeated product.

### INV-04 · Concurrent stock operations never lose an update
> Two simultaneous deductions of the same product: one succeeds, one fails with a 409, and the final quantity reflects exactly one deduction.

**Type:** DB integration, genuinely concurrent (two real transactions)
**Why:** Proves the compare-and-set in [inventory.repository.ts:177-187](backend/src/features/inventory/inventory.repository.ts#L177). **This is the highest-value test in the suite.**
**Also assert:** the 409 surfaces as an intelligible message, not a raw error.

### INV-05 · A failed transaction leaves no partial state
> Force a failure mid-operation. Assert: no orphan movement, no orphan allocation, no changed quantity, no partial order.

**Type:** DB integration
**Why:** Proves `runFinancialTransaction` boundaries hold. Cannot be tested with mocked repositories.
**Edge cases:** fail after movement but before quantity update; fail after debt creation but before allocation; fail during audit write.

### INV-06 · Payment allocation never silently loses money
> `Σ(allocation amounts) == payment.totalAmount` always. Allocating more than remaining is rejected. A voided allocation returns its amount to the obligation's balance.

**Type:** Domain (exists) + DB integration (new)

### INV-07 · A duplicate request never duplicates a financial transaction
> Same idempotency key twice → one `Payment`. Same key with a different fingerprint → conflict, not a silent stale result.

**Type:** Integration. **Already covered for payments** (`idempotency-transaction.test.ts`). Extend to purchases and receivings after ADR-11.

### INV-08 · Duplicate purchase/receiving submissions are rejected *(new, ADR-11)*
> Two identical submissions with the same key → one payable, one stock increase.

**Type:** DB integration
**Why:** Closes CP-3 / R-05.

### INV-09 · Reports reconcile with transaction data
> For any period, each report total equals the same total computed independently from source rows.

**Type:** Integration
**Why:** Reports derive from shared domain functions, so they reconcile by construction — this proves it stays true.
**Must include CP-2:** assert explicitly whether sales-order cash is included in `collected`. **Whichever answer is chosen, the test encodes it** so the ambiguity cannot silently return.

### INV-10 · Cost snapshot immutability *(new, ADR-15/16)*
> After a sale is fulfilled, changing `Product.costPrice` does **not** change the margin reported for that sale.

**Type:** DB integration
**Why:** This is the whole reason for snapshotting cost. Without this test, ADR-15 can be silently undone.

### INV-11 · Money arithmetic is exact and deterministic
> No float anywhere. Rounding is explicit. Installment remainders distribute deterministically and sum to the plan total.

**Type:** Domain — **already well covered** by `money.test.ts` and `installment-schedule.test.ts`. Keep.

### INV-12 · Backup restores to a working system
> A backup can be restored, and the restored database passes the inventory reconciliation and balance invariants.

**Type:** **Manual drill, documented** — plus an automated portion in CI where practical.
**Why:** Closes CP-7 / R-12. **Must be run once on the real business database, timed, on real data volume.**

### INV-13 · Migrations apply cleanly to a real-shaped database
> Every migration in this plan applies to a **restored copy of the real database**, not a seeded dev one.

**Type:** Rehearsal — `npm run rehearse:migrations` already exists.
**Why:** Closes R-14. Dev databases lack the data shapes that break migrations.

### INV-14 · Every mutating route carries an explicit authorization check
> Enumerate all routes; assert each non-GET has `requireRole` or a documented policy call.

**Type:** Meta-test over the router
**Why:** Closes R-20 by making it impossible to ship an unprotected endpoint through omission rather than intent.

### INV-15 · Cancelled and voided records preserve audit history
> After any cancel/void/reverse: the original row still exists, the audit row exists with reason and actor, and the compensating record (not an edit) carries the change.

**Type:** DB integration

### INV-16 · Currency conversion uses deterministic rounding
> USD rounds to 2 dp, LBP to 0 dp, both `ROUND_HALF_UP`. The same inputs always produce the same output.

**Type:** Domain · **Status: Priority 1, approved 2026-08-26** (was "not applicable")
**Why:** Rounding is where currency systems silently lose money.

### INV-17 · A historical transaction never revalues
> Post a transaction at rate R. Add a new `ExchangeRate` row at rate R2. Assert the original transaction's amount, `exchangeRate`, and `baseAmount` are all unchanged.

**Type:** DB integration
**Why:** This is the single worst failure a currency system can have, and the owner named it explicitly. See ADR-19.

### INV-18 · Cross-currency payment leaves the balance exact
> A debt of 1000.00 USD paid 4,500,000 LBP at 90000 leaves a remaining balance of exactly 950.00 USD.

**Type:** DB integration
**Why:** Proves allocations stay in the obligation's currency and that `calculateDebtBalance` is genuinely unchanged (ADR-19).
**Edge cases:** payment split across a USD debt and an LBP debt; voiding a cross-currency allocation restores the exact original balance; overpayment in the other currency.

### INV-19 · Allocations sum exactly to the payment in the payment's own currency
> Σ(allocation `paymentAmount`) == `payment.totalAmount`, exactly, with no currency drift.

**Type:** DB integration
**Why:** Extends INV-06 across currencies. This is where "money lost in conversion rounding" would appear.

### INV-20 · Changing the configured VAT rate does not modify historical invoices
> Finalize an invoice at 11%. Change `TaxRate` to 12%. Assert every historical line's `taxRateSnapshot`, `vatAmount`, and `lineTotalIncVat` are unchanged, and the invoice's total is unchanged.

**Type:** DB integration · **Named explicitly by the owner.**
**Why:** The entire reason for the line-level snapshot (ADR-20). Without this test, the snapshot can be silently undone by a later refactor.

### INV-21 · VAT totals reconcile with invoice-line calculations
> Document VAT == the exact sum of the rounded line VAT amounts. The document total == subtotal + VAT. Neither is independently rounded.

**Type:** Domain + integration · **Named explicitly by the owner.**
**Why:** Guarantees the printed invoice is internally verifiable — every visible number adds up.
**Edge cases:** mixed taxable and exempt lines; a zero-rated line; a single-line invoice; a line whose VAT rounds to zero.

### INV-22 · Currency conversion causes no unexplained VAT discrepancy
> For a VAT-inclusive LBP invoice: `baseSubtotal + baseVatAmount == baseTotalAmount`, and each is the single conversion of its own component — never re-derived from a converted total.

**Type:** DB integration · **Named explicitly by the owner.**
**Why:** At ~90,000 LBP/USD, one cent of LBP rounding becomes a visible USD discrepancy. See ADR-21.

### INV-23 · A refund reverses the VAT originally charged
> Return a line sold at 11% after the rate changed to 12%. Assert the VAT reversed is the **snapshotted 11%**, not today's 12%.

**Type:** DB integration · **Named explicitly by the owner.**
**Why:** Ties Phase 2's return flow to the Phase 1 snapshot. Recomputing at today's rate would refund the wrong amount — and the customer would be the one who noticed.

### INV-24 · VAT-inclusive and VAT-exclusive rounding is deterministic
> For an inclusive price P: `priceEx + vat == P`, exactly, every time. For an exclusive price: `priceEx + round(priceEx × rate) == totalInc`.

**Type:** Domain · **Named explicitly by the owner.**
**Why:** The inclusive path derives VAT by subtraction precisely so the quoted price is exact by construction (ADR-20). This test locks that in.

### INV-25 · Aggregation never overflows the precision ceiling
> Summing a year of LBP transactions in base currency stays within `MAX_SCHEMA_MONEY`; a report that attempted to aggregate in LBP would be rejected rather than silently truncating.

**Type:** Integration
**Why:** [money.ts:13](backend/src/features/financial/domain/money.ts) caps at 9,999,999,999.99 — about $111k at LBP rates. See CURRENCY_AND_VAT_DECISION.md A7.

---

## Priority 2 — Regression protection

- **Route contract tests** for every endpoint: auth required, role enforced, validation rejects malformed input, response envelope shape.
- **Frontend double-submit tests** — assert the button is disabled while pending on every financial form (the `Button` component supports this; coverage of *usage* is what matters).
- **409 conflict handling** — assert stale-stock and already-voided conflicts render an intelligible message.
- **Snapshot tests** for printed documents once they exist (Phase 2), so invoice layout does not silently regress.

---

## Priority 3 — End-to-end

No E2E framework exists. Add Playwright in Phase 4 and cover **five journeys only** — E2E is expensive to maintain and should cover what integration tests cannot:

1. Login → create customer → create sales order → deduct stock → record payment → verify balance.
2. Receive stock from supplier → verify quantity and payable → void receiving → verify both reversed.
3. Create installment plan → pay two installments → verify schedule, balance, and overdue state.
4. Print a sales invoice and a payment receipt (Phase 2 deliverables).
5. Run the profit report and reconcile it against a known set of orders (Phase 3 deliverable).

**Do not** attempt broad E2E coverage. Five reliable journeys beat thirty flaky ones.

---

## CI pipeline — Phase 1, Task 1

```yaml
# Conceptual shape
on: [push, pull_request]
services:
  postgres: 16          # throwaway, for the DB suites
steps:
  - npm ci
  - npx prisma migrate deploy
  - npm run typecheck          # frontend + backend
  - npm run lint               # baseline: 89 warnings, 0 errors
  - npm run test:ci            # NEW — all eight RUN_*_DB_TESTS flags set to 1
```

Add to `package.json` (via `cross-env` or an equivalent, since the repo targets Windows and bare `VAR=x cmd` prefixes do not work in PowerShell):

```json
"test:ci": "cross-env RUN_FINANCIAL_DB_TESTS=1 RUN_INVENTORY_DB_TESTS=1 RUN_SALES_FULFILLMENT_DB_TESTS=1 RUN_SUPPLIER_PURCHASE_DB_TESTS=1 RUN_SUPPLIER_RECEIVING_DB_TESTS=1 RUN_PHASE4_DEBT_DB_TESTS=1 RUN_PHASE5_INSTALLMENT_DB_TESTS=1 RUN_PHASE6_CUSTOMER_SUMMARY_DB_TESTS=1 vitest run"
```

**This alone still leaves three files skipped** — the `phase4`/`phase5`/`phase6` suites also check the database name. T1 must additionally provision databases whose names satisfy those guards, or adjust the guard. **`test:ci` is not done until it reports 0 skipped.**

**Keep the flags** — they exist so a developer without a database can still run the fast suite, which is a good reason. CI simply sets them all.

**Gate:** the pipeline must be red on any failure. A CI that is allowed to stay red is worse than no CI, because it manufactures false confidence.

### CI as the `develop` checkpoint gate

CI is not merely a developer convenience — it is the automated gate for every phase checkpoint on `develop` ([GIT_WORKFLOW.md](GIT_WORKFLOW.md)).

**Bootstrapping.** Phase 1 Task 1 created CI. The workflow runs on `develop`, so every pushed checkpoint validates the cumulative upgrade. Until a new CI change itself lands, validation is manual and its complete output is recorded in the active phase summary.

**A skipped test is a failed gate.** `npm run test:ci` sets all eight `RUN_*_DB_TESTS` flags. An unjustified skipped database suite is **not** a passing checkpoint. `REVIEW.md` records it as a `NOT COMPLETE` condition.

**Required in every phase summary:** the full `npm run test:ci` output including the passed / failed / **skipped** counts, plus the `develop` CI link after push.

### What CI runs on `develop`

```
dependency install → typecheck → lint → database startup →
migrations → unit tests → integration tests → security checks → build
```

E2E (added Phase 4) runs as a **separate CI job**, preserving fast feedback while still blocking the final release gate.

---

## What "well tested" means for this project

Not a coverage percentage. This:

1. Every invariant in Priority 1 has a test that runs **automatically**.
2. `npm run test:ci` exercises the **database**, not just mocks.
3. A restore has been **performed and timed on real data**, not assumed.
4. Every migration has been **rehearsed against a restored copy of production**.
5. The five E2E journeys pass before each release.
6. **Every phase checkpoint on `develop` has a green CI run, and no upgrade reaches `main` before the final cumulative release gate.**

Against that definition, today's score is **6.0/10** — strong logic coverage, near-zero infrastructure coverage, no automation. Turning on tests that are already written moves it to roughly **7.5** for a handful of hours' work, and it is the best-value work in the entire plan.
