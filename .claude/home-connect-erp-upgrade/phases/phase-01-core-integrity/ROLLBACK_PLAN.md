# Phase 1 Release Rollback Plan

Date: 2026-09-04

## Preconditions

- Stop business writes and keep the application unavailable during rollback.
- Record the deployed application commit and migration status.
- Verify the immediately pre-deployment backup by SHA-256 and `pg_restore --list` before deployment begins.
- Keep that backup off the business PC as required by `OFF_MACHINE_BACKUP_EVIDENCE.md`.

## Decision path

1. If the failure is application-only and no Phase 1 migration needs reversal, deploy the last accepted application build and validate all three integrity reports.
2. If rollback crosses the destructive T9 migration, do not attempt a down-migration. Restore the verified pre-deployment backup into a fresh database, validate it, then deliberately switch the application to that restored database.
3. If rollback concerns only additive migrations, prefer an application rollback that leaves compatible additive columns in place. Remove additive schema only during a separately reviewed maintenance window.

## Migration-specific strategy

### T7 — `20260827090000_add_supplier_idempotency`

- Additive nullable columns and unique indexes.
- Existing clients without keys remain compatible.
- Preferred rollback: roll back the application and leave columns/indexes in place.
- Optional reviewed schema rollback: drop the two unique indexes, then the two nullable `idempotencyKey` columns.
- Validation: duplicate-submission tests, one payable/one stock increase on replay, and no unique `(supplierId, receiptNumber)` constraint.

### T9 — `20260830183000_remove_legacy_transactions`

- Destructive: drops `transactions` and its legacy enum types. `activity_logs` is intentionally retained.
- **NOT reversible by down-migration.** A down-migration cannot recreate deleted rows or prove their contents.
- Rollback is a restore of the verified backup taken immediately before deployment, following `RESTORE_RUNBOOK.md`.
- Pre-deployment validation: `SELECT COUNT(*) FROM transactions;` must return `0`, as recorded in `LEGACY_TRANSACTIONS_AUDIT.md`; stop if it does not.
- Post-deployment validation: `/api/v1/transactions` returns 404 and customer/dashboard current paths remain healthy.

### T13 — `20260901090000_add_dual_currency_foundation`

- Additive currency, exchange-rate, and base-amount fields with a USD/rate-1 backfill.
- Preferred rollback: previous application build while leaving compatible columns in place.
- Reviewed schema rollback may drop added columns and `exchange_rates`; original amount columns remain intact.
- Validation: pre/post totals match and customer, supplier, and stock integrity reports are clean.
- Production record anomaly: live `_prisma_migrations` showed this migration applied at `2026-09-04T12:40:52.176Z` before its local migration directory was committed.

### T14 — `20260903120000_add_vat_foundation`

- Additive tax tables and line snapshot columns. Existing lines are backfilled as genuine no-VAT history.
- Preferred rollback: previous application build while leaving compatible columns in place.
- Reviewed schema rollback may drop VAT snapshot/product-profile columns, then `tax_profiles` and `tax_rates`.
- Validation: every historical document total remains unchanged and each inclusive total equals ex-VAT total plus VAT.
- Production record anomaly: live `_prisma_migrations` showed this migration applied at `2026-09-04T12:40:52.940Z` before its local migration directory was committed.

## Recovery validation

Do not reopen trading until:

- application startup and login succeed;
- inventory mismatch count is zero;
- customer and supplier financial integrity mismatch counts are zero;
- five customer and five supplier balances have been spot-checked;
- the owner accepts the recovered cutoff and any transactions that must be re-entered.

Restore rehearsal and duration remain **NOT YET PERFORMED — BLOCKED ON OWNER**.

