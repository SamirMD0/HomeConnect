# Product Pricing Presets / صيغ التسعير

## Purpose

Pricing presets derive quotation values from a product's real supplier cost. This feature calculates and displays values only. It does not create a sale, debt, installment plan, payment, or stock movement.

Existing `Product.price` remains the manual selling price and `Product.discount` remains a subtractive discount. The calculated cash price is derived on read and is not stored. An administrator may explicitly copy it into the manual price.

## Formula

COMPOUND mode:

```text
cash = cost × (1 + expenses/100) × (1 + profit/100) × (1 + buffer/100)
```

SIMPLE mode:

```text
cash = cost × (1 + (expenses + profit + buffer)/100)
```

The raw compound chain is not rounded between steps. Cash price is rounded at its output boundary. Installment price is calculated from the rounded cash price. Remaining is always installment price minus rounded down payment. Regular installments floor to two decimals and the final installment absorbs the residual cent.

Correct reference example:

```text
Cost 300.00
Expenses 10%, profit 7%, discount buffer 7%
Compound cash: 300 × 1.10 × 1.07 × 1.07 = 377.817 → 377.82
Installment markup 20% → 453.38
Down payment 40% → 181.35
Remaining → 272.03
3 installments → 90.67, 90.67, 90.69
```

The earlier planning value `377.55` was mathematically inconsistent with the documented percentages and has not been encoded.

## Suggested Manual Presets

Create presets from the Pricing Presets page after confirming each percentage with the business owner. These names are suggestions, not seeded defaults:

1. `AC / مكيف`
2. `Fridge / براد`
3. `Air Fryer / قلاية هوائية`
4. `Lamp / إنارة`
5. `Custom / مخصص`

Do not copy one formula across these product families without reviewing margins and payment risk. Choose one active preset as the default only when the business has approved a safe fallback.

## Authorization

- All authenticated staff may list presets and view calculated prices.
- Stored real cost is returned only to administrators.
- Formula, cost, assignment, custom pricing, archive, restore, and default changes require administrator authorization, reason, and account password.
- Descriptive preset edits require administrator authorization and reason; formula edits additionally require password verification.
- Passwords are excluded from API responses and audit values.

## Deployment

Apply the Prisma migration before launching the updated application:

```powershell
npx prisma migrate deploy --schema backend/prisma/schema.prisma
npx prisma generate --schema backend/prisma/schema.prisma
```

Never run `prisma migrate reset` against the business database.
