# Inventory v1.9.4 — Supplier purchase report-only SQL

**These are report-only helper scripts, not applied repair history.**

Everything else in `backend/prisma/repair/` that appears in `manifest.json` is a repair that was
actually run against a business PC. **The two files here are deliberately NOT in that manifest**,
and can never qualify: they only read. This matches the `inventory-v1.8.0/`, `inventory-v1.9.0/`,
and `inventory-v1.9.1/` folders.

## The files

| File | Purpose | Writes data? | Needs the v1.9.4 objects? |
|---|---|---|---|
| `01_supplier_purchase_preflight_report.sql` | Is this database safe to carry v1.9.4, and did the migration land correctly? | **No** — `SELECT` / `WITH` only. | Sections A and B: no. Section C: yes. |
| `02_supplier_purchase_reconciliation_report.sql` | Do purchase lines, the posted debt, the receiving document, and stock all agree? | **No** — `SELECT` / `WITH` only. | Yes. |

Neither file contains `INSERT`, `UPDATE`, `DELETE`, `DROP`, `TRUNCATE`, `ALTER`, or `CREATE`.
There is no backfill, no data repair, and no migration execution.

## Where to run them

**On a restored backup or a scratch database. Never as a rehearsal against the live business
database.** Restore a backup, prove the restore works, and run these against that copy.

## Which script runs when

```
                                    BEFORE v1.9.4 migration     AFTER v1.9.4 migration
  01 sections A + B                          yes                        yes
  01 section C                               no  (no table)             yes
  02 reconciliation                          no  (no table)             yes
```

Sections A and B of file `01` reach the new objects only through the system catalog, so the useful
half of the preflight still runs on a v1.9.3 backup. Section A answers "has the migration run",
section B answers "is the v1.9.1 receiving ground it builds on sound".

## What the migration does

One new table (`supplier_purchase_lines`), one new enum (`SupplierPurchaseLineKind`), and three
new columns on `supplier_transactions` (`receiptNumber`, `amountOverride`, `amountOverrideReason`).

Every added column is nullable or defaulted, so **no backfill is required and no existing row is
rewritten**. The migration creates no purchase, no receiving document, no stock movement, and no
ledger entry. A v1.9.3 database that upgrades cleanly should report zero findings on both files.

## Expected result on a freshly migrated backup

Every fault count is `0` and every detail section returns zero rows.
