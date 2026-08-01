# HomeConnect v1.1.0 Release Notes

## Product Pricing Presets / صيغ التسعير

Version 1.1.0 adds reusable formulas for deriving product cash and installment quotations from real supplier cost.

### Included

- Pricing Presets management with search, active/archive state, default selection, responsive table/cards, and bilingual labels.
- COMPOUND and SIMPLE calculations using Prisma Decimal values and string API contracts.
- Four cash/installment rounding modes.
- Product cost, preset assignment, complete custom overrides, and backend-authoritative live previews.
- Exact down-payment subtraction and residual-cent handling in the final installment.
- Separate manual and calculated cash prices in the Product catalogue.
- Explicit, administrator-controlled action to copy calculated cash into the existing manual price.
- Administrator password, reason, and audit protection for sensitive pricing changes.
- Stored cost is omitted from non-admin product responses.

### Compatibility

- Existing `Product.price` and `Product.discount` values are unchanged.
- Existing products without pricing configuration remain valid and show pricing as unavailable.
- The calculated cash price is derived and is not stored automatically.
- No sale, debt, installment plan, payment, or stock movement is created by this feature.

### Database

Apply `20260802090000_add_pricing_presets_and_product_pricing` through Prisma migrations. For a business PC without Prisma migration history, back up the database and use `release/1.1.0/upgrade-v1.1.0-pricing-presets-business-pc-safe.sql` once while HomeConnect is closed.

Never use `prisma migrate reset` on business data.
