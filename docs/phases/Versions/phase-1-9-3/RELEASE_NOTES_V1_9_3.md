# HomeConnect v1.9.3 — Scanner Product Preview and Receiving-Debt Links

## What this release adds

v1.9.3 gives a desk barcode or SKU scan an authenticated product preview with image, current
selling price, stock status, product identity, and clear archived or code-collision warnings. The
preview can open the product or start the existing sales-order wizard with that product selected.

This release also completes the explicit link between a supplier receiving document and the
supplier debt a manager records for it. The link is informational: receiving stock still creates
no debt, and recording supplier debt still creates no stock movement.

## Scanner preview and sales-order prefill

- Only scans entered on the Scanner Hub open the preview. Phone scans continue to update recent
  scans without taking over the desk screen.
- The shared scan response remains limited to product identity. Price, image, and stock are fetched
  separately through authenticated product APIs and are not exposed to paired phones.
- Out-of-stock products show a warning but may still start an order. Archived products cannot.
- **Make Order / إنشاء طلب** passes only the product ID through route state. The order dialog
  re-fetches the product and uses the existing shared suggested-price rule.
- Prefill sets only product, quantity one, and suggested unit price. Customer, payment mode,
  channel, delivery, fulfilment, and debt fields remain for the operator to choose.
- Route state is removed after opening, so refresh or back navigation cannot replay the dialog.

## Supplier receiving and debt link

- A supplier debt may optionally reference one supplier receiving document.
- Only `SUPPLIER_DEBT` transactions may carry the link, and one receiving document may be linked
  to at most one transaction.
- A composite database foreign key prevents a receiving document from being linked to another
  supplier's transaction.
- Existing receiving documents and supplier transactions are not backfilled or modified.
- Supplier balances continue to use transaction direction and amount only; the receiving link is
  never part of a balance or summary calculation.
- The receiving detail shows the linked debt instead of offering a duplicate recording action.

## Smaller workflow improvements

- Product inventory eligibility reads are cached briefly to avoid repeated requests while choosing
  receiving lines.
- Supplier receiving now uses a bilingual server-searched supplier picker instead of silently
  limiting the dropdown to the first 100 suppliers.

## Database migration

The release includes additive migration
`20260814170000_link_supplier_transactions_to_receivings`: one nullable UUID column, a type check,
two unique indexes, and a restrictive composite foreign key. It contains no backfill and no data
write statement.

The earlier additive supplier-receiving migration
`20260814110000_add_supplier_receivings` is also bundled for business PCs that have not yet
installed v1.9.1.

## Restored-backup rehearsal and deployment gate

The two pending migrations were applied together, in order, to local scratch database
`homeconnect_rehearsal_v193`, cloned from the retained restored business-PC backup. The real
business PC and the development database were not used as rehearsal targets.

- Applied migrations: 27 → 29; only the two expected migrations ran.
- Protected counts stayed unchanged: 90 products, 167 customers, 124 debts, 112 payments,
  7 suppliers, and 37 supplier transactions.
- Product fingerprint stayed `41603e74a80259919afc16d3db05ade9`.
- Supplier-balance fingerprint stayed `342f60180c65189135e079d6662e124f`.
- The new receiving tables remained empty and all 11 receiving reconciliation checks returned
  zero findings.
- A cross-supplier link was rejected by PostgreSQL's composite foreign key and the probe transaction
  was rolled back.

This clears the restored-backup rehearsal gate for these two migrations. Before installation on
the business PC, close HomeConnect and take a fresh verified backup. The installer may then apply
the pending migrations through the normal Maintenance workflow; do not paste migration SQL into
the live database manually.

## Unchanged boundaries

- Scanner lookup and the paired-phone LAN payload are unchanged.
- No scanner action directly writes an order, stock movement, debt, payment, or supplier transaction.
- Sales-order validation, totals, customer debt creation, and stock deduction remain on their
  existing backend paths.
- Supplier receiving never infers a debt amount and never posts a financial transaction automatically.
- Customer debts, payments, WhatsApp, valuation, COGS, Financial Truth Foundation, and Mobile
  Scanner package scope are unchanged.

## Validation

- Backend, frontend, and Electron typechecks passed.
- Prisma schema validation passed.
- Full automated suite passed: 1,555 tests passed and 8 intentionally gated tests skipped across
  213 test files.
- Lint completed with 0 errors; 88 pre-existing warnings remain outside this release scope.
- Installer build and artifact verification completed before the release commit.
