# Dual Currency Foundation — Concrete Design

**Date:** 2026-09-01  
**Status:** APPROVED by the business owner on 2026-09-01  
**Scope:** USD/LBP foundation from `CURRENCY_AND_VAT_DECISION.md` Part A and ADR-19. No implementation code is changed by this prompt.

## 1. Approved constraints carried into this design

- USD is the base and reporting currency.
- Transaction currency and the rate used are snapshotted when a record is posted. Historical reads never look up a current rate.
- The stored rate convention is **LBP per USD**: `90000.000000` means USD 1 = LBP 90,000.
- USD rounds to 2 decimal places and LBP to 0 decimal places; normal monetary and conversion rounding is `ROUND_HALF_UP`.
- Currency and rate live on the owning document. Child lines inherit them; mixed-currency lines in one document are forbidden.
- `PaymentAllocation.amount` remains in the obligation's currency. `paymentAmount` is in the payment's currency.
- All cross-document aggregation, reporting, dashboards, and margin computation use stored USD base values.
- Existing amounts are not rewritten. Existing data is stamped USD at rate 1, and each base value is copied from its existing amount.

## 2. Exact current money inventory

The current schema contains **21 money columns across 11 tables**. This is the exact count of `Decimal(12,2)` fields as of this design. The decision document's earlier “roughly 30 across 12 tables” was an estimate made before later schema and legacy-system decisions.

The ten `Decimal(6,3)` pricing percentage fields on `Product` and `PricingPreset` are not money and are excluded. Integer quantities, counts, and JSON audit snapshots are also excluded.

| Table | Existing money column | Currency ownership | Base-value treatment |
|---|---|---|---|
| `Debt` | `originalAmount` | `Debt` owns its currency and rate | Add `baseOriginalAmount` |
| `InstallmentPlan` | `totalAmount` | `InstallmentPlan` owns its currency and rate | Add `baseTotalAmount` |
| `Installment` | `amountDue` | Inherits plan currency/rate | Add `baseAmountDue`; child carries no currency/rate |
| `Payment` | `totalAmount` | `Payment` owns its currency and rate | Add `baseAmount` |
| `PaymentAllocation` | `amount` | Obligation currency, inherited from target debt/plan | No generic base field; add payment-side `paymentAmount` and the allocation conversion rate |
| `Product` | `price` | `Product.priceCurrency` | Mutable catalogue value; no historical base snapshot |
| `Product` | `discount` | Same `priceCurrency` as `price` | Mutable catalogue value; no historical base snapshot |
| `Product` | `costPrice` | Same `priceCurrency`; supplier costs must be converted before updating it | Mutable catalogue value; no historical base snapshot |
| `ServiceJob` | `estimatedPrice` | `ServiceJob` owns its currency and rate | Add nullable `baseEstimatedPrice` |
| `ServiceJob` | `finalPrice` | Same service-job currency/rate | Add nullable `baseFinalPrice` |
| `SalesOrder` | `itemsSubtotal` | `SalesOrder` owns its currency and rate | Add `baseSubtotal` |
| `SalesOrder` | `deliveryFee` | Same order currency/rate | Add nullable `baseDeliveryFee` |
| `SalesOrder` | `totalAmount` | Same order currency/rate; derived from order components | Add `baseTotalAmount` |
| `SalesOrder` | `paidAmount` | Same order currency/rate; derived lifecycle value | Add `basePaidAmount` |
| `SalesOrder` | `remainingAmount` | Same order currency/rate; derived lifecycle value | Add `baseRemainingAmount` |
| `SalesOrderItem` | `unitPrice` | Inherits order currency/rate | Add `baseUnitPrice`; child carries no currency/rate |
| `SalesOrderItem` | `discountAmount` | Inherits order currency/rate | Add nullable `baseDiscountAmount` |
| `SalesOrderItem` | `lineTotal` | Inherits order currency/rate; derived per line | Add `baseLineTotal` |
| `SupplierPurchaseLine` | `unitPrice` | Inherits supplier transaction currency/rate | Add nullable `baseUnitPrice` |
| `SupplierPurchaseLine` | `lineTotal` | Inherits supplier transaction currency/rate | Add `baseLineTotal` |
| `SupplierTransaction` | `amount` | `SupplierTransaction` owns its currency and rate | Add `baseAmount` |

### Why this includes more base columns than the shorthand A2 table

Part A2 names the document-level currency boundaries; Part A3 and ADR-19 require stored USD values for aggregation and forbid historical revaluation. A literal currency-only `Debt`, `InstallmentPlan`, or `ServiceJob` could not satisfy that rule, and reports could not safely total their values.

This design therefore gives every persisted historical money value a same-row USD counterpart, while still storing currency and rate only once on the owning document. Lines inherit the parent's currency/rate. `Product` is the exception because its three prices are mutable catalogue settings, not posted historical transactions.

## 3. `calculateDebtBalance` remains unchanged

Current code:

```ts
export function calculateDebtBalance(input: DebtBalanceInput): ObligationBalance {
  return calculateObligationBalance(input.originalAmount, input.allocations);
}
```

`calculateObligationBalance` parses `originalAmount`, sums each non-voided allocation's `amount`, and subtracts that total. Under this design:

- `Debt.originalAmount` is in the debt currency.
- Every `PaymentAllocation.amount` targeting that debt is also in the debt currency.
- Cross-currency conversion happens before the allocation is stored.
- `PaymentAllocation.paymentAmount` records how much was consumed in the payment currency but is not passed to the balance function.

Therefore the subtraction remains same-currency arithmetic and `calculateDebtBalance` requires **no change**. The same property holds for `calculateInstallmentBalance`, because `Installment.amountDue` and its allocation `amount` values share the plan currency.

Worked invariant: a USD 1,000 debt, paid with LBP 4,500,000 at 90,000 LBP/USD, stores `PaymentAllocation.amount = 50.00` USD and `paymentAmount = 4500000` LBP. The existing function calculates exactly `1000.00 - 50.00 = 950.00` USD.

## 4. Prisma schema design

### 4.1 Currency enum

```prisma
enum Currency {
  USD
  LBP
}
```

No open-ended string is used: only the two approved currencies are representable.

### 4.2 Append-only exchange rates

```prisma
model ExchangeRate {
  id            String   @id @default(uuid()) @db.Uuid
  fromCurrency  Currency
  toCurrency    Currency
  rate          Decimal  @db.Decimal(18, 6)
  effectiveFrom DateTime
  createdById   String   @db.Uuid
  createdBy     User     @relation("ExchangeRateCreatedBy", fields: [createdById], references: [id], onDelete: Restrict)
  createdAt     DateTime @default(now())
  note          String?  @db.Text

  @@unique([fromCurrency, toCurrency, effectiveFrom])
  @@index([fromCurrency, toCurrency, effectiveFrom])
  @@index([createdAt])
  @@map("exchange_rates")
}
```

`User` gains:

```prisma
exchangeRatesCreated ExchangeRate[] @relation("ExchangeRateCreatedBy")
```

Database checks added in migration SQL:

- `rate > 0`
- `fromCurrency <> toCurrency`

The operational pair is `fromCurrency = USD`, `toCurrency = LBP`; `rate` is LBP per USD. A USD transaction snapshots `exchangeRate = 1.000000`. An LBP transaction snapshots the applicable USD→LBP rate. `ExchangeRate` has no `updatedAt`, and the application exposes create/list only: corrections append a row.

### 4.3 Owning documents and inherited lines

All rate snapshots use `Decimal(18,6)`. All transaction and base-money values remain `Decimal(12,2)`; LBP's zero-decimal rule is enforced in the domain and with database checks.

| Model | Columns added |
|---|---|
| `Debt` | `currency Currency @default(USD)`, `exchangeRate Decimal @db.Decimal(18,6)`, `baseOriginalAmount Decimal @db.Decimal(12,2)` |
| `InstallmentPlan` | `currency Currency @default(USD)`, `exchangeRate Decimal @db.Decimal(18,6)`, `baseTotalAmount Decimal @db.Decimal(12,2)` |
| `Installment` | `baseAmountDue Decimal @db.Decimal(12,2)`; currency/rate inherited from `installmentPlan` |
| `Payment` | `currency Currency @default(USD)`, `exchangeRate Decimal @db.Decimal(18,6)`, `baseAmount Decimal @db.Decimal(12,2)` |
| `PaymentAllocation` | `paymentAmount Decimal @db.Decimal(12,2)`, `exchangeRate Decimal @db.Decimal(18,6)`; currencies inherited from `payment` and the target obligation |
| `Product` | `priceCurrency Currency @default(USD)` for `price`, `discount`, and `costPrice` |
| `ServiceJob` | `currency Currency @default(USD)`, `exchangeRate Decimal @db.Decimal(18,6)`, `baseEstimatedPrice Decimal? @db.Decimal(12,2)`, `baseFinalPrice Decimal? @db.Decimal(12,2)` |
| `SalesOrder` | `currency Currency @default(USD)`, `exchangeRate Decimal @db.Decimal(18,6)`, `baseSubtotal Decimal @db.Decimal(12,2)`, `baseDeliveryFee Decimal? @db.Decimal(12,2)`, `baseTotalAmount Decimal @db.Decimal(12,2)`, `basePaidAmount Decimal @db.Decimal(12,2)`, `baseRemainingAmount Decimal @db.Decimal(12,2)` |
| `SalesOrderItem` | `baseUnitPrice Decimal @db.Decimal(12,2)`, `baseDiscountAmount Decimal? @db.Decimal(12,2)`, `baseLineTotal Decimal @db.Decimal(12,2)`; currency/rate inherited from `salesOrder` |
| `SupplierTransaction` | `currency Currency @default(USD)`, `exchangeRate Decimal @db.Decimal(18,6)`, `baseAmount Decimal @db.Decimal(12,2)` |
| `SupplierPurchaseLine` | `baseUnitPrice Decimal? @db.Decimal(12,2)`, `baseLineTotal Decimal @db.Decimal(12,2)`; currency/rate inherited from `supplierTransaction` |

`PrepaidPurchase` and `SupplierReceiving` gain nothing: they contain no money and resolve it through `Debt` and `SupplierTransaction` respectively. `PricingPreset` gains nothing because its Decimal fields are percentages, not amounts. `StockMovement` remains quantity-only.

### 4.4 Conversion and consistency rules

For an owning document amount `A`:

- USD: `exchangeRate = 1.000000`; `base = A`.
- LBP: `base = roundHalfUp(A / exchangeRate, 2)`.

For a base USD amount converted to LBP: `LBP = roundHalfUp(base × exchangeRate, 0)`.

Within a document, stored derived values are built from their stored parts rather than independently recomputed:

- `SalesOrder.baseTotalAmount = baseSubtotal + (baseDeliveryFee ?? 0)` until VAT adds `baseVatAmount` under ADR-21.
- `SalesOrder.baseRemainingAmount = baseTotalAmount - basePaidAmount`.
- Base line totals are converted once at finalization. Header base totals are exact sums of stored base components/lines, with any conversion residual assigned deterministically to the final line rather than independently rounding the header to a conflicting value.
- `Installment.baseAmountDue` values sum exactly to `InstallmentPlan.baseTotalAmount`; the existing final-installment residual rule is applied in base USD too.

The database adds positive-rate checks to every owning document and an equality check requiring USD-owned documents to use rate 1. Cross-row equivalence, inherited currencies, allocation sums, and derived-total identities are service/integration invariants because PostgreSQL checks cannot safely inspect parent rows.

### 4.5 Payment allocation semantics

The allocation rate is also LBP per USD:

| Payment currency | Obligation currency | Stored allocation |
|---|---|---|
| USD | USD | `amount = paymentAmount`, `exchangeRate = 1` |
| LBP | LBP | `amount = paymentAmount`, `exchangeRate = 1` |
| LBP | USD | `amount = roundHalfUp(paymentAmount / exchangeRate, 2)`, `paymentAmount` stays whole LBP |
| USD | LBP | `amount = roundHalfUp(paymentAmount × exchangeRate, 0)`, `paymentAmount` stays USD cents |

For every non-voided payment, the sum of non-voided allocation `paymentAmount` values must equal `Payment.totalAmount` exactly (INV-19). `amount` values remain independently exact in each target obligation's currency. When conversion rounding creates a split residual, the last allocation receives the residual in the payment currency; no money disappears.

## 5. Migration and USD backfill

The migration is additive and value-neutral.

1. Create `Currency` and `ExchangeRate`.
2. Add new columns nullable, except safe currency defaults where Prisma/PostgreSQL permits them.
3. Backfill every existing row as USD with rate 1:

| Model | Backfill |
|---|---|
| `Debt` | `currency='USD'`, `exchangeRate=1`, `baseOriginalAmount=originalAmount` |
| `InstallmentPlan` | `currency='USD'`, `exchangeRate=1`, `baseTotalAmount=totalAmount` |
| `Installment` | `baseAmountDue=amountDue` |
| `Payment` | `currency='USD'`, `exchangeRate=1`, `baseAmount=totalAmount` |
| `PaymentAllocation` | `paymentAmount=amount`, `exchangeRate=1` |
| `Product` | `priceCurrency='USD'` |
| `ServiceJob` | `currency='USD'`, `exchangeRate=1`; copy each non-null estimated/final price to its base counterpart and preserve nulls |
| `SalesOrder` | `currency='USD'`, `exchangeRate=1`; copy each money field to its corresponding base field and preserve nullable `deliveryFee` |
| `SalesOrderItem` | copy `unitPrice`, `discountAmount`, and `lineTotal` to base counterparts, preserving null discount |
| `SupplierTransaction` | `currency='USD'`, `exchangeRate=1`, `baseAmount=amount` |
| `SupplierPurchaseLine` | copy `unitPrice` and `lineTotal` to base counterparts, preserving null unit price |

4. Verify no required new value is null, then set required columns `NOT NULL`.
5. Add rate, currency, scale, and consistency checks.
6. Add indexes for reporting base fields only where query plans demonstrate a need; do not index every money column speculatively.

No existing amount column is updated. Rollback drops only new columns, enum, constraints, and `exchange_rates`; no pre-existing financial value is lost. Deployment still requires a fresh verified backup.

Pre/post migration proof:

- row counts identical for every affected table;
- each existing native amount byte-for-byte unchanged;
- every new base field equals its USD source field;
- every new rate is exactly 1 and currency exactly USD;
- all customer and supplier balances identical;
- inventory reconciliation, customer financial integrity, and supplier financial integrity reports unchanged and clean.

## 6. Currency-aware `money.ts`

The API makes currency explicit at every money boundary. Functions that may round require an explicit rounding mode; there is no default parameter.

```ts
export type MoneyCurrency = Currency.USD | Currency.LBP;
export type CurrencyScale = 0 | 2;

export function currencyScale(currency: MoneyCurrency): CurrencyScale;
export function parseMoney(input: MoneyInput, currency: MoneyCurrency): Decimal;
export function roundMoney(
  input: MoneyInput | Decimal,
  currency: MoneyCurrency,
  roundingMode: Decimal.Rounding
): Decimal;

export function assertPositiveMoney(input: MoneyInput, currency: MoneyCurrency): Decimal;
export function assertZeroMoney(input: MoneyInput, currency: MoneyCurrency): Decimal;
export function addMoney(left: MoneyInput, right: MoneyInput, currency: MoneyCurrency): Decimal;
export function subtractMoney(left: MoneyInput, right: MoneyInput, currency: MoneyCurrency): Decimal;
export function sumMoney(values: MoneyInput[], currency: MoneyCurrency): Decimal;
export function compareMoney(left: MoneyInput, right: MoneyInput, currency: MoneyCurrency): -1 | 0 | 1;
export function minMoney(left: MoneyInput, right: MoneyInput, currency: MoneyCurrency): Decimal;

export function multiplyMoney(
  amount: MoneyInput,
  multiplier: string | Decimal,
  currency: MoneyCurrency,
  roundingMode: Decimal.Rounding
): Decimal;
export function divideMoney(
  amount: MoneyInput,
  divisor: string | Decimal,
  currency: MoneyCurrency,
  roundingMode: Decimal.Rounding
): Decimal;

export function toBaseAmount(
  amount: MoneyInput,
  currency: MoneyCurrency,
  exchangeRate: string | Decimal,
  roundingMode: Decimal.Rounding
): Decimal;
export function fromBaseAmount(
  baseAmount: MoneyInput,
  currency: MoneyCurrency,
  exchangeRate: string | Decimal,
  roundingMode: Decimal.Rounding
): Decimal;

export function moneyToApiString(input: MoneyInput, currency: MoneyCurrency): string;
export function moneyToMinorUnits(input: MoneyInput, currency: MoneyCurrency): bigint;
export function minorUnitsToMoney(units: bigint, currency: MoneyCurrency): Decimal;
```

Behavior:

- USD accepts at most two non-zero decimal places and serializes with 2 digits.
- LBP rejects any non-zero fractional part and serializes with 0 digits. Inputs such as `4500000.00` are acceptable because their fractional value is zero.
- Both currencies remain capped by the physical `Decimal(12,2)` range.
- Normal calculations and conversions pass `Decimal.ROUND_HALF_UP` explicitly.
- Domain algorithms that intentionally distribute a residual, such as installment scheduling, may still use an explicitly named alternative mode and put the exact residual in the final row. That is allocation logic, not the currency's normal rounding policy.
- `moneyToCents`/`centsToMoney` are replaced by currency-neutral minor-unit functions; “cents” is false terminology for LBP.
- Exchange-rate validation is separate from `parseMoney`: rates are finite, positive `Decimal(18,6)` values, not `Decimal(12,2)` money.

## 7. Base-USD aggregation enforcement

`MAX_SCHEMA_MONEY = 9,999,999,999.99`. At 90,000 LBP/USD, an LBP aggregate reaches that ceiling at about USD 111,111.11. Per-record LBP values fit; annual or cross-customer LBP totals do not.

The rule is therefore mechanical:

- Same-obligation balance arithmetic may use native amounts because all operands share one obligation currency.
- Same-document line arithmetic may use native amounts because the parent forbids mixed currencies.
- Any total spanning documents, customers, suppliers, dates, or currencies must select and sum stored base fields only.
- Native-currency breakdowns may group by currency and sum only within that currency, but they are display supplements, never the authoritative combined total.
- The frontend must display API totals and must not recompute mixed-currency totals.

Current enforcement targets:

1. `backend/src/features/dashboard/`: customer, financial, sales, supplier, alerts, activity, and month-end aggregations and their repositories.
2. `backend/src/features/reports/`: monthly debts/review, report rows, report metrics, receivables aging, CSV exports, and every raw SQL `SUM(amount)`.
3. `backend/src/features/financial/`: receivables, global ledger summaries, customer summary, prepaid summaries, and payment/allocation validation. Balance detail functions remain native-currency as described above.
4. `backend/src/features/suppliers/`: supplier list balances, supplier ledger totals, purchase summaries, and dashboard feeds must use `SupplierTransaction.baseAmount` for combined totals.
5. `backend/src/features/sales/`: order summaries and Prisma `_sum.totalAmount`/`paidAmount`/`remainingAmount` queries move to the matching base columns.
6. `backend/src/features/service/`: any price aggregation uses `baseEstimatedPrice`/`baseFinalPrice`; detail views retain native values plus currency.
7. `backend/src/features/pricing/`: calculations remain single-currency. A supplier purchase line in a different currency is converted using its snapshotted rate before updating `Product.costPrice` in `priceCurrency`.
8. Repository/query review: Prisma `_sum` and SQL `SUM(...)` over monetary fields require a base-field assertion in tests. INV-25 supplies an integration case large enough that an LBP-native aggregate would overflow/fail.

API types must carry a currency beside every native amount. Combined report totals are labeled USD explicitly. This removes the current hardcoded `currency: 'USD'` assumption while keeping USD authoritative for aggregation.

## 8. Approved LBP rounding decision

The owner chose **whole-LBP rounding**. LBP accepts and preserves any integer
amount; it does not round to a 1,000-LBP quantum. Operations that create a
fractional LBP value round to 0 decimal places with `ROUND_HALF_UP`.
