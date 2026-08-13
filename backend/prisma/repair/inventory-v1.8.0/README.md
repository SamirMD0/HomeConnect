# Inventory v1.8.0 — helper SQL

**These are helper scripts, not applied repair history.**

Everything else in `backend/prisma/repair/` is a repair that was actually run against a
business PC, indexed by `manifest.json`. **These three files are deliberately NOT in that
manifest**, and must not be added to it unless and until one of them is genuinely applied to
the business database. Two of the three cannot ever qualify — they only read.

## The files

| File | Purpose | Writes data? | Safe to run on the business PC? |
|---|---|---|---|
| `01_inventory_preflight_report.sql` | Reports the current state of product stock data before any inventory work. | **No** — `SELECT` only. | Yes, any time, as often as you like. |
| `02_inventory_opening_balance_template.sql` | Template for applying **verified** opening balances to explicitly listed products. | Yes, but only to products you list. Ships with an empty list. | **Not yet.** See below. |
| `03_inventory_reconciliation_check.sql` | Proves `products.stockQuantity` and the `stock_movements` ledger agree. | **No** — `SELECT` only. | Yes, but only after the v1.8.0 migration exists. |

## Which script runs when

```
                          BEFORE migration        AFTER migration
  01 preflight report           yes                     yes
  02 opening balance             no  (no table)         yes, on verified products only
  03 reconciliation              no  (no table)         yes
```

Script `01` is safe before the migration by design. An earlier draft ended with an
onboarding-progress section that queried `stock_movements`, which made it fail with
*relation "stock_movements" does not exist* on exactly the runs it was written for. That
section now lives in `03` as section `S1b`, and `01` touches only `products`.

## There is no automatic backfill, on purpose

The existing `products.stockQuantity` values are **not verified business data**. They were
entered through an absolute-overwrite screen with no history, and nobody has counted the
shelves against them.

Copying those numbers into `OPENING_BALANCE` movements would dress unverified data as an
audited ledger entry — signed, timestamped, and far more convincing than the loose number it
came from. That is worse than leaving the number alone, because the next person would believe
it.

**The physical count is the truth.** The old `stockQuantity` is a hint about which products to
go and count.

The v1.8.0 Prisma migration is therefore **schema-only**: it creates the table, enum,
relations and indexes, and inserts zero movements and modifies zero product rows.

## What "verified" means

A product may be added to the list in `02` only when all five are confirmed:

1. product name confirmed as the real product
2. SKU / barcode confirmed, or confirmed as intentionally blank
3. active / archived status confirmed
4. `trackStock` decision confirmed
5. **physical count confirmed by someone who counted the units**

## Normal onboarding: use the app

For ordinary product onboarding, an administrator uses **Verify Opening Count / تأكيد الجرد الافتتاحي** in HomeConnect. The app verifies the account password and creates the one opening movement while updating the product in a single transaction.

`02_inventory_opening_balance_template.sql` is not an operator workflow. It exists only for a planned, reviewed **controlled bulk-onboarding** batch after physical counts have been collected and checked.

## How to use the controlled bulk helper safely

1. Take a verified database backup. Restore it somewhere to prove the backup works.
2. Run `01` and read every section.
3. Resolve the flagged rows with the business — especially `trackStock = false` products that
   still carry a quantity, and anything over 1000 units.
4. Apply the v1.8.0 migration (local/dev first, then a restored copy, then production).
5. Run `03`. Expect `mismatch = 0` and a large `pending_onboarding` count. **That is correct**
   — nothing has been counted yet.
6. For normal daily work, stop here and use Verify Opening Count in the app.
7. Only for an approved controlled bulk batch: count a small batch physically, fill in `02`, and run it. It ends in `ROLLBACK`, so the first run saves nothing and
   only shows what it would do. Read the verification output, then change `ROLLBACK` to
   `COMMIT` and run it again.
8. Run `03` again. The batch should move from `pending_onboarding` to `ok`.
9. Repeat from step 6 in small batches. A batch you can check by eye is a batch you can undo
   by hand.

## Reading the reconciliation output

Four outcomes:

- **NOT_IN_INVENTORY** — untracked, zero quantity, and no movements. Normal catalogue data;
  it is not part of the onboarding queue.
- **PENDING_ONBOARDING** — tracked or carrying a quantity, but no opening balance. **Expected,
  not a failure.** Physically count it, then use Verify Opening Count in the app.
- **OK** — has an opening balance, no broken movement arithmetic, and the ledger sum equals
  `stockQuantity`.
- **MISMATCH** — has movement activity without an opening balance, broken movement arithmetic,
  or a ledger sum that differs from `stockQuantity`. This is a real defect.

If un-onboarded products were reported as failures, everyone would learn to ignore this check,
and it would be useless on the day it finally mattered.

## Hard rules

- Never use `02` for ordinary onboarding. Never run it against the real business database until
  its controlled batch has been physically counted and rehearsed on a restored copy.
- Never remove the idempotency guard in `02`. A product must have at most one
  `OPENING_BALANCE`.
- Never let the app auto-create an opening balance from an existing `stockQuantity`. That is
  the rejected backfill, merely deferred. A product with no opening balance must refuse stock
  actions instead.
- These scripts never touch customers, debts, payments, installments, suppliers, sales orders,
  service jobs, or any financial table. Keep it that way.
- No `DROP`, no `TRUNCATE`, no `DELETE`, no `prisma migrate reset`.

## Note on IDE warnings

These are **PostgreSQL** scripts. An editor configured for T-SQL / SQL Server will flag valid
Postgres syntax as errors — `COUNT(*) FILTER (WHERE …)`, `array_agg(… ORDER BY …)`,
`::regclass`, and `gen_random_uuid()` are all correct here. Verify against PostgreSQL, not
against the editor's default dialect.

## Status

The migration, onboarding behavior, and reconciliation workflow were reviewed and accepted
through CP-INV9B, including isolated zero/nonzero opening-count acceptance. CP-INV10A corrected
the controlled-bulk rerun guard and the four-state SQL classifier. Before the real release,
run these corrected helper versions against a newly restored business-PC copy; never treat the
earlier rehearsal as proof of files changed afterward.

## Copies

A duplicate set lives in `release/1.8.0/` for packaging convenience. **That directory is
gitignored** (`.gitignore:4`), so this directory is the authoritative, version-controlled copy.
If you edit one, edit both — or delete the release copy and copy it fresh at release time.

Do not add these helpers to `backend/prisma/repair/manifest.json` unless a helper is actually
applied to the business PC. The manifest records applied repairs, not packaged reports/templates.
