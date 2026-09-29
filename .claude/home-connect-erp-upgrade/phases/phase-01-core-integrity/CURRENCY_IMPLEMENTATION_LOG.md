# Currency implementation log

Date: 2026-09-01  
Branch: `upgrade/phase-01-core-integrity`  
Starting commit: `1fce2dd`

## Approved rounding rule

- USD input amounts retain the existing maximum of two decimal places.
- LBP input amounts must be whole numbers.
- Computed fractional LBP amounts round to zero decimal places using
  `ROUND_HALF_UP`; there is no nearest-1,000 denomination rounding.

## Before-migration integrity snapshot

The three reports were run read-only against the production database before
any currency DDL or data migration.

| Report | Duration | Rows | Mismatches | Reported total | Independent total | Difference |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Inventory reconciliation | 1,244 ms | 0 | 0 | n/a | n/a | n/a |
| Customer financial integrity | 789 ms | 105 | 0 | USD 21,714.00 | USD 21,714.00 | USD 0.00 |
| Supplier financial integrity | 343 ms | 3 | 0 | USD 1,205,821.00 | USD 1,205,821.00 | USD 0.00 |

This snapshot is the Step 7 comparison control. Any customer or supplier total
change after the restored-copy migration is a blocker.

## Step 3 balance invariant checkpoint

`balances.ts` was not changed. After adding the allocation-side schema fields
and the currency-aware money primitives, the existing financial domain suites
were run immediately:

```text
Test Files  3 passed (3)
Tests       27 passed (27)
```

The backend typecheck also passed at this checkpoint.

## Fresh verified backup

A fresh `PRE_REPAIR` production backup was taken before rehearsing any DDL:

| Field | Result |
| --- | --- |
| Backup ID | `1c0a417e-16eb-474e-8339-3d73ba29bfdc` |
| File | `homeconnect-2026-09-02-184207-pre-repair.backup` |
| Size | 218,453 bytes |
| SHA-256 | `cbaf1598196ed197aff9ca2d9907f79fb86d5fac82704790194b05874d168d1d` |
| Backup duration | 18,611 ms |
| Checksum recorded | yes |
| `pg_restore --list` readable | yes |

Production was not migrated. The verified archive was restored into the
isolated `homeconnect_phase17_rehearsal_20260902` database in 3,231 ms.

## Restored-copy migration rehearsal

`npm run rehearse:migrations` ran against that restored production copy. The
runner explicitly reported that the `homeconnect` business database would not
be touched.

| Migration | Statements | Duration | Result |
| --- | ---: | ---: | --- |
| `20260827090000_add_supplier_idempotency` | 5 | 491 ms | applied |
| `20260830183000_remove_legacy_transactions` | 4 | 12 ms | applied |
| `20260901090000_add_dual_currency_foundation` | 39 | 150 ms | applied |

After application: `pending=0 failed=0 mismatched=0`. The rehearsal then
simulated an interrupted currency migration; the runner detected it as failed.
The expected idempotency re-run failed in 75 ms, and the scratch-only detection
phase passed. Overall result: `REHEARSAL PASSED`.

## After-migration integrity snapshot

All reports below ran read-only against the migrated restored copy.

| Report | Duration | Rows | Mismatches | Reported total | Independent total | Difference |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Inventory reconciliation | 603 ms | 0 | 0 | n/a | n/a | n/a |
| Customer financial integrity | 291 ms | 105 | 0 | USD 21,714.00 | USD 21,714.00 | USD 0.00 |
| Supplier financial integrity | 282 ms | 3 | 0 | USD 1,205,821.00 | USD 1,205,821.00 | USD 0.00 |

Customer and supplier totals are identical before and after. The additive USD
backfill is value-neutral; there is no balance blocker.

## Currency DB invariants

The new combined DB integration case for INV-16, INV-17, INV-18, INV-19, and
INV-25 passed against the migrated restored copy:

```text
Test Files  1 passed (1)
Tests       1 passed | 1 skipped (2)
```

The skipped case in that filtered invocation was the file's older financial
constraint test. When the entire file was run, that older test failed because
the restored production schema accepted a `PaymentAllocation` with neither a
debt nor installment target. This shows that
`payment_allocations_target_xor_check` is absent from production even though
`20260724090000_add_financial_domain_models` is recorded as applied. The
Prompt 17 implementation did not repair that unrelated production drift or
weaken the test; it is reported as a finding under the standing rule.

## Full database suite

A clean throwaway database named
`homeconnect_test_phase4_phase5_phase6_currency_20260902` was created, all 34
migrations were deployed successfully, and `npm run test:ci` ran every suite
with zero skipped files or tests.

```text
Test Files  2 failed | 270 passed (272)
Tests       2 failed | 2239 passed (2241)
```

The new currency invariant test passed. The two failures are reported without
fixes, as required by the standing rule:

1. `backend/src/features/inventory/inventory-onboarding-db.integration.test.ts`
   — `batch inventory onboarding database contract > paginates the worklist,
   writes 100 rows atomically, preserves skips, and prevents concurrent
   duplicates`: PostgreSQL/Prisma reported `Transaction failed due to a write
   conflict or a deadlock. Please retry your transaction` at
   `inventory.repository.ts:195`.
2. `backend/src/features/financial/installment-plans/installment-plans-db.integration.test.ts`
   — `installment plan database flow > creates a plan, allocates payments
   oldest-first, enforces idempotency, and cancels eligible plans`: expected
   the second fixed-August-2026 installment status to be `PARTIALLY_PAID`, but
   received `OVERDUE` when the suite ran on 2026-09-02.

These failures are not caused by an INV-16/17/18/19/25 assertion and were not
changed as part of Prompt 17.
