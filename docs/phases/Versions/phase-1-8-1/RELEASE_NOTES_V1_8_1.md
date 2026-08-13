# HomeConnect v1.8.1 — Security and Friction Cleanup

## What this release changes

HomeConnect asked for an account password and a typed reason too often. Both were demanded for ordinary daily work — renaming a product, correcting a barcode, updating a service job's price, moving a job's status backward — and friction on everyday actions is not security. It makes staff delay work, or share an administrator's password so the work can happen at all.

v1.8.1 moves product and service workflows to **role-based security first**. The account password is reserved for high-risk corrections. Audit is unchanged in scope and, in one place, wider than before.

No feature was added or removed. No screen was rebuilt. Nothing about how the business works has changed.

## What no longer asks for a password or a typed reason

**Products**

- Product details: name, model, brand, barcode, price, discount, image, notes, specifications, label barcode source
- Product SKU: editing and reissuing
- Product stock settings: stock tracking on/off, and the low-stock threshold

**Service jobs**

- Service job details: customer, product, issue, routing, warranty, dates, prices, notes
- Service status changes, including moving a job backward

These remain restricted by **role** exactly as before. An employee who could not rename a product yesterday still cannot today. An employee who could edit product notes or a job's requested part still can.

## What still requires an account password

Unchanged in this release:

- **Customer ledger:** debts, payments, payment allocations, reversals, balance corrections
- **Supplier ledger:** supplier transaction edits and removals, supplier name/phone changes, deletion, archive and restore
- **Pricing:** pricing presets, and a product's cost price, pricing preset, and custom pricing percentages
- **Inventory quantities:** verified opening count, stock count correction, manual stock removal, damage/loss
- **Products:** archive and restore
- **Service jobs:** cancel and reopen
- **System:** database repair and maintenance, backup and restore

Product **price** and **discount** are direct catalogue fields and relax with the rest of the product form. Product **cost price** and everything driving the pricing formula stay behind the password. These are two separate screens and two separate endpoints, so the boundary is structural rather than a matter of care.

## Audit is unchanged — and now covers more

Every audited action still records the acting user's id, name and username, the timestamp, the record id, the action type, and both the before and after values.

What changed is the **reason** text. Where the app no longer asks a user to type one, the server generates it from the action — for example *Product barcode updated / تم تحديث باركود المنتج* or *Status changed from RECEIVED to READY_FOR_PICKUP*. The reason is generated on the server and never accepted from the browser, so it cannot be forged or left blank.

Two improvements fall out of this:

- **Service job updates are now always audited.** Previously, an update that touched only non-sensitive fields — notes, requested part name, manual product details — wrote no audit row at all. Every service job update writes one now.
- **Product audit labels are now accurate.** A barcode change used to be filed under "Product notes updated". It is now filed as a barcode change.

The audit history panels on the product drawer and the service job page now label the reason explicitly as **Reason / السبب**.

## SKU changes

Editing or reissuing a SKU no longer asks for a password. It asks for something more useful: an explicit confirmation that printed labels already on the shelf will need reprinting.

> Changing SKU may invalidate printed labels already placed on products.
> تغيير رمز المنتج قد يجعل الملصقات المطبوعة سابقًا غير صحيحة.

A password never checked whether anyone had noticed that consequence. A confirmation does.

## Migration and data safety

**This release has no database migration.** No schema change, no backfill, no data change of any kind. The audit tables, their columns and their constraints are untouched — only the source of the reason text changed, from the user to the server.

No customer, debt, payment, installment, supplier, pricing-preset or inventory record is read or written differently by this release.

## Explicitly not included

- Sales-order stock deduction and restoration — planned for v1.9.0
- Supplier receiving — planned for v1.9.1
- Any change to customer ledger, supplier ledger, or pricing preset logic
- Any change to inventory stock-quantity corrections
- Financial Truth Foundation, expenses, chart of accounts, COGS or stock valuation
- WhatsApp or customer communication

## Upgrade notes

A standard application update. No migration step, no rehearsal against a restored backup, and no reconciliation run is required, because no data changes.

Staff should be told two things:

1. Normal product and service edits will stop asking for the administrator password. This is intended.
2. Everything touching money, supplier or customer balances, and inventory quantities still asks. If a screen stops asking that used to, report it.
