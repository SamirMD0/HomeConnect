# VAT Foundation — Concrete Design

**Date:** 2026-09-03  
**Status:** AWAITING BUSINESS-OWNER APPROVAL  
**Scope:** Design only. This document turns `CURRENCY_AND_VAT_DECISION.md` Part B and ADR-20 into a concrete schema and pure-domain contract. It does not change implementation code.

## 1. Approved constraints carried into this design

- VAT configuration is `TaxRate` plus `TaxProfile`; there is no hardcoded `vat = 11` field or business-rule constant.
- VAT is calculated independently for each line and rounded at that line. Document VAT is the exact sum of the stored, rounded line VAT amounts.
- Each finalized sales and purchase line stores the rate, code, ex-VAT unit price, VAT amount, and inclusive total used at finalization. Historical reads never resolve tax configuration again.
- VAT-inclusive pricing derives VAT by subtraction after rounding the ex-VAT amount. This makes the quoted inclusive amount exact by construction.
- VAT is calculated in the document currency: USD uses 2 decimal places and LBP uses 0 decimal places, both with `ROUND_HALF_UP`.
- Zero-rated and exempt are different tax treatments even though both have a numeric rate of zero. Their snapshotted tax codes preserve the distinction.
- A product with no `taxProfileId` uses the one active default profile; it never silently becomes exempt.

## 2. Prisma schema

### 2.1 Configuration tables

```prisma
model TaxRate {
  id            String    @id @default(uuid()) @db.Uuid
  code          String    @unique
  name          String
  nameAr        String
  ratePercent   Decimal   @db.Decimal(6, 3)
  effectiveFrom DateTime  @db.Date
  effectiveTo   DateTime? @db.Date
  isActive      Boolean   @default(true)
  createdById   String    @db.Uuid
  createdBy     User      @relation("TaxRateCreatedBy", fields: [createdById], references: [id], onDelete: Restrict)
  createdAt     DateTime  @default(now())

  taxProfiles TaxProfile[]

  @@index([isActive, effectiveFrom, effectiveTo])
  @@map("tax_rates")
}

model TaxProfile {
  id        String   @id @default(uuid()) @db.Uuid
  code      String   @unique
  name      String
  nameAr    String
  taxRateId String   @db.Uuid
  taxRate   TaxRate  @relation(fields: [taxRateId], references: [id], onDelete: Restrict)
  isDefault Boolean  @default(false)
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  products Product[]

  @@index([taxRateId])
  @@index([isActive, isDefault])
  @@map("tax_profiles")
}
```

`User` gains the inverse relation:

```prisma
taxRatesCreated TaxRate[] @relation("TaxRateCreatedBy")
```

Configuration rules:

- `TaxRate.code` and `TaxProfile.code` are stable identifiers. Display names may change, but a code already present in a finalized-line snapshot is not repurposed.
- `ratePercent` must be between `0.000` and `100.000`, inclusive.
- `effectiveTo`, when present, must be later than `effectiveFrom`. The validity interval is `[effectiveFrom, effectiveTo)`.
- Finalization may use only an active profile linked to an active rate that is effective on the document date.
- Rate changes append a new `TaxRate` and repoint the applicable profile. An already-used rate percentage is not edited in place.
- There must be exactly one active default profile. A PostgreSQL partial unique index enforces at most one; the tax-configuration transaction enforces that an active default always exists.
- Deletes use `Restrict`. Deactivation and effective dating preserve the configuration audit trail.

The migration SQL should add the numeric/date checks and the partial unique index because Prisma cannot express all of them directly.

### 2.2 Product tax selection

`Product` gains:

```prisma
taxProfileId    String?     @db.Uuid
taxProfile      TaxProfile? @relation(fields: [taxProfileId], references: [id], onDelete: Restrict)
priceIncludesVat Boolean

@@index([taxProfileId])
```

> **SUPERSEDED by §7.1 (approved 2026-09-03).** The owner chose *customer pays VAT on top*, which makes stored prices exclusive:
>
> ```prisma
> priceIncludesVat Boolean @default(false)
> ```
>
> Backfill every existing product to `false`. See §7.1 for the reasoning and §8 for the pricing-engine work this requires.

At finalization, tax resolution is:

1. Use the product's active `taxProfile` when `taxProfileId` is present.
2. Otherwise use the one active default profile.
3. Resolve that profile's effective active `TaxRate` and snapshot it.
4. If no valid default or effective rate exists, fail finalization; never substitute zero or exempt.

A manual line may explicitly select a tax profile. If it does not, it follows the same active-default rule.

For sales, the product's `priceIncludesVat` supplies the quote mode. A supplier invoice line must pass its own explicit inclusive/exclusive entry mode to the domain calculation because the supplier's quoted cost need not use the product catalogue's sales-price convention. The normalized snapshot means that input mode does not need to be consulted on historical reads.

### 2.3 Finalized-line snapshots

Both `SalesOrderItem` and `SupplierPurchaseLine` gain exactly these five fields:

```prisma
taxRateSnapshot Decimal @db.Decimal(6, 3)
taxCodeSnapshot String?
unitPriceExVat  Decimal @db.Decimal(12, 2)
vatAmount       Decimal @db.Decimal(12, 2)
lineTotalIncVat Decimal @db.Decimal(12, 2)
```

They are scalar snapshots, not foreign keys. A finalized historical line must remain readable even if its source product, profile, or rate is later renamed, deactivated, or repointed.

The existing `lineTotal` becomes the authoritative ex-VAT line total. Thus, for every finalized line:

```text
lineTotalIncVat = lineTotal + vatAmount
```

The equality uses already currency-rounded values; the total is not independently rounded. New finalized lines always have a non-null `taxCodeSnapshot`. Its schema is nullable only so historical no-VAT records can truthfully use `null` rather than pretend that a configured zero-rated or exempt code applied.

Historical backfill is value-neutral:

- `taxRateSnapshot = 0.000`
- `taxCodeSnapshot = null`
- `vatAmount = 0`
- `lineTotalIncVat = lineTotal`
- `unitPriceExVat = unitPrice` where an old unit price exists
- for an old direct-total supplier line with no unit price, treat the line as one effective pricing unit and set `unitPriceExVat = lineTotal`

No historical `unitPrice`, `lineTotal`, document total, or base value changes. In particular, old lines are not assigned the new 11% seed rate: those sales and purchases genuinely occurred without VAT in this system.

## 3. Pure `domain/vat.ts` contract

The module has no Prisma import, database access, clock access, mutable state, or configured-rate lookup. Its caller resolves the profile/rate and supplies scalar values.

```ts
type VatLineInput = {
  currency: Currency;
  quotedUnitPrice: MoneyInput;
  quantity: number;
  discountAmount?: MoneyInput;
  priceIncludesVat: boolean;
  taxRatePercent: MoneyInput;
  taxCode: string;
};

type VatLineResult = {
  taxRateSnapshot: Decimal;
  taxCodeSnapshot: string;
  unitPriceExVat: Decimal;
  lineTotalExVat: Decimal; // persisted in the existing lineTotal column
  vatAmount: Decimal;
  lineTotalIncVat: Decimal;
};

export function calculateVatLine(input: VatLineInput): VatLineResult;
```

For supplier manual/direct-total lines, the adapter calls the same function with `quantity = 1` and the direct total as `quotedUnitPrice`. The pure function therefore has one arithmetic path.

Validation occurs before arithmetic:

- currency must be USD or LBP;
- quantity must be a positive integer;
- quoted price and discount must satisfy the currency's scale and schema ceiling;
- discount defaults to zero and cannot exceed the extended quoted amount;
- `taxRatePercent` must have at most 3 decimal places and be in `[0.000, 100.000]`;
- `taxCode` must be non-empty;
- all resulting amounts must remain within `Decimal(12,2)`.

The tax code is retained for classification and reporting. Arithmetic uses the supplied percentage. Therefore zero-rated and exempt lines both calculate zero VAT while remaining distinguishable in their snapshots and printed/reporting treatment.

## 4. Exact formulas and rounding points

Define:

```text
s(USD) = 2 decimal places
s(LBP) = 0 decimal places
R_currency(x) = ROUND_HALF_UP(x, s(currency))
r = taxRatePercent / 100       // exact Decimal division; do not round r
D = discountAmount ?? 0
Q = R_currency(quantity * quotedUnitPrice - D)
```

`Q` is the net line quote after discount. A discount follows the quote mode: on an exclusive line it is ex-VAT; on an inclusive line it is VAT-inclusive. VAT is therefore calculated after discount, not on the undiscounted amount.

### VAT-exclusive input

```text
lineTotalExVat = Q
rawVat         = lineTotalExVat * r       // no intermediate rounding
vatAmount      = R_currency(rawVat)       // the one VAT rounding point
lineTotalIncVat = lineTotalExVat + vatAmount
```

`lineTotalIncVat` is an exact addition of same-scale stored amounts and is never independently rounded.

The normalized unit snapshot is:

```text
unitPriceExVat = R_currency(quotedUnitPrice)
```

### VAT-inclusive input

```text
lineTotalIncVat = Q                        // preserve the quoted total exactly
rawExVat        = lineTotalIncVat / (1+r) // no intermediate rounding
lineTotalExVat  = R_currency(rawExVat)    // the one division-rounding point
vatAmount       = lineTotalIncVat - lineTotalExVat
```

There is deliberately no second rounding of `vatAmount`: subtraction of two values already at the currency scale produces a value at that scale. Directly calculating and separately rounding `lineTotalIncVat * r / (1+r)` is forbidden because it creates two rounded representations that can disagree with the quoted total.

The normalized unit snapshot is:

```text
unitPriceExVat = R_currency(quotedUnitPrice / (1+r))
```

The authoritative VAT calculation is performed on the net extended line amount `Q`, not by multiplying the rounded `unitPriceExVat`. This avoids multiplying a per-unit rounding residual across quantity. `unitPriceExVat` is the normalized unit snapshot; `lineTotal`, `vatAmount`, and `lineTotalIncVat` are the authoritative line amounts.

### Inclusive exactness proof

For a quoted VAT-inclusive USD line of `19.99` at `11.000%`:

```text
r                = 11.000 / 100 = 0.11
lineTotalIncVat  = 19.99
rawExVat         = 19.99 / 1.11 = 18.009009009...
lineTotalExVat   = ROUND_HALF_UP(18.009009009..., 2) = 18.01
vatAmount        = 19.99 - 18.01 = 1.98
proof            = 18.01 + 1.98 = 19.99 exactly
```

Generally, the inclusive definition is `vatAmount := quotedAmount - roundedExVat`. Therefore:

```text
roundedExVat + vatAmount
= roundedExVat + (quotedAmount - roundedExVat)
= quotedAmount
```

This is an identity, not an approximation.

## 5. Mixed LBP invoice worked by hand

All three lines have quantity 1 and no discount. LBP uses whole units and `ROUND_HALF_UP`.

### Line 1 — standard 11%, VAT-inclusive quote

```text
taxCode          = LB_STANDARD
ratePercent      = 11.000
r                = 0.11
quoted inclusive = 100,000 LBP
raw ex-VAT       = 100,000 / 1.11
                 = 90,090.090090... LBP
lineTotal        = ROUND_HALF_UP(90,090.090090..., 0)
                 = 90,090 LBP
vatAmount        = 100,000 - 90,090
                 = 9,910 LBP
lineTotalIncVat  = 100,000 LBP
line proof       = 90,090 + 9,910 = 100,000 LBP
```

### Line 2 — zero-rated

```text
taxCode          = LB_ZERO
ratePercent      = 0.000
r                = 0
quoted exclusive = 45,500 LBP
lineTotal        = 45,500 LBP
raw VAT          = 45,500 * 0 = 0
vatAmount        = ROUND_HALF_UP(0, 0) = 0 LBP
lineTotalIncVat  = 45,500 + 0 = 45,500 LBP
reporting        = zero-rated; included in taxable turnover
```

### Line 3 — exempt

```text
taxCode          = EXEMPT
ratePercent      = 0.000
r                = 0
quoted amount    = 25,250 LBP
lineTotal        = 25,250 LBP
raw VAT          = 25,250 * 0 = 0
vatAmount        = 0 LBP
lineTotalIncVat  = 25,250 LBP
reporting        = exempt; excluded from taxable turnover and displayed as
                   "Exempt", not merely as a zero-rated 0 amount
```

### Document totals

```text
ex-VAT subtotal = 90,090 + 45,500 + 25,250
                = 160,840 LBP

document VAT    = exact sum of stored rounded line VAT
                = 9,910 + 0 + 0
                = 9,910 LBP

document total  = ex-VAT subtotal + document VAT
                = 160,840 + 9,910
                = 170,750 LBP

sum of line inclusive totals
                = 100,000 + 45,500 + 25,250
                = 170,750 LBP
```

The document VAT is not recalculated as `ROUND_HALF_UP(document subtotal * 11%)`, because only one of the three lines is standard-rated. It is exactly `SUM(line.vatAmount)`. The document total is likewise the exact sum of its stored parts.

## 6. Returns and VAT reversal

A return references the original finalized line and reverses its stored values. It never resolves the product's current profile and never reads the current `TaxRate`.

- A full-line return reverses exactly the original `lineTotal`, `vatAmount`, and `lineTotalIncVat`, and copies `taxRateSnapshot` and `taxCodeSnapshot` to the return record/audit representation.
- A partial return allocates the original snapshotted ex-VAT, VAT, and inclusive amounts proportionally to returned quantity at the transaction currency's scale. Intermediate partial returns use `ROUND_HALF_UP`; the final remainder receives the exact unreversed residual so cumulative reversals equal the original line exactly.
- The reversal amounts have the opposite financial sign; the original line remains immutable.

This must use the snapshot because configuration can legitimately change after the sale. If a line was sold at 11% and the profile later points to 12%, recalculation would refund tax that was never charged and corrupt both the customer refund and the VAT report. Reading the original line makes the originally charged VAT the only possible reversal amount.

## 7. Business-owner decisions — ANSWERED AND APPROVED 2026-09-03

### 7.1 VAT is charged on top of the price — `priceIncludesVat` defaults to `false`

**This reverses the recommendation originally written in this section.**

The owner's decision: **the customer pays VAT on top; margin percentages keep their meaning.** Shelf prices rise ~11%.

```
Cost $100, preset +50%
  Preset output (ex-VAT)  : $150.00
  VAT 11%                 : $ 16.50
  Customer pays / label   : $166.50
  Shop banks              : $150.00   margin $50.00 — as intended
```

The original recommendation of `true` rested on Lebanese retail quoting VAT-inclusive. That conflates **display convention** with **storage basis**. "Customer pays VAT on top" *is* the definition of exclusive pricing.

- **Stored basis: exclusive.** `Product.price` and pricing-preset output are ex-VAT.
- **Display: inclusive.** Labels, quotes, and the sales screen show the inclusive total the customer actually pays.

Therefore:

```prisma
priceIncludesVat Boolean @default(false)
```

Backfill every existing product to `false`. Section 2.2's note about the default being deliberately unresolved is now superseded.

### 7.2 Standard-rated only

Seed `LB_STANDARD` (11.000) and `LB_ZERO` (0.000). **Do not seed or expose an EXEMPT profile.** The model still supports exempt, so introducing one later is a row, not a migration.

---

## 8. Gap this design did not cover — the pricing engine

Found during approval review. **This must be implemented alongside the schema, or the VAT rollout silently cuts profit.**

`resolveProductPricing` ([pricing-resolution.ts](backend/src/features/pricing/calculator/pricing-resolution.ts)) calls `calculatePricing` ([pricing-calculator.ts:9](backend/src/features/pricing/domain/pricing-calculator.ts#L9)), which derives `cashPrice` from cost + expense% + profit% + buffer%. **It is entirely VAT-unaware.**

Its output is never stored. It is computed live and feeds three customer-facing paths:

| Path | Location |
|---|---|
| Pricing preview | [products.service.ts:366](backend/src/features/service/products/products.service.ts#L366) |
| **Printed shelf label** | [products.service.ts:801](backend/src/features/service/products/products.service.ts#L801) |
| Product detail | [products.service.ts:891](backend/src/features/service/products/products.service.ts#L891) |

Had `priceIncludesVat` defaulted to `true`, the label's $150 would have become VAT-inclusive, ex-VAT would fall to $135.14, and a "50% profit" preset would silently deliver ~35%.

### Required treatment

- **Do not modify `calculatePricing`.** It correctly returns an ex-VAT price derived from cost. Keeping it a pure function of cost is what makes the margin formula mean what it says.
- **Make the presentation layer VAT-aware.** Resolve the product's effective rate, then present ex-VAT price, VAT amount, and inclusive total together.
- **Product form shows both, live, as the owner types:** *"You receive $150.00 · Customer pays $166.50"*. This removes the inclusive/exclusive ambiguity exactly where it would otherwise cause a costly mistake.

### Acceptance check for this gap

Run the label preview for a preset-priced product and confirm:

1. ex-VAT equals the preset output **exactly**, and
2. inclusive equals ex-VAT × 1.11.

This is the check that proves the margin is intact.

---

**Approved 2026-09-03. Implementation (Prompt 19) may proceed on the two blocking prerequisites below being met.**
