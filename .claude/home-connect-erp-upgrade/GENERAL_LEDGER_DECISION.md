# GENERAL LEDGER DECISION

**Question:** does Home Connect need full accounting / general-ledger functionality?

**Recommendation: Option A+ — keep the operational ledger, and add margin reporting. Do not build a general ledger.**

---

## 1. What the existing ledger actually is

Before recommending anything, what is already there.

Home Connect's "ledger" is an **operational obligations register**, not an accounting ledger. `FinancialLedgerItem` is a union of `DEBT | INSTALLMENT_PLAN | PAYMENT` with allocations attached ([financial-ledger.types.ts](backend/src/features/financial/ledger/financial-ledger.types.ts)).

It already has properties that a double-entry system is usually introduced to provide:

| Property normally sought from double-entry | Already present? | How |
|---|---|---|
| Balances that cannot drift | ✔ | Derived from non-voided allocations; **never stored** |
| Immutable financial history | ✔ | Void-not-delete; `voidedAt` / `cancelledAt` flags |
| Full traceability of every change | ✔ | 5 audit tables, mandatory reasons, before/after JSON, actor + IP |
| Reversal without erasure | ✔ | Compensating movements; correction-linked allocation voids |
| Exact decimal arithmetic | ✔ | `Decimal(12,2)` throughout; zero float money columns |
| Money conserved across an operation | ✔ | Allocations sum to the payment; enforced in `payment-allocation.ts` |

**This is the important finding for this decision.** The usual argument for double-entry in a small business is "we need a trustworthy, self-checking financial record." Home Connect already has one — arrived at by a different and, for this use case, simpler route.

**What it genuinely lacks is not double-entry. It is *revenue and cost measurement*.**

---

## 2. The actual gap

Verified by exhaustive search: no `COGS`, no `grossProfit`, no `margin` anywhere. The only `profitAmount` is a *forward-looking pricing formula output*, not realized profit.

So the owner cannot answer:

- How much did the business make this month?
- What is the margin on this product / order / brand?
- What is the stock on hand worth?
- What did the business spend on anything that is not inventory?

**But the data to answer the first three is already in the database:**

| Needed | Already stored |
|---|---|
| Revenue per line | `SalesOrderItem.unitPrice`, `quantity`, `lineTotal` |
| Cost per unit | `Product.costPrice` and, more accurately, `SupplierPurchaseLine.unitPrice` |
| What was actually sold and when | `SalesOrderStockFulfillment` (quantity + product + date, with `@unique` movement links) |
| Stock on hand | `Product.stockQuantity`, reconcilable against `StockMovement` |

**Gross margin reporting is a query and a screen, not a subsystem.** Only operating expenses are genuinely missing — and those need one small table, not a chart of accounts.

---

## 3. The three options

### Option A — Operational ledger only (status quo)

Keep debts, payables, invoices, payments, running balances. Use an external accountant for official accounting.

| | |
|---|---|
| **Cost** | 0 hours |
| **Risk** | None |
| **Gain** | None |
| **Leaves** | The owner still cannot see profit — the biggest gap in the audit |

**Rejected as-is.** Correct foundation, incomplete outcome.

---

### Option A+ — Operational ledger + margin and expense reporting · **RECOMMENDED**

Add, without introducing accounts or double-entry:

1. **Cost snapshot at fulfillment.** Add `unitCostSnapshot` to `SalesOrderStockFulfillment`, captured when stock is deducted. This is the one schema change and it is essential: without it, margin is recomputed against a cost that changes later, and last month's profit silently rewrites itself.
2. **Cost-price update from receipts** (fixes CP-8, which must be fixed for margin to mean anything).
3. **A Profit & Margin report** — revenue, cost, gross margin by period / product / brand / channel.
4. **An inventory valuation report** — `stockQuantity × costPrice`, and a total.
5. **A minimal `Expense` table** — date, category, amount, note, optional supplier. Not an account: a labelled cash-out record.
6. **An owner's financial dashboard card** — revenue, gross margin, expenses, net, this month vs last.

| | |
|---|---|
| **Cost** | **55–75 hours** |
| **Risk** | **Low.** One additive column, one new table, otherwise read-only reporting. Nothing existing changes behaviour |
| **Gain** | **Closes the single most important gap in the audit** |
| **Reversible** | Yes — a report can be deleted; a chart of accounts cannot |

**Why the cost snapshot is non-negotiable:** margin computed live against `Product.costPrice` is not a fact, it is a moving opinion. Snapshotting cost at fulfillment makes historical profit immutable — which is the same discipline the rest of the codebase already applies everywhere else.

---

### Option B — Lightweight accounting engine

Add Cash, Bank, AR, AP, Sales, Inventory, COGS, Expenses accounts and generate automatic journal entries from every business event.

| | |
|---|---|
| **Cost** | **180–260 hours** — over a third of the entire four-month budget |
| **Risk** | **High** |
| **Gain** | Marginal over A+ for this business |

**The risk is specific and worth stating plainly.** Every business event — sale, payment, receiving, void, correction, prepaid delivery, remainder-debt creation, receiving reversal — must post a balanced entry. Home Connect has **9 financial correction actions, 15 sales audit actions, 11 stock movement types, and reversal paths on nearly everything.** Each is a posting rule, and each reversal is a second posting rule.

Getting one wrong creates an unbalanced ledger that **disagrees with the operational data that is currently correct**. The system would then have two sources of truth where it currently has one reliable one. That is a strict downgrade in trustworthiness, bought with 200+ hours.

And crucially: **it produces almost nothing A+ does not.** Profit, margin, and expenses come from A+ at a quarter of the cost.

**Rejected.**

---

### Option C — Full accounting ERP

Chart of accounts, journal entries, general ledger, trial balance, P&L, balance sheet, VAT accounting, opening balances, period closing, adjustments, reversals.

| | |
|---|---|
| **Cost** | **400–600+ hours** — the entire four months, and probably more |
| **Risk** | **Very high** — correctness, compliance, and total opportunity cost |
| **Gain** | Duplicates what the external accountant already does |

Building this means shipping **no printed invoice, no receipt, no statement, no returns flow, no CI, and no rehearsed restore** — every item that actually blocks replacing BIRD. It trades all of the operational gaps for an accounting system the business has not asked for and a professional already provides.

There is no concrete business need on the table for C. Per the brief's own instruction, it is not recommended.

**Rejected.**

---

## 4. Comparison

| | A (status quo) | **A+ (recommended)** | B (lightweight) | C (full) |
|---|---|---|---|---|
| Hours | 0 | **55–75** | 180–260 | 400–600+ |
| Share of the ~670h budget | 0% | **~10%** | ~33% | ~75–90% |
| Risk to existing correctness | none | **very low** | high | very high |
| Owner sees profit | ✘ | **✔** | ✔ | ✔ |
| Owner sees margin by product | ✘ | **✔** | ✔ | ✔ |
| Stock valuation | ✘ | **✔** | ✔ | ✔ |
| Expense tracking | ✘ | **✔ (simple)** | ✔ | ✔ |
| Trial balance / balance sheet | ✘ | ✘ | partial | ✔ |
| VAT compliance | ✘ | ✘ | ✘ | ✔ |
| Blocks the operational work? | no | **no** | **yes** | **yes** |
| Reversible if wrong | — | **yes** | hard | no |

---

## 5. Recommendation

**Adopt A+.**

**Reasoning:**

1. **The stated goal is a better system for this business, not a more complete ERP.** A+ closes the gap the owner actually feels — "did I make money?" — at 10% of the budget.
2. **The trustworthy-record argument for double-entry does not apply here**, because derived balances, immutable history, and five audit tables already deliver it by another route.
3. **The data already exists.** Cost, price, quantity, and fulfillment dates are all stored. This is reporting work, not modelling work.
4. **B and C would degrade the system's greatest strength.** Home Connect's advantage over BIRD is that its financial data cannot drift. Adding a second parallel representation that must be kept in agreement introduces precisely the drift class currently eliminated.
5. **A+ leaves the door open.** Cost snapshots and an expense table are exactly what a future ledger would need. If the business later becomes VAT-registered or takes on outside investment, C becomes a *migration* rather than a *rewrite*.
6. **Opportunity cost is decisive.** The 130–190 hours saved versus B pay for printed invoices, receipts, statements, an atomic return flow, supplier due dates, CI, and a rehearsed restore — every one of which blocks replacing BIRD, and none of which a general ledger provides.

---

## 6. The one condition that would change this

**If the business is or becomes VAT-registered**, a compliant VAT invoice and VAT return are legal requirements, not preferences. That does not immediately justify C, but it does require VAT-rate fields on sales and purchase lines and a VAT summary report — roughly 40–60 hours, and **schema-level**, so it must be decided before Phase 1 rather than retrofitted.

**This must be confirmed with the business owner before Phase 1 begins.** It is one of the two blocking questions in `MASTER_PLAN.md` §14 — the other being dual currency.
