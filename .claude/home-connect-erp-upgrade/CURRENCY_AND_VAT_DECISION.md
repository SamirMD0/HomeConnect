# DUAL CURRENCY AND VAT DECISION

**Status: both APPROVED by the business owner, 2026-08-26.**

Currency and VAT are documented together because they interact: VAT is charged in the transaction's currency, and converting a VAT-inclusive total is exactly where rounding discrepancies appear. Designing them separately would produce two rounding rules that disagree.

**Approved effort: dual currency 80–120 h, VAT 45–65 h. Combined 125–185 h.**
See §9 for what this does to the four-month plan — it is significant.

---

# PART A — DUAL CURRENCY (USD / LBP)

## A1. Why this is not a UI feature

Currency touches sales, purchases, customer debt, supplier debt, payments, allocations, installments, inventory costing, profit calculation, reports, printing, rounding, and migrations. Roughly **30 money columns across 12 tables**. Getting it wrong produces wrong debt — silently, and retroactively.

The 80–120 hour estimate is accepted as realistic, not padded.

## A2. Currency lives on the document, not on every column

A sales order is in one currency. A payment is in one currency. So the addition is a **currency + rate pair per transactional entity**, not per money column:

| Entity | Adds |
|---|---|
| `Debt` | `currency` |
| `InstallmentPlan` | `currency` (inherited by its `Installment` rows) |
| `Payment` | `currency`, `exchangeRate`, `baseAmount` |
| `PaymentAllocation` | `paymentAmount`, `exchangeRate` — see A4 |
| `SalesOrder` | `currency`, `exchangeRate`, `baseTotalAmount` |
| `SupplierTransaction` | `currency`, `exchangeRate`, `baseAmount` |
| `ServiceJob` | `currency` |
| `Product` | `priceCurrency` (catalogue prices) |
| `Expense` (Phase 3) | `currency`, `exchangeRate`, `baseAmount` |

Line tables (`SalesOrderItem`, `SupplierPurchaseLine`, `Installment`) inherit the parent document's currency. A single document with mixed-currency lines is not a real case here, and permitting it would multiply complexity for nothing.

## A3. Base currency is USD

Every transaction stores a `baseAmount` — its value in USD at the rate used at transaction time.

Reports, margins, and totals must be comparable and summable across both currencies. Aggregating in LBP is not viable (see A7).

## A4. The crux — paying in one currency against a debt in another

The common Lebanese case: a customer owes USD and pays LBP, or the reverse.

**`PaymentAllocation.amount` stays denominated in the *obligation's* currency.**

```
Debt:                 1000.00 USD
Payment:          4,500,000    LBP   exchangeRate 90000   baseAmount 50.00 USD
PaymentAllocation:      50.00 USD    ← obligation currency
                   paymentAmount 4,500,000 LBP
                   exchangeRate  90000
```

**This is the most important decision in the document.**

`calculateDebtBalance` in [balances.ts](backend/src/features/financial/domain/balances.ts) subtracts the sum of non-voided allocations from the debt's original amount. Because allocations remain in the debt's own currency, **that function does not change at all.**

> **ADR-02 — derived balances — survives dual currency completely untouched.**
> No balance is stored. No balance becomes currency-ambiguous. Drift remains structurally impossible.

The conversion happens **once**, at allocation time, and is recorded permanently. It is never recomputed.

## A5. Rates are snapshotted, never looked up

The rate is written onto the transaction when it is created. **No read path may look up a current rate to value a historical record.**

```
ExchangeRate
  id, fromCurrency, toCurrency, rate Decimal(18,6),
  effectiveFrom, createdById, createdAt, note
```

Append-only, following the existing immutability discipline (ADR-05). Correcting a wrong rate means **adding a new row**, never editing an old one. Transactions already posted at a wrong rate are fixed through the existing `FinancialCorrectionAudit` path — which is precisely what that machinery exists for.

## A6. Rounding

| Currency | Decimals | Rounding |
|---|---:|---|
| USD | 2 | `ROUND_HALF_UP` (the codebase's existing default) |
| LBP | **0** | `ROUND_HALF_UP` to whole units |

**LBP has no circulating subunit.** Storing `4,500,000.37 LBP` is meaningless. The column stays `Decimal(12,2)` for schema uniformity; the domain layer enforces zero decimals on LBP.

`money.ts` becomes currency-aware: it keeps rejecting >2 decimals and requiring explicit rounding modes, and additionally rejects non-zero decimals on LBP.

**Confirm before implementation:** should LBP round further — to the nearest 1,000 — matching how prices are actually quoted? That is a business question, not a technical one.

## A7. The precision ceiling — a real constraint found in the code

[money.ts:13](backend/src/features/financial/domain/money.ts) enforces `MAX_SCHEMA_MONEY = 9999999999.99`, matching `Decimal(12,2)`. At roughly 90,000 LBP/USD that ceiling is about **$111,000 per value**.

- **Per transaction: fine.** No appliance sale approaches it.
- **Per aggregate: not fine.** A year of sales summed in LBP would exceed it easily.

**Therefore all aggregation, reporting, and margin computation happens in USD (`baseAmount`), with LBP shown as a presentation-layer conversion.** This is a constraint, not a preference — and another reason base currency is USD.

`Decimal(12,2)` is retained. Widening it would touch every money column for a case that only arises from aggregating in the wrong currency.

---

# PART B — VAT

**Default rate 11% (Lebanon). Not hardcoded anywhere.**

## B1. Configuration model — `TaxRate` + `TaxProfile`

Per the owner's explicit direction: **no single `vat = 11` field.**

```
TaxRate
  id, code            e.g. "LB_STANDARD", "LB_ZERO", "EXEMPT"
      name, nameAr
      ratePercent     Decimal(6,3)   -- 11.000
      effectiveFrom, effectiveTo
      isActive, createdById, createdAt

TaxProfile
  id, code            e.g. "STANDARD_GOODS", "EXEMPT_GOODS"
      name, nameAr
      taxRateId       -> TaxRate
      isDefault, isActive
```

`Product.taxProfileId` (nullable → falls back to the default profile).

**Why two tables rather than one.** `TaxRate` is what the law says; `TaxProfile` is what a product *is*. When Lebanon changes the rate, you add one `TaxRate` row and repoint the profile — you do not touch a single product. That is the difference between a rate change taking minutes and taking a migration.

## B2. VAT is calculated at LINE level

**Decision: line level. Document VAT = sum of line VAT amounts.**

Alternatives considered:

- **(a) Document level** — one rate applied to the invoice total. **Rejected:** it cannot represent a mixed invoice containing taxable and exempt products, which was an explicit requirement.
- **(b) Line level, VAT rounded once at document level** from an unrounded line sum. **Rejected:** the printed invoice's visible line VAT amounts would not add up to the printed total. A customer checking the arithmetic would find it wrong.
- **(c) Line level, VAT rounded per line, then summed.** **Chosen.**

**Rounding strategy, stated explicitly for `ARCHITECTURE_DECISIONS.md`:**

> VAT is computed per line, rounded to the currency's precision at the line (`ROUND_HALF_UP`; USD 2 dp, LBP 0 dp), and the document VAT is the exact sum of the rounded line amounts. The document total is never independently rounded — it is always the sum of its parts.

This guarantees the printed invoice is internally verifiable: every visible number adds up.

## B3. Snapshot on the line — never resolve historical VAT from configuration

Per the owner's direction, and matching how `SalesOrderItem` already snapshots `productNameSnapshot` and `skuSnapshot`:

`SalesOrderItem` and `SupplierPurchaseLine` each gain:

| Column | Meaning |
|---|---|
| `taxRateSnapshot` `Decimal(6,3)` | e.g. `11.000` — the rate actually charged |
| `taxCodeSnapshot` `String?` | e.g. `LB_STANDARD` — for reporting and audit |
| `unitPriceExVat` `Decimal(12,2)` | the price before VAT |
| `vatAmount` `Decimal(12,2)` | the VAT on this line, already rounded |
| `lineTotalIncVat` `Decimal(12,2)` | ex-VAT line total + VAT |

Computed **once**, at finalization, and never recomputed.

> **Changing a `TaxRate` cannot alter a historical invoice**, because no historical invoice reads `TaxRate`. This is the same discipline as ADR-15's cost snapshot, applied to tax.

## B4. VAT-inclusive and VAT-exclusive pricing

`Product.priceIncludesVat` (boolean, default to be confirmed with the owner — Lebanese retail typically quotes VAT-inclusive).

Both paths normalise to the **same stored shape** (`unitPriceExVat`, `vatAmount`, `lineTotalIncVat`), so every downstream consumer — reports, margin, documents — reads one representation regardless of how the price was entered.

```
Exclusive:  vat = round(priceEx x rate)          ; totalInc = priceEx + vat
Inclusive:  priceEx = round(priceInc / (1+rate)) ; vat = priceInc - priceEx
```

**The inclusive path derives VAT by subtraction, deliberately.** Computing it directly would let `priceEx + vat` differ from the price the customer was quoted by a cent. Subtraction makes the quoted price exact by construction.

## B5. Exempt and zero-rated

Distinct, and both required:

- **Zero-rated** — `ratePercent = 0`, VAT line shows `0.00`, included in taxable turnover.
- **Exempt** — no VAT applies; excluded from taxable turnover; shown as "Exempt" not "0.00".

The distinction lives in `TaxRate.code`, not in the rate value. A product with no `taxProfileId` inherits the default profile — it does **not** silently become exempt.

## B6. Sales VAT and input VAT

- **Sales (output) VAT** — from `SalesOrderItem.vatAmount`.
- **Purchase (input) VAT** — from `SupplierPurchaseLine.vatAmount`.
- **VAT report** — output VAT, input VAT, and net payable for a period, in USD base plus the transaction currency breakdown.

This is a **report**, not a ledger. **It does not require a General Ledger and none is being built** — see `GENERAL_LEDGER_DECISION.md`, which remains in force.

## B7. Returns and refunds must reverse the VAT originally charged

A return reverses `vatAmount` **from the line's snapshot** — never recomputed at today's rate.

This is why B3 matters: if the rate changed between sale and return, recomputation would refund the wrong VAT. The snapshot makes the correct answer the only representable one.

Phase 2's return flow (T4) must therefore reverse the snapshotted VAT, and its tests must cover a return spanning a rate change.

## B8. Currency × VAT — where discrepancies hide

VAT is computed in the **transaction currency**, then subtotal, VAT, and total are **each converted separately** to base and stored:

`baseSubtotal`, `baseVatAmount`, `baseTotalAmount`.

**Never re-derive base VAT from a converted total.** Converting the total and back-computing VAT introduces a rounding error that grows with the rate — at 90,000 LBP/USD, a single cent of LBP rounding becomes a visible USD discrepancy. Converting each component once and storing it makes the discrepancy unrepresentable.

This is the design behind invariant **INV-22**.

---

# PART C — CONSEQUENCES

## C1. What must never happen

Each becomes a test — `TESTING_STRATEGY.md` INV-16 to INV-22.

1. A historical transaction's value changing when the exchange rate changes.
2. A historical invoice's VAT changing when the configured rate changes.
3. A balance becoming currency-ambiguous.
4. Money lost in conversion rounding — allocations must still sum exactly to the payment in the payment's own currency.
5. A report mixing currencies without conversion.
6. A rate of zero, negative, or null being usable.
7. Document VAT not equalling the sum of its line VAT amounts.
8. A refund reversing a different VAT amount than was charged.
9. Aggregating in LBP and overflowing the precision ceiling (A7).

## C2. What is explicitly NOT being built

- **No General Ledger.** VAT reporting is a report over snapshotted line data. `GENERAL_LEDGER_DECISION.md` Option A+ stands unchanged.
- **No chart of accounts, journal entries, or double-entry.**
- **No tax authority e-filing integration.**
- **No multi-jurisdiction tax engine.** One country, a configurable rate table.

## C3. Effort and phase allocation

| Phase | Currency | VAT | Total |
|---|---:|---:|---:|
| **1** — schema, domain, rates, migration, tests | 45–60 | 20–28 | **65–88** |
| **2** — operational UI, documents, statements, returns | 25–35 | 18–25 | **43–60** |
| **3** — margin, valuation, dashboard, VAT report | 10–25 | 7–12 | **17–37** |
| **Total** | **80–120** | **45–65** | **125–185** |

**Why both foundations sit in Phase 1.** Every later phase depends on them. Building printed invoices in Phase 2 without currency and VAT means rebuilding them; building margin reporting in Phase 3 without them means rebuilding that too. Phase 1 is also where migrations are rehearsed against restored production data — the discipline this work needs most.

## C4. The migration

Every existing money row is USD with no VAT.

```
Migration required:    Yes
Backward compatible:   Yes, behaviourally. Existing data is all USD, no VAT,
                       and stays that way
Existing data impact:  Every money row stamped currency=USD, exchangeRate=1,
                       baseAmount=amount. Existing invoice lines get
                       taxRateSnapshot=0, vatAmount=0 — they were genuinely
                       sold without VAT, and that history must not be rewritten
Rollback strategy:     Drop the added columns, ExchangeRate, TaxRate, TaxProfile.
                       No amount is modified, so no financial data is lost
Backup required:       YES — verified, immediately before deployment
Validation check:      Sum of debts, sum of payments, every supplier balance and
                       every customer balance identical before and after;
                       all three integrity reports clean
```

**Historical invoices must not retroactively acquire VAT.** They were sold without it. Backfilling `taxRateSnapshot = 11` would falsify the record and misstate the first VAT return.

---

# PART D — WHAT THIS DOES TO THE FOUR MONTHS

**Read this before starting.**

| | Hours |
|---|---:|
| Previously planned (Phases 1–4) | 550–758 |
| Dual currency | +80–120 |
| VAT | +45–65 |
| **New total** | **675–943** |
| **Available** (6 d × 7 h × 16 wk) | **~672** |

**The plan no longer fits.** Even the optimistic end exactly consumes the budget with zero slack — and Phase 1 touches live financial tables, where slack is what prevents mistakes.

Feasibility moves from **Realistic** to **Aggressive**. Three honest options:

### Option 1 — Descope, keep four months *(recommended)*

Cut ~130–160 h of lower-value work:

| Cut | Hours | Why it is the right thing to cut |
|---|---:|---|
| Phase 3 T7 — audit log viewer | 20–26 | The audit *data* is already captured; per-record views already exist. Only the cross-cutting screen is missing |
| Phase 2 T7 — product categories | 20–26 | Convenience, not correctness. Search already works well |
| Phase 3 T6 — cash flow view | 20–26 | Valuable, but profit and margin matter more and ship first |
| Phase 3 T5 — reduce financial dashboard to a KPI strip | ~12 | The reports carry the detail; the dashboard is a summary |
| Phase 1 T11 — liveness predicates | 8–12 | Hygiene. Defer to Phase 5 |
| Phase 4 T1 — E2E: 5 journeys → 3 | ~12 | Already named as the Phase 4 descope |
| Phase 4 T5 — performance: spot checks not systematic | ~6 | Already named |
| **Total** | **~108–140** | |

Lands at roughly **567–803 h** against 672. Still tight at the top end, which is what the phase buffers absorb.

### Option 2 — Extend to five months

~840 h available. Comfortable, and nothing is cut.

### Option 3 — VAT in Phase 3 instead of Phase 1

**Only if the business is not yet VAT-registered.** Verified 2026-08-26: `vat`, `tax`, `taxNumber`, `taxRate` return **zero real matches** across `backend/src`, `frontend/src`, `schema.prisma`, `.env.example`, and `Setup-HomeConnect.ps1` — nothing indicates current registration.

Moving VAT later buys Phase 1 breathing room. **But it costs rework:** Phase 2's printed invoices would be built without VAT and then revised, which is exactly the "bolt it on later" the owner rejected for currency.

**Recommendation: Option 1**, with Option 2 held in reserve if Phase 1 overruns.

**If registration is imminent, say so** — it changes the ordering, because an unregistered business can ship VAT late, and a registered one cannot.
