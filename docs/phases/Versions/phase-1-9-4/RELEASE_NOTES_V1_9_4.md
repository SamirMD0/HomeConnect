# HomeConnect v1.9.4 — Supplier Purchases and a Visible Scanner Preview

## What this release adds

v1.9.4 turns recording a supplier invoice into one action. A purchase now carries priced lines —
existing products, quick-added products, or plain description items — and posting it writes the
stock receipt and the supplier debt together in a single database transaction.

It also completes the Scanner Hub work started in v1.9.3, where the product preview existed only as
a dialog that appeared after a successful scan and left the page looking unchanged.

## Supplier purchase workflow

- **Add Purchase / إضافة فاتورة** on a supplier's profile opens one form: receipt number, purchase
  date, and any number of priced lines.
- Three line modes. An **existing product** is chosen with the shared product picker; a **quick-add
  product** is created inline; a **description-only** line records money with no product at all.
- The debt amount is the sum of the line totals. It may be set by hand for freight, rounding, or a
  supplier discount, which requires a typed reason and keeps the line sum on record.
- The ledger description is written from the lines, the total, and the receipt number, as a
  bilingual sentence on two lines. It stays editable, and a control restores the suggestion.
- Receipt numbers are deliberately **not** unique. Re-using one raises a dismissible warning showing
  the earlier purchase, because suppliers really do re-issue numbers.
- The last recorded cost is offered as the unit price when a product has one. It is a suggestion
  only: `costPrice` is never written back, and the selling price is never used as a cost.

## One writer per side

The purchase command orchestrates the two engines that already existed; it does not reimplement
either one.

- Stock is written only by the v1.9.1 receiving logic, which keeps its opening-count guard, its
  compare-and-set quantity update, and its movement audit. That logic was extracted so both the
  standalone receiving route and a purchase enter through the same function.
- The supplier ledger is written only by the supplier transaction repository.
- Both halves commit in one transaction. A failure in either rolls the whole purchase back.
- A purchase made entirely of description lines creates no receiving document at all.
- Unchecking **Add these products to inventory now** records a priced debt with no stock movement,
  for goods that have not arrived.

## Quick-added products keep the opening-count guard

Creating a product inside a purchase writes an opening count of zero. This is not a bypass:

- It requires an administrator and the same account-password verification the standalone
  opening-count flow uses, and writes both the product audit entry and the `OPENING_BALANCE`
  movement.
- It applies only to a product created inside that same transaction. A product that already exists
  without a verified opening count is still refused exactly as before.
- A purchase that adds a new product must be dated today, because the product's baseline is
  observed now and a backdated receipt would fall before it.

## Scanner Hub

- The product preview is now a **panel on the page**, with an empty state before anything is
  scanned, rather than a dialog that only appeared on a successful scan.
- It shows the product image, name, model and brand, SKU, barcode, selling price, stock status and
  quantity, archived and code-collision warnings, a pending opening-count notice, and specifications.
- **Make Order / إنشاء طلب** is unchanged: it passes only the product ID, and the existing
  sales-order dialog validates everything.
- **Receive Stock / إدخال مخزون** is new. It opens the receiving form and seeds the first line —
  but only when the product tracks stock and has a verified opening count, so the form is never
  pre-filled with a line it would refuse. It creates no receiving document and no supplier debt.
- A found entry in recent scans can reopen the preview without rescanning the item.
- Typed text that is not a code now falls through to the product catalogue search.

Product identity still comes from the shared scan response. Price, image, and stock are fetched
separately through authenticated product APIs and remain unavailable to paired phones.

**Deferred:** a phone scan still updates recent scans without taking over the desk preview.

## Database migration

The release includes additive migration `20260815120000_add_supplier_purchase_lines`: one table
(`supplier_purchase_lines`), one enum, and three columns on `supplier_transactions`
(`receiptNumber`, `amountOverride`, `amountOverrideReason`).

Every added column is nullable or defaulted, so no backfill runs and no existing row is rewritten.
The migration creates no purchase, receiving document, stock movement, or ledger entry.

Two structural rules are enforced by the database rather than by code alone: a description-only
line cannot hold a product, quantity, price, or stock link, and a receiving line can be billed by
at most one purchase line — which is what makes a duplicate stock increase for one billed line
impossible to represent.

Report-only preflight and reconciliation SQL for a restored backup is in
`backend/prisma/repair/inventory-v1.9.4/`.

## Deployment gate

- Take a backup before installing, and confirm it restores.
- Run `01_supplier_purchase_preflight_report.sql` against the restored copy. Sections A and B run
  on a v1.9.3 database; section C runs after the migration.
- Every check must report `OK` with a finding count of zero before the business PC is upgraded.
