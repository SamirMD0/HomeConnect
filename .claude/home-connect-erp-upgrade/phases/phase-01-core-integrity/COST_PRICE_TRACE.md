# Product Cost Price Lifecycle Trace

Date: 2026-08-30
Branch: `upgrade/phase-01-core-integrity`
Commit inspected: `1c3d608776bf7ae4d2af0a35d3ff0a4ba1c8c765`

## Result

`Product.costPrice` is nullable product master data entered by an administrator. It is the current cost input to Home Connect's pricing engine; it is not an inventory valuation layer and it is not a historical record of receipts.

There are two application paths that can supply a value for the column:

1. an administrator includes it when creating a product; or
2. an administrator changes or clears it through the dedicated product-pricing endpoint.

Posting a supplier purchase does **not** update `Product.costPrice`. A purchase instead stores the price actually entered for that invoice in `SupplierPurchaseLine.unitPrice`. Those two values can therefore diverge indefinitely.

For preset-priced products, selling prices are derived on every read from the current `costPrice` and the effective preset. Changing `costPrice` immediately changes subsequent catalogue prices, label prices, previews, and the default price offered for a new sales order. It does not rewrite the unit price already snapshotted on an existing sales order.

## 1. Storage and every write site

The schema defines one nullable cost field (`backend/prisma/schema.prisma:685`):

```prisma
costPrice Decimal? @db.Decimal(12, 2)
```

The migration that introduced it only added the nullable column (`backend/prisma/migrations/20260802090000_add_pricing_presets_and_product_pricing/migration.sql:38`). It did not backfill a cost. The repair scripts likewise add the column if absent; they do not populate business values.

### Write path A: product creation

`ProductsService.create()` is the first runtime write path (`backend/src/features/service/products/products.service.ts:221-259`). The created product data includes:

```ts
...pricingCreateData(input),
```

`pricingCreateData()` is the exact assignment site (`products.service.ts:1015-1018`):

```ts
if (input.costPrice != null) data.costPrice = parseMoney(input.costPrice);
```

The create validator accepts `costPrice` only as a positive value with at most two decimal places (`products.validator.ts:47-58,105-116`). If any pricing configuration is supplied, cost is required (`products.validator.ts:230-236`). Supplying pricing on product creation requires an administrator (`products.service.ts:222-223`). The frontend obtains this value from the admin-only **Real Cost Price / السعر الحقيقي** field and includes the built pricing configuration in the product create request (`frontend/src/features/products/components/ProductFormPricingPanel.tsx:151`; `ProductFormDialog.tsx:152-153,366-383`).

The repository sink is `ProductsRepository.create()` (`products.repository.ts:278-280`):

```ts
return tx.product.create({ data, include: productActorInclude });
```

Creation and its `ServiceAudit` row are inside the same `runFinancialTransaction()`. The audit's product snapshot includes `costPrice` (`products.service.ts:962-968`).

### Write path B: dedicated pricing update

The only update API that accepts `costPrice` is:

```ts
productsRoutes.patch('/:productId/pricing', requireServiceAdmin, ...)
```

at `backend/src/features/service/products/products.routes.ts:48`. It is ADMIN-only, validates `updateProductPricingSchema`, requires a reason and the administrator's account password (`products.validator.ts:215-228`), and reaches `ProductsService.updatePricing()` (`products.service.ts:374-395`).

The exact assignment is in `pricingUpdateData()` (`products.service.ts:979-982`):

```ts
if (input.costPrice !== undefined)
  data.costPrice = input.costPrice == null ? null : parseMoney(input.costPrice);
```

This permits an explicit `null` to clear the cost. The service passes that data to `ProductsRepository.update()`:

```ts
return tx.product.update({ where: { id }, data, include: productActorInclude });
```

(`products.repository.ts:282-284`). Password verification, product update, actor lookup, and the `CHANGE_PRICE` audit containing before/after values all run in one `runFinancialTransaction()` (`products.service.ts:377-394`). The frontend sends this operation through `PATCH /products/:id/pricing` (`frontend/src/features/products/api/products.api.ts:64`; `ProductFormDialog.tsx:169`).

### Paths that cannot write it

- The general `PATCH /products/:id` schema is strict and deliberately excludes every pricing field (`products.validator.ts:118-139`). Posting `costPrice` there produces a validation error instead of silently updating it.
- `productUpdateData()` has no `costPrice` assignment (`products.service.ts:755-770`).
- Inventory stock operations never write cost.
- Supplier receiving never writes cost.
- Supplier purchase quick-add creates a new product with an optional manual **selling** `price`, but no `costPrice` (`supplier-purchases.service.ts:292-304`). The new product therefore starts with a null cost even though its purchase line has a unit price.

The complete production-code search found no other `costPrice` value assignment, Prisma update, raw SQL update, seed, import, or background synchronization.

## 2. Supplier purchases do not update cost price

Plain answer: **No. Posting a supplier purchase does not update `Product.costPrice`.**

For each PRODUCT line, `SupplierPurchasesService.create()` reads the submitted price and calculates the invoice line (`backend/src/features/suppliers/purchases/supplier-purchases.service.ts:121-127`):

```ts
unitPrice: parseMoney(line.unitPrice),
lineTotal: multiplyMoney(line.unitPrice, String(line.quantity)),
```

It may then post a stock receiving (`supplier-purchases.service.ts:132-147`) and later creates the purchase line with that `unitPrice` (`supplier-purchases.service.ts:194-207`). There is no product update anywhere in this flow. `ProductsRepository` is used only when quick-adding a new product; that creation stores optional `sellingPrice` in `Product.price`, not the purchase price in `Product.costPrice` (`supplier-purchases.service.ts:282-304`).

The frontend makes the separation especially clear (`frontend/src/features/suppliers/components/PurchaseLineRow.tsx:34-43`):

```ts
lastCost: product?.pricing?.costPrice ?? null,
unitPrice: line.unitPrice || product?.pricing?.costPrice || '',
```

The old product cost is merely a suggested starting value for an untouched purchase-price field. The operator can replace it, and the submitted replacement is not written back to the product.

## 3. What `SupplierPurchaseLine.unitPrice` means

`SupplierPurchaseLine.unitPrice` is a document-line snapshot of the unit price entered for that specific supplier invoice (`backend/prisma/schema.prisma:1167-1184`). It differs from `Product.costPrice` in purpose and lifecycle:

| Field | Meaning | Lifecycle |
| --- | --- | --- |
| `Product.costPrice` | Current product-level input used to calculate selling prices | Nullable and mutable; manually created or changed by an administrator |
| `SupplierPurchaseLine.unitPrice` | Unit price actually recorded on one posted PRODUCT purchase line | Stored at purchase posting; no production update/delete path was found |

For a PRODUCT line, `lineTotal = unitPrice × quantity`. The sum of line totals normally becomes the supplier debt, unless the user provides an explicit documented `amountOverride`. For a MANUAL line, `unitPrice` and quantity are null and the entered amount is stored directly as `lineTotal`.

Money deliberately lives on the purchase line rather than `SupplierReceivingItem`; the receiving proves quantities and stock movement, while the purchase document records prices. Consequently, receiving or voiding stock does not synchronize or revert the product master cost.

## 4. Runtime reads of `Product.costPrice`

### Authoritative pricing calculation

`resolveProductPricing()` is the central read (`backend/src/features/pricing/calculator/pricing-resolution.ts:12-29`):

```ts
if (!product.costPrice) return unavailable('MISSING_COST_PRICE');
...
const result = calculatePricing(new Decimal(product.costPrice.toString()), resolved.config);
```

It combines the current product cost with either the product's selected preset, the active default preset, or the product's custom pricing fields. `calculatePricing()` then applies expense, profit, discount-buffer, installment, and rounding rules (`backend/src/features/pricing/domain/pricing-calculator.ts:8-53`). It returns derived strings such as `cashPrice`, `installmentPrice`, down payment, and monthly payments. No calculated selling price is persisted by this path.

The separate `POST /pricing/calculate` endpoint also reads a request body's `costPrice`, but that is a stateless preview and is not necessarily a `Product.costPrice` read (`pricing-calculator.controller.ts:31`). It writes nothing.

### Product API, catalogue, and labels

- `ProductsService.getPricingPreview()` resolves pricing from the product cost (`products.service.ts:363-371`).
- `serializeProduct()` resolves it for list/detail responses (`products.service.ts:890-909`). Raw cost and configuration are included only for an ADMIN, while all authenticated users may receive the derived selling price.
- Product labels resolve the same pricing when price or internal price code is requested (`products.service.ts:776-817`).
- The product grid/card and table display derived `pricing.cashPrice`; administrators additionally see `pricing.costPrice` (`frontend/src/features/products/components/ProductCard.tsx:28-29,63,84`; `ProductsTable.tsx:73,178-184`).
- The product preview panel also prefers derived `pricing.cashPrice` (`ProductPreviewPanel.tsx:40`).
- The product form reads the existing cost to populate the admin pricing editor and preview (`ProductFormDialog.tsx:339,447`; `ProductFormPricingPanel.tsx:151,217-226`).

### Supplier purchase entry

The supplier purchase product row reads the admin-visible product cost as **Last recorded cost** and as an initial unit-price suggestion (`PurchaseLineRow.tsx:39-42,92-93`). It is only a form default; it does not establish a link between the two stored fields.

### Sales

- Product pricing supplied to new sales workflows is derived from the current cost.
- `productSellingPrice()` chooses `product.pricing.cashPrice` before any legacy/manual price (`frontend/src/features/sales-orders/utils/quick-order-payload.ts:26-30`). The normal sales-order picker uses the same helper.
- Once the user posts an order, `SalesOrderItem.unitPrice` is stored as its own snapshot. A later product cost change does not rewrite historical orders.
- Sales-order reads also explicitly select and serialize the related product's current `costPrice` (`backend/src/features/sales/sales-orders/sales-orders.repository.ts:18-31`; `sales-orders.service.ts:829-840`). That value is informational on the related product shape; order totals still come from the snapshotted sales line `unitPrice`.

### Dashboard monitoring

- Product analytics reads `costPrice` to count active products with missing cost and products that have pricing configured (`backend/src/features/dashboard/product/product-analytics.repository.ts:8-15`; `product-analytics.service.ts:14-26`).
- Dashboard alerts use only `!product.costPrice` to create the **Products missing cost price** alert (`dashboard-alerts.service.ts:64`).

These checks detect a null cost. They do not detect a stale cost that differs from the latest purchase line.

## 5. What changes when an administrator changes cost

For a product in PRESET mode:

1. `Product.costPrice` is updated and a `CHANGE_PRICE` service audit records the old and new values.
2. The preset itself and its percentages are not copied or changed.
3. On the next product, preview, label, or sales-picker read, `resolveProductPricing()` recalculates the cash and installment prices from the new cost and the same effective preset.
4. The result is rounded according to that preset's rounding mode.
5. Existing supplier purchase lines and existing sales order lines remain unchanged historical snapshots.

Thus there is no stale stored calculated price for preset mode. The business-visible price changes immediately because it is derived. A legacy `Product.price` may still exist, but catalogue and sales selection prefer the available derived `pricing.cashPrice`; the UI can show the differing manual value as a warning/caption.

## 6. The 20% supplier increase scenario

Assume a product is using a pricing preset, its stored cost is `C`, and a supplier invoice now charges `1.20 × C` per unit.

When the shop posts and receives that purchase:

- stock increases by the received quantity;
- the supplier purchase line stores the new `1.20 × C` unit price and its line total;
- the supplier payable reflects the purchase total (or an explicit amount override);
- **`Product.costPrice` remains `C`; and**
- Home Connect continues deriving the customer cash/installment price from old cost `C` and therefore continues offering the old selling price. A salesperson can manually edit a sales-order unit price, but the automatic default remains stale.

How someone could notice:

- During purchase entry, the UI shows the old **Last recorded cost** while the operator types the new invoice unit price.
- After posting, an administrator can manually compare the purchase line/history with the product's displayed cost and pricing preview.
- The product audit proves that no cost change occurred.

How Home Connect notices automatically: **it does not.** The missing-cost dashboard only detects null values, not stale ones. Inventory reconciliation checks quantities, and the financial integrity reports check transaction arithmetic; all can remain green while the selling price is based on an obsolete cost. There is currently no cost-change report or latest-receipt-versus-product-cost warning.

## Conclusion

Today `Product.costPrice` comes from explicit administrator product maintenance, not from supplier purchasing. It changes only on product creation or a protected pricing update. `SupplierPurchaseLine.unitPrice` correctly preserves what a particular invoice charged, but no mechanism promotes that snapshot into the product's current cost. As a result, a supplier price rise can update stock and payables while leaving every automatically derived selling price unchanged, with only manual comparison exposing the discrepancy.
