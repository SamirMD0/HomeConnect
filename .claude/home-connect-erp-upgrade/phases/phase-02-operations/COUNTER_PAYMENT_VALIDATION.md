# Prompt 10 — counter Payment implementation and validation

Date: 2026-09-14. Branch: `upgrade/phase-02-operations`. Design: [COUNTER_PAYMENT_DESIGN.md](COUNTER_PAYMENT_DESIGN.md). Implementation is present in the worktree; the overall migration safety gate remains blocked.

## Implemented boundary

- New positive counter-cash receipts create a normal Payment inside the same serializable transaction as the sale, optional unpaid-remainder debt, and creation audit. Additional eligible cash receipts record only the positive paid delta.
- Stable caller keys, stored command fingerprints, unique keys, and replay after unique-key races prevent duplicate sale/Payment creation. Identical retries return the persisted transaction; conflicting reuse is rejected. Audit failure rolls back sale, debt, and Payment together.
- Genuine customerless source sales use `Payment.customerId = null`; named sales use the actual customer ID. Application validation and additive database checks/triggers reject mismatches, sourceless null-customer Payments, and subsequent source-customer rewrites. No synthetic customer or mismatch exception is introduced.
- Source sale linkage, original sale-line VAT/price snapshots, original USD/LBP currency and exchange rate, base amounts, CASH method, payment date, actor and audit information are preserved. Receipt printing uses the existing route/document pipeline and stored source snapshots, not current prices or rates.
- Collections, cash reports, monthly collection totals, dashboard collection summaries, and ledger Payment totals include walk-in Payments once. Named histories, balances, statements and named payer counts exclude customerless Payments. A named sale's counter cash has no receivable allocation; only its unpaid remainder becomes debt.
- Monthly and month-end reports explicitly disclose non-receivable counter collections instead of making them appear to settle customer obligations. Month-end reconciliation is `opening + new - collected + nonReceivableCollected + adjustments = closing`; zero disclosure preserves existing output.
- USD two-decimal and LBP whole-unit money validation/rendering follow transaction currency. Named payment-history output also retains original currency/rate/base/source metadata. Relevant sales mutations invalidate affected financial/report caches.

## Tests and commands

Tests were written before implementation. After correcting an initial fixture issue, the counter database tests demonstrated five genuine failures and two passes against the old behavior. Coverage was then expanded to nine integration tests.

Final full command: `npm run test:ci`, with `DATABASE_URL` targeting only `homeconnect_test_phase4_phase5_phase6`. All configured database suites were enabled by the CI command, with file parallelism disabled.

```text
Test Files  1 failed | 295 passed (296)
     Tests  1 failed | 2389 passed (2390)
  Duration  206.68s
Exit code: 1
Skipped tests: 0
```

All nine counter-Payment integration tests passed. They cover USD/LBP walk-in and named partial sales, real customer ownership, exact source/base/VAT snapshots, report and history inclusion/exclusion, sequential and concurrent retries, conflicting keys, audit rollback, incremental receipts, original receipt preservation after tax changes, database source validation, and untouched historical Payment fixtures. Added unit/document tests cover validation, safe additive migration, unique-key replay, null-customer ledger/report rendering, currency labels, month-end disclosure, and receipt snapshots. Existing ordinary receipt/voiding behavior remains covered.

The sole full-suite failure is inherited from Prompt 07:

```text
backend/src/features/maintenance/sql-safety-scanner.test.ts
accepts migration 20260911120000_add_atomic_sales_returns
```

That return migration drops/replaces `sales_order_stock_fulfillments_reversal_coherent_check`, which the safety scanner rejects as `DROP_CONSTRAINT`. The scanner was not weakened, the test was not skipped, and the already-applied test migration was not edited to change its checksum. Prompt 10's additive migration safety test passes.

Other checks: `npm run typecheck` passed for frontend and backend; `npm run lint` exited 0 with 0 errors and 66 existing warnings; Prisma schema generation and validation passed; `git -c core.whitespace=cr-at-eol diff --check` passed.

## Read-only business verification

Command: load the existing business URL privately into `DATABASE_URL`, then run `npx tsx backend/scripts/verify-counter-payment-readonly.ts`. The script uses one connection with `default_transaction_read_only=on`; no credentials or customer rows are printed. It compares the committed Phase 1 independent integrity SQL with the existing customer receivables projections, and verifies before/after logical Payment and obligation/allocation evidence.

The final rerun returned:

```text
Database: homeconnect; readOnly: true
Customers: 105; mismatches: 0
Reported outstanding: 22114.00 USD
Independent outstanding: 22114.00 USD
Before Payments: 15; base total: 2803.13 USD
After Payments:  15; base total: 2803.13 USD
Before/after row checksum: 170fcbfc3ebdbcb8812fd098744d7d30
legacyPaymentsUnchanged: true
obligationAllocationEvidenceUnchanged: true
```

This is explicitly the Phase 1 compatibility check, not a claim that the current Phase 2 integrity report runs on an unmigrated business schema. The current report is blocked because the business database has not received the separately blocked return migration.

## Deliberately excluded / remaining gate

- Historical backfill remains OFF. No business migration, historical Payment rewrite, deployment, merge, or change to `main` occurred. The new additive migration was applied only to the isolated test database. Existing shared worktree changes are retained; no commit/push was made.
- Standalone void, amount correction, or reallocation of NEW source-linked counter Payments is not introduced: a coherent sale/receivable correction design needs separate approval. One-sided changes fail safely; existing ordinary Payment behavior is unchanged. Receipt printing remains available, including existing bilingual VOID rendering for voided receipts.
- Existing customerless-sale eligibility is unchanged; this does not broaden roles or introduce a fake customer. Existing derived balances remain authoritative.
- Resolve the inherited return-migration safety failure through separate review before business deployment. Do not treat the full suite as green or deploy the new UI against an unmigrated schema. A verified business backup and deployment authorization remain required.
