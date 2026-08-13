# HomeConnect v1.8.0 — Inventory Management

## What this release adds

HomeConnect v1.8.0 introduces an append-only stock-movement ledger, inventory page, product inventory panel, movement history, low-stock and out-of-stock views, dashboard inventory summaries, and scanner-assisted product lookup.

Every stock change records its before quantity, signed change, resulting quantity, reason, time, and acting user. Scanning or opening a product never changes stock automatically.

Inventory in v1.8.0 is an explicit manual stock-movement ledger. Sales orders do not deduct stock, and supplier or financial-ledger transactions do not receive stock. Use the manual inventory actions after verifying each product's opening count. Explicit document-linked sales fulfillment and supplier receiving are planned for a future release.

## Verified opening counts

Existing catalogue values are not treated as verified inventory. Before normal stock actions become available, an administrator must physically count the product and use **Verify Opening Count / تأكيد الجرد الافتتاحي** in the app. A verified count of zero is valid for an empty shelf.

Products initially appear in one of two non-ledger states:

- `NOT_IN_INVENTORY`: untracked, zero quantity, and no movements. This is normal catalogue data, not an onboarding task.
- `PENDING_ONBOARDING`: tracking is enabled or a quantity exists, but no verified opening balance exists yet.

After onboarding, reconciliation reports `OK` only when an opening balance exists, movement arithmetic is valid, and the ledger sum equals the product quantity. Any inconsistent activity is `MISMATCH`.

The SQL opening-balance template is only for a reviewed, controlled bulk-onboarding batch. It is not the normal daily workflow and must never copy old quantities without a physical count.

## Recommended rollout

Start with around 30 fast-moving or otherwise important products. Physically count them, confirm their identity and tracking decision, then onboard them through the app. Repeat in small batches that can be checked by eye.

Only 4 of the 90 products in the rehearsed business catalogue currently have barcodes. Expect SKU or manual-name lookup to be the primary workflow until more labels are printed.

## Migration and data safety

The v1.8.0 migration is additive: it adds the stock-movement enum, table, constraints, foreign keys, and indexes. It does not alter product columns, automatically backfill movements, or modify existing product quantities.

A fresh, verified business-PC backup must be restored and the corrected migration/helper files rehearsed on that copy before installation. Run reconciliation after migration and require zero mismatches.

## Explicitly not included

This release does not add:

- automatic stock deduction from sales
- automatic supplier receiving
- automatic service-parts consumption
- customer debt, payment, or customer-ledger changes
- supplier-ledger or sales-order financial changes
- expenses, chart of accounts, COGS, FIFO, weighted-average costing, or stock valuation
- Financial Truth Foundation or WhatsApp/customer-communication work

Reserved movement types exist for possible future integrations, but v1.8.0 does not emit them.
