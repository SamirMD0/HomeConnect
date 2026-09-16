# Partial-return cumulative rounding amendment

Date: 2026-09-14

Branch: `upgrade/phase-02-operations`; `main` remains at `ac6ae9f`.

## Implementation

The owner-approved amendment was written to `RETURN_DESIGN.md` before implementation.

The existing path remains route → validator → controller → `SalesReturnsService.create` → one `runFinancialTransaction` → repositories → database. This amendment changes only the snapshot valuation inside that transaction and loads prior persisted base allocations alongside prior transaction-currency allocations.

- Original gross and VAT are cumulatively allocated in currency minor units using deterministic half-up rounding.
- Subtotal is gross minus VAT, never independently rounded.
- The final quantity receives the exact original remainder.
- Base gross and VAT use the same cumulative allocation and USD precision; base subtotal is their difference.
- Existing sale lines store base ex-VAT subtotal but no separate base VAT/gross columns. Missing anchors use the full original VAT and original exchange-rate snapshots, not conversion of each partial return. Stored original base subtotal is preserved. No current price, rate, or tax configuration participates.
- Reprinting loads persisted return amounts; it does not perform allocation again.

Two $50 VAT-inclusive units at the original 11% snapshot:

| Snapshot | Subtotal | VAT | Gross |
|---|---:|---:|---:|
| Original | 90.09 | 9.91 | 100.00 |
| First unit | 45.04 | 4.96 | 50.00 |
| Final unit | 45.05 | 4.95 | 50.00 |
| Sum of returns | 90.09 | 9.91 | 100.00 |

Associated regressions corrected: installment-plan and customer-profile outstanding now subtract return credits without labeling them cash payments; statement rendering recognizes return entries; terminal-status guards compile with the extended enum.

## Tests-first evidence

- New allocation tests initially failed: 9 failed, 3 passed (new allocation function not implemented).
- After implementation: allocation suite 12 passed, 0 failed.
- Return database integration suite: 7 passed, 0 failed, 0 skipped, including USD first/final returns and LBP sequences `[1,1,1]`, `[2,1]`, `[1,2]`.
- Return-credit summary regressions initially failed: 2 failed, 17 passed; corrected targeted run (including allocation suite): 31 passed, 0 failed.
- Coverage includes USD/LBP precision, three or more partial requests, quantities greater than one, mixed request order, interleaved original lines, base allocation, per-entry component identities, final cumulative reconciliation, persisted document reprint, existing rollback/idempotency/inventory tests.

## Validation

- `npm run typecheck`: passed, frontend and backend.
- `npm run lint`: passed; 0 errors, 66 existing warnings.
- Full `npm run test:ci`, fresh process after code changes: **1 failed file, 288 passed files (289); 1 failed test, 2,342 passed tests (2,343); 0 skipped; 164.88 seconds; exit code 1**. The only failure is the separate migration safety blocker below. All cumulative allocation and return-credit regression tests pass in this full run. The earlier run started before the last regression fixes and reported 3 failures; it is superseded by this fresh-process result.
- Isolated stock ledger reconciliation summary: total products 0 after fixture cleanup, mismatches 0.
- Isolated receiving reconciliation: count 0, mismatches 0.
- Return fixtures independently reconciled stock before cleanup; the empty post-cleanup reports are not production-data evidence.

## Separate safety blocker

The in-progress return migration replaces `sales_order_stock_fulfillments_reversal_coherent_check` with a check that no longer requires a singular legacy cancellation movement for a reversed fulfillment. This accommodates multiple/condition return lines, but the existing SQL safety scanner rejects the `DROP CONSTRAINT` clause. The scanner has not been weakened and the migration has not been edited during this amendment. A reviewed return-aware database integrity design is needed before accepting this replacement. Prompt 07 is not complete.

## Schema/deployment disclosure for this amendment

Migration required: No additional migration for cumulative allocation.

Backward compatible: Yes; existing endpoint/input shapes and stored sale snapshots are unchanged by the rounding amendment.

Existing data impact: No business-database writes, backfill, or historical repricing. Tests used only `homeconnect_test_phase4_phase5_phase6`.

Rollback strategy: Revert the amendment only before posting returns that rely on it; do not restore the known-broken independent rounding behavior over newly posted financial history.

Backup required: No production operation performed; the full return schema deployment retains the approved verified-backup requirement.

Validation check: Targeted invariants, database tests, full suite, typecheck, lint, and isolated inventory reconciliation as recorded above.

No main merge, production migration, scanner bypass, or completed-feature commit is claimed.
