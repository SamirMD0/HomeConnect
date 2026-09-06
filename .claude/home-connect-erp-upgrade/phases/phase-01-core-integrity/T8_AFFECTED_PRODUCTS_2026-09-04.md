# T8 Affected Products — 2026-09-04

Source: live `homeconnect` database at `localhost:5433`, queried read-only on 2026-09-04.

## Method

The check selected products with a non-null cost and preset-derived pricing (`useCustomPricing = false`), resolved each current cash price with its assigned/default pricing preset, found the latest active supplier purchase for each product, calculated that purchase's quantity-weighted ex-VAT unit cost using the same two-decimal half-up rule as T8, and compared the resulting preset cash price with the current preset cash price.

## Result

```text
Preset-priced products evaluated: 1
Products with an existing active supplier purchase usable for simulation: 0
Currently calculable selling-price changes: 0
```

No product currently has both preset-derived pricing and an active historical supplier-purchase line from which to calculate a changed receipt cost. Therefore the dated affected-product list is empty; this is not evidence that future receipts cannot change prices.

The one eligible preset-priced product is:

| SKU | Product | Model | Preset | Current cost | Active purchase lines | Current simulated change |
|---|---|---|---|---:|---:|---|
| HC-000002 | Sharp fridge | SJ-PV69G | White | 670.00 USD | 0 | Not calculable; no active receipt line |

## Required owner communication

**NOT YET PERFORMED — BLOCKED ON OWNER**

The owner must confirm in writing before merge that they understand: every future posted supplier purchase containing a product line updates that product's cost, writes an audit entry, and may immediately change its preset-derived selling price. Voiding the receiving does not revert that historical purchase cost.

T9a owner sign-off is also still required because the phase removes the visible, previously blank Legacy Ledger panel from Customer Profile.

