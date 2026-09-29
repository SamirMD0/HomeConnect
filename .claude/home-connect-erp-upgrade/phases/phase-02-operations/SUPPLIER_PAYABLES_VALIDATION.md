# Prompt 08 — supplier due dates and report-only FIFO aging

Date: 2026-09-14

Branch: `upgrade/phase-02-operations`; `main` remains `ac6ae9f`. No merge or production migration performed. Existing Prompt 07 changes and its migration-safety blocker are preserved.

## Owner-approved reporting policy

- The centralized due-soon default is seven days. Business Settings configuration is deliberately deferred, as requested; the calculator accepts an explicit window so this is not embedded in aging rules.
- Dates use the existing business-timezone calendar utilities: overdue is before today; due soon is today through today + 7, inclusive; future is later than that window.
- All active `INCREASE_OWED` obligations participate, including upward adjustments. All active `DECREASE_OWED` payments, credits, and downward adjustments enter one settlement pool per supplier.
- This is derived reporting only. Dated obligations settle by due date ascending, transaction date, creation timestamp, then transaction ID. Unscheduled obligations settle after dated obligations, ordered by transaction date, creation timestamp, and ID. Ties are deterministic and partial settlement occurs before the next obligation.
- Settlement uses immutable stored USD `baseAmount`, exactly like the existing supplier ledger, without current exchange-rate conversion or cross-supplier allocation. Original transaction amounts and currencies remain visible separately.
- Dated aging uses the existing receivable due-date tier boundaries, not customer payment-behavior/risk adjustments: Current / Not Due; 1–30; 31–60; 61–90; more than 90 days overdue.
- Null dates stay outside dated aging and appear as **Unscheduled / No Due Date**, included in total positive payables.
- Excess payments/credits appear separately as unapplied credit. For each supplier and the aggregate: `totalPayables - unappliedCredit = ledgerBalance`. This preserves negative ledger balances rather than silently clamping them to zero.
- Removed ledger entries are excluded. Archived suppliers with active financial records remain represented so outstanding money does not disappear.
- The report is a current operational snapshot, not a date-range activity or historical as-of reconstruction. The shared report period controls navigation only; the operational notice and summary identify this explicitly. No historical settlement records are invented.

## Implementation

Backend: one active-ledger SELECT, a pure Decimal-based FIFO calculator, per-supplier independent ledger reconciliation, and the existing ADMIN-only report/CSV route pipeline:

`GET /api/v1/reports/suppliers/payables-aging`

`GET /api/v1/reports/suppliers/payables-aging/export.csv`

Frontend: optional due dates in purchase and transaction forms, the bilingual supplier aging report at `/reports/supplier-aging`, server-calculated summary/buckets, and supplier/report/dashboard query invalidation after mutations. No frontend balance or FIFO arithmetic.

Dashboard: overdue count/value; next-seven-days count/value; oldest overdue obligation identified in overdue offenders with due date, age, supplier, and remaining amount. New payable queries and alerts remain ADMIN-only. Existing dashboard caching/refresh behavior is unchanged.

Scheduling metadata does not change transaction amounts, ledger directions, payment records, or existing history. Purchase due dates participate in idempotency comparison; null/omitted dates retain the previous fingerprint shape. Due-date edits follow the existing audit path.

## Migration disclosure

Migration required: Yes — `20260914123000_add_supplier_due_dates`, nullable PostgreSQL `DATE` plus an active-status/due-date index.

Backward compatible: Yes at the data/API level — due dates are optional, existing rows retain NULL. The generated client/new application requires the additive migration before deployment.

Existing data impact: No backfill, repricing, settlement writes, amount changes, or business-database writes. Migration was applied only to `homeconnect_test_phase4_phase5_phase6`.

Rollback strategy: Roll back application code first and retain the additive nullable column/index safely. A later approved schema rollback may remove the index/column after exporting newly entered scheduling metadata; that removal loses due dates, not financial amounts. No rollback SQL was executed.

Backup required: Yes, standard verified backup before business-database deployment. No production deployment or backup is claimed in this task.

Validation check: Prisma generation/validation, isolated migration deployment, additive SQL-safety test, FIFO/boundary/threshold/currency invariants, database source-record preservation, idempotent purchase tests, and before/after business supplier integrity checks.

## Tests and evidence

- Tests were written before the calculator and form implementations; initial failures covered the missing calculator, unrecognized due-date fields, and missing form inputs.
- Targeted final run: 5 files, 60 tests passed, zero failures; 37.49 seconds. Includes two isolated database tests, future/null/calendar validation, UI rendering, and report-route authentication/envelopes.
- `npm run typecheck`: frontend and backend passed.
- `npm run lint`: exit 0; 0 errors, 66 existing warnings.
- Full `npm run test:ci` against the isolated test database: **1 failed file, 293 passed files (294); 1 failed test, 2,370 passed tests (2,371); 0 skipped; 236.24 seconds; exit code 1**. All Prompt 08 tests pass, including the new additive migration safety test. The sole failure is the inherited return-migration constraint replacement described below.
- Machine-readable full-suite output: `node_modules/.cache/home-connect/vitest-report.json`.
- `git diff --check`: passed. No completed-feature commit or push is claimed while the shared worktree retains the unresolved Prompt 07 blocker.

Full-suite terminal summary:

```text
FAIL backend/src/features/maintenance/sql-safety-scanner.test.ts
accepts migration 20260911120000_add_atomic_sales_returns
Violation: DROP_CONSTRAINT — Dropping a constraint would weaken referential integrity.

Test Files  1 failed | 293 passed (294)
     Tests  1 failed | 2370 passed (2371)
  Duration  236.24s
   Skipped  0
 Exit code  1
```

Business-database supplier integrity report, read-only, before and after:

| Check | Before | After |
|---|---:|---:|
| Suppliers checked / OK | 3 / 3 | 3 / 3 |
| Reported ledger total USD | 1,205,821.00 | 1,205,821.00 |
| Independently computed total USD | 1,205,821.00 | 1,205,821.00 |
| Mismatches | 0 | 0 |
| Difference USD | 0.00 | 0.00 |

The new due-date report cannot run against the business database until its additive migration is deployed; no production aging numbers or browser/physical-print checks are claimed. Database fixtures demonstrate remaining payables 110.00 (70.00 due soon + 40.00 unscheduled) after 60.00 payment and 70.00 credit against 240.00 original debts; the reporting call leaves all source records unchanged.

## Deliberately left out / inherited blocker

No accounting allocation model, ledger rewrite, new payment history, current-FX conversion, due-date backfill, Business Settings control, production deployment, or main merge.

Prompt 07 remains incomplete: the SQL safety scanner rejects the return migration's replacement of `sales_order_stock_fulfillments_reversal_coherent_check` via `DROP CONSTRAINT`. This task does not authorize bypassing that scanner or changing the return migration. Phase 2 is not complete.
