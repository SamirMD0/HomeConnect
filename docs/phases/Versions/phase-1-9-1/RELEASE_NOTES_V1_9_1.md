# HomeConnect v1.9.1 — Supplier Receiving

## What this release adds

v1.8.0 made the stock number trustworthy. v1.9.0 connected it to the document that takes goods
**out** — the sales order. v1.9.1 connects the document that puts goods **in**.

An administrator or employee records what physically arrived from a supplier and presses
**Receive Stock / إدخال إلى المخزون**. The inventory ledger gains one `PURCHASE_RECEIPT` movement
per line, and each product's stored quantity rises in the same transaction.

The receiving document may name a supplier, but it does not touch the supplier ledger: no payable,
no balance change, no transaction row. Receiving goods and owing money for them are two separate
facts, recorded on two separate screens, by two separate deliberate acts. The receiving form says
so in both languages.

## The receiving document

A receiving document has an optional supplier, an optional invoice or reference number, a
received-on date, an optional note, and one or more product lines. It is created whole or not at
all, and it is immutable once posted.

- The supplier is optional, because cash purchases and walk-in restocks are real.
- The reference number is optional and is never treated as unique — suppliers reuse and omit
  invoice numbers, and a uniqueness rule would block a legitimate second delivery.
- A product may appear only once per document, enforced by PostgreSQL as well as by validation.
- Up to 100 lines per document; each quantity is a whole number from 1 to 100,000.

## Safety rules

- A product must track stock and have a verified opening count before it can receive stock.
  Receiving never onboards a product; onboarding stays an admin-verified physical count.
- A receiving date earlier than a product's verified opening count is rejected, so stock already
  captured by that count is never added twice.
- Future receiving dates are rejected.
- Archived suppliers cannot receive stock.
- Each line's quantity change is applied with a compare-and-set on the stored quantity, so a
  concurrent stock change fails the whole document cleanly rather than writing a wrong total.
- Every projected result is proved to fit the PostgreSQL integer ceiling before the first write.
- A stock movement can back at most one receiving line, enforced by a unique constraint.

## Permissions and audit

Creating and viewing a receiving document is available to ADMIN and EMPLOYEE roles without an
account password. This matches manual stock addition in v1.8.0 and sales-order deduction in
v1.9.0: receiving is ordinary work that increases stock, and the append-only movement ledger is
the control.

Note the deliberate asymmetry: every supplier *transaction* write remains ADMIN-only. An employee
who can receive goods cannot record what the shop owes for them. That is correct — one is
inventory, the other is finance.

The server generates each movement reason from the supplier name and reference number. The client
never supplies it.

## History and navigation

- **Inventory → Receiving history** lists every receiving document.
- **Inventory → Receive Stock** opens the entry form, which warns — without blocking — when a
  document already exists for the same supplier and reference number.
- A receiving document view shows its lines and links to each stock movement.
- Movement history labels `PURCHASE_RECEIPT` rows as **Supplier Receipt / إدخال من مورد** and
  links them back to their receiving document through the receiving-item relation.
- A supplier profile shows a read-only receiving history for that supplier.

## Supplier deletion

A supplier that has receiving documents can no longer be hard-deleted. The attempt returns HTTP
409 with code `SUPPLIER_HAS_RECEIVINGS` and explains that the supplier can only be archived. This
is checked before the existing transaction check, so a supplier with both gets the receiving
message first. Archiving is unchanged.

## Correcting a mistake

A posted receiving document has no edit, delete, or reversal endpoint in v1.9.1.

A mistake is corrected the way v1.8.0 already prescribes: a compensating manual movement with a
typed reason — `DAMAGE_LOSS` for goods that arrived unsellable, `MANUAL_REMOVE` or `STOCK_COUNT`
for a miscounted receipt. Those keep their ADMIN and account-password guard, which is the right
level of scrutiny for undoing a recorded fact.

Unlike a sales deduction, an incorrect receipt blocks nothing downstream, so refusing reversal
creates no deadlock. Reversal remains deferred.

## Data and financial boundaries

The migration is additive and performs no backfill. It creates two tables, their indexes, and
their foreign keys. It alters no existing table, changes no enum, and writes no rows. Existing
products, quantities, stock movements, orders, customers, debts, payments, installments,
suppliers, and supplier transactions are not changed. The migration deliberately creates no
receiving history.

`PURCHASE_RECEIPT` already exists in the `StockMovementType` enum from v1.8.0, so no enum change
is required.

Receiving does not create, edit, or delete supplier transactions, supplier balances, customer
debts, payments, payment allocations, installment plans, or sales orders. It does not create
supplier debt automatically, and supplier debt does not create stock. No COGS, valuation, FIFO,
weighted average, margin, or profit is computed anywhere in this release; `Product.costPrice` is
never multiplied by a received quantity.

Scanner behaviour, sales-order behaviour, and the customer ledger are unchanged.

## Pending-update window

As in v1.9.0, the packaged app must be able to start on the pre-migration schema so Maintenance
can take its safety backup before applying pending migrations. During that window the inventory
dashboard and movement history detect that the receiving tables do not yet exist and degrade
safely, omitting the receiving links instead of failing the query.

## Upgrade gate

Before installing on the business PC, apply the migration to a locally restored business backup,
verify protected row counts and product fingerprints, and run the v1.8.0 stock-integrity report
and the v1.9.0 fulfillment reconciliation report.

The application version remains 1.9.0 until final release approval. Version bumping, packaging,
and installer creation require separate approval.

### Preflight status (CP-1918, 2026-08-14)

Completed on the development laptop, with no business-PC database access:

- Prisma schema validates; client generates.
- Backend and frontend typechecks pass.
- Full suite: 1525 passed, 8 skipped, 0 failed.
- Lint: 0 errors; no warnings in any v1.9.1 file.
- Migration safety scan: no `DROP`, `TRUNCATE`, `DELETE`, `UPDATE`, `INSERT`, or `ALTER TYPE`;
  all five `ALTER TABLE` statements add foreign keys to the two new tables only.
- Scratch migration rehearsal on a freshly created disposable database: all 28 bundled migrations
  applied cleanly, and a simulated half-applied v1.9.1 migration was correctly detected.
- Database constraint contract verified against the same scratch database: quantity checks,
  both unique indexes, and restrictive foreign keys all behave as specified, and duplicate
  reference numbers remain permitted.

### Report-only SQL (CP-1918B, 2026-08-14)

`backend/prisma/repair/inventory-v1.9.1/` now carries the preflight and reconciliation reports for
this release, matching the folders shipped for v1.8.0 and v1.9.0. Both are `SELECT`-only and are
not registered in `manifest.json`. Sections A and B of the preflight run on a pre-upgrade backup;
the remaining sections require the migration.

Both files were executed end to end against a disposable scratch database and were then proved to
detect faults, not merely to run, by seeding a healthy receiving document alongside a backdated
document, a duplicate supplier/reference pair, an orphan `PURCHASE_RECEIPT` movement, and an
inconsistent product ledger. Each expected check fired; the seeded data was then removed.

Outstanding before release: the release-gate rehearsal against a locally restored business-PC
backup.
