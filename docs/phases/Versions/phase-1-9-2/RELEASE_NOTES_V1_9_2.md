# HomeConnect v1.9.2 — Product Search and Supplier Workflow Bridge

## What this release adds

v1.9.2 removes the 100-product selection ceiling from sales orders and supplier receiving. Both
workflows now use a shared bilingual product picker that sends debounced search terms to the
existing product API and searches by name, model, SKU, or barcode.

It also adds a deliberate bridge from an immutable supplier receiving document to the existing
supplier transaction form. An administrator can start recording supplier debt from a receiving
document, while the amount remains blank for the administrator to enter.

## Searchable product picker

- Sales-order and supplier-receiving product selection now requests a small server-filtered page
  instead of loading one capped page of 100 products into a native select.
- Results show product identity and stock quantity where stock is tracked.
- Loading, empty-result, request-error, retry, selected-product, and clear states are explicit.
- Sales orders retain their existing suggested-price behavior when a catalog product is selected.
- The existing service-job picker retains manual entry and quick catalog creation.

Supplier receiving keeps the opening-count boundary visible. Untracked products and tracked
products without a verified opening count appear in search results but cannot be selected; the
picker explains why. The backend remains authoritative when the receiving document is submitted.

## Receiving to supplier debt bridge

An active supplier receiving document now offers **Record supplier debt / تسجيل دين للمورد** when
viewed by an administrator and linked to an active supplier. The action opens that supplier's
existing transaction form with:

- transaction type set to supplier debt;
- receiving date copied to the transaction date;
- receiving reference and a readable description copied into the form;
- amount deliberately left blank.

The bridge is navigation and form defaults only. It does not automatically create a supplier
transaction, infer an amount, change a supplier balance, create a stock movement, or add a
database link between the two records. Employees cannot use the bridge. Route state is cleared
after opening so refresh or back navigation does not reopen the form.

Supplier transaction references now accept up to 200 characters, matching supplier receiving
references. Both database columns are already unrestricted text, so no migration is required.

## Unchanged boundaries

- Supplier receiving remains an inventory fact and still creates no financial transaction.
- Supplier debt remains an admin-only financial action and creates no stock movement.
- Customer debts, payments, sales-order financial logic, inventory movement rules, scanner
  payloads, WhatsApp, valuation, COGS, and the Financial Truth Foundation are unchanged.
- Quick product creation inside receiving remains deferred because new products still require the
  existing administrator-verified opening-count workflow.

## Validation

- Frontend, backend, and Electron typechecks passed.
- Prisma schema validation passed.
- Full test suite passed: 1,533 tests passed and 8 skipped.
- Lint completed with 0 errors; existing repository warnings remain outside this release scope.
- No schema or migration change is included in v1.9.2.
