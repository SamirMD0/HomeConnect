# HomeConnect v1.9.0 — Sales-Order Inventory Movements

## What this release adds

v1.9.0 connects sales orders to the inventory ledger. An administrator or employee can explicitly
deduct the stored quantity of selected catalogue lines from an eligible sales order. An
administrator can explicitly restore an active deduction with a typed reason.

Nothing happens automatically when an order is created, confirmed, delivered, cancelled, paid,
or linked to a debt. Product and quantity always come from the stored order line, never from the
browser request.

## Safety rules

- A product must track stock and have a verified opening count.
- Orders predating that opening count cannot be deducted, preventing historical sales from being
  counted twice.
- Draft, cancelled, and returned orders cannot deduct stock; delivered orders remain eligible.
- A line can have only one active deduction, enforced by PostgreSQL.
- Multi-line requests are all-or-nothing, including repeated lines for the same product.
- A deducted line cannot be edited or removed until its stock is restored.
- An order with active deductions cannot be cancelled or returned until restoration.

## Permissions and audit

Deduction is ordinary document-linked work: ADMIN and EMPLOYEE roles may perform it without an
account password. The server generates the movement reason from the sales-order number.

Restoration is ADMIN-only, requires a typed reason, and does not require an account password.
Both directions write immutable stock movements and attributed sales-audit entries.

The existing password rules for verified opening counts, manual removal, stock-count correction,
and damage/loss remain unchanged.

## Dashboard and history

The inventory dashboard shows orders awaiting stock deduction and links to the matching filtered
sales-order list. Sale deduction and restoration rows in movement history link to their source
sales order through the fulfillment record.

## Data and financial boundaries

The migration is additive and performs no backfill. Existing products, quantities, orders,
customers, debts, payments, installments, suppliers, and supplier transactions are not changed.
Stock actions do not create or edit customer or supplier ledger entries, payment records, debt
records, settlement state, COGS, valuation, FIFO, profit, or margin.

Supplier receiving is not included. It remains planned separately for v1.9.1.

## Upgrade gate

Before installing on the business PC, apply the migration to a locally restored business backup,
verify protected row counts and product fingerprints, and run both the v1.8.0 stock-integrity
report and the v1.9.0 fulfillment reconciliation report. The application version remains 1.8.1
until final release approval.

The release-gate rehearsal passed on 2026-08-13 against a locally restored business-PC backup:
all protected row counts and the product inventory fingerprint were unchanged, the new tables
remained empty, and both reconciliation reports returned zero faults. No business-PC database was
touched. Version bumping and packaging still require separate approval.

The CP-1908 review additionally verified and corrected the Beirut-midnight conversion used by the
dashboard awaiting-deduction count. The packaged app can start on the pre-migration schema so
Maintenance can create its required safety backup; during that pending-update window the inventory
summary degrades safely instead of querying the not-yet-created fulfillment table.

Inventory and product-linked workflows also accept legacy product UUIDs already stored by older
HomeConnect imports. Validation remains restricted to canonical PostgreSQL UUID text; no product
IDs or business rows are rewritten.
