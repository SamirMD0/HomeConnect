# Inventory Reconciliation Baseline — 2026-09-04

Source: live `homeconnect` database at `localhost:5433`, queried read-only through `InventoryService.getStockIntegrity()`.

Execution timestamp: `2026-09-04T13:53:30.718Z`

## Result

```text
available: true
totalProducts: 86
ok: 4
notInInventory: 81
pendingOnboarding: 1
mismatch: 0
```

The four fully tracked products reconcile: stored stock equals the movement-ledger sum and the latest `quantityAfter`. There are zero products classified `MISMATCH`.

One tracked product is not yet reconcilable because it has stock without an opening movement:

| SKU | Product | Stored stock | Ledger sum | Movements | Opening balance | Status |
|---|---|---:|---:|---:|---|---|
| HC-000004 | Professional Men's shaver | 99 | 0 | 0 | No | PENDING_ONBOARDING |

The remaining 81 products have `trackStock = false`, zero stored stock, and no movements. They are classified `NOT_IN_INVENTORY`, not as discrepancies.

## Gate interpretation

- Corruption/mismatch baseline: `0`.
- Pending onboarding: `1`; this must remain visible and must not be described as a reconciled tracked product until an authorized opening count is recorded.
- No data was written by this check.

