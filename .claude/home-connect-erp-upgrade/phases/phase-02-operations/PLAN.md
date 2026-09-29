# PHASE 2 — OPERATIONS

**Weeks 5–9 · Budget 170–200 hours**

---

## Branch and checkpoint — **REVISED 2026-09-06**

All cumulative upgrade work remains on `develop`; `main` stays untouched until all four phases pass the final gate.

```
Required branch:  develop
Prerequisite:     acceptable Phase 1 REVIEW.md and SUMMARY.md checkpoint
```

**Do not implement this phase on `main` and do not create a Phase 2 branch.**

```bash
git checkout develop
git pull origin develop
git status
```

Phase 1's summary is the gate. A `NOT COMPLETE` verdict blocks Phase 2 implementation until the named blockers are resolved or the owner explicitly changes the gate. Phase 1 findings that alter this plan are listed below.

**Verify the base before starting:**

```bash
git branch --show-current          # develop
git pull origin develop
git log main --oneline -1          # must still be ac6ae9f — main is NOT touched
npm run test:ci                    # green, 0 skipped, before writing any Phase 2 code
```

---

## Objective

Close the operational gaps that BIRD currently wins on: **documents to hand people**, a **real return flow**, and **payables you can act on**.

## Governing principle

Every task here answers a question the shop faces daily. Nothing is included because a generic ERP has it.

**Scope note — updated 2026-08-26.** Multi-currency and VAT were **both APPROVED**. Their schema and domain foundations land in Phase 1 (T13, T14); this phase makes them **operational and visible on documents** — see T10. Product categories (T7) are **descoped to Phase 5** to fund that work (MASTER_PLAN §10).

**Scope note — added 2026-09-06, from the Phase 1 review.** Two Phase 1 findings change this phase's work, and one blocks it:

1. **T10 is larger than this plan says.** It was written as UI and documents with "no DB impact". Phase 1 delivered the currency *schema* on sales orders, sales order items, supplier transactions and supplier purchase lines — but both service layers still pass `Currency.USD` as a **literal** in every totals and VAT call, and neither validator accepts a currency. T10 therefore has to add currency to the sales-order and supplier-purchase **service and validator layers** before any UI or document work is meaningful. The DB impact is still none; the backend impact is not.
2. **T8's cost update must be made currency-aware in the same task.** `updateProductCostsFromPurchase` calls `divideMoney(..., Currency.USD, ...)` unconditionally. That is correct only while purchases are USD-only. The moment T10 allows an LBP purchase, it would write a two-decimal cost onto an LBP-priced product and the `products_lbp_whole_prices_check` constraint would reject the write, failing the purchase at the counter. **Fix it inside T10, not afterwards.**
3. **BLOCKING — the VAT inclusive/exclusive default is still undecided.** All 86 products carry `priceIncludesVat = false` with an 11% default profile, so every new line adds 11% on top of the entered price. If the shop's prices already include VAT, that is an 11% over-charge and an overstated VAT return. **Every document, statement and return in this phase renders that number.** Get the answer before T1, not before T10 — see SUMMARY.md C1.

---

## T1 · Printable sales invoice

**Objective.** Print or PDF a professional invoice for any sales order.

**Existing implementation.** **None.** No invoice document exists. The proven pattern is product labels: client-side rendering, `window.print()`, jspdf for PDF export.

**Problem.** BIRD prints invoices; Home Connect cannot. This is the most visible daily deficit — a customer buying an appliance expects paper.

**Proposed change.** ADR-17. A print-stylesheet HTML invoice template: shop header, customer details, line items with quantity/unit price/total, delivery fee, total, paid, remaining, payment terms, and — when a debt is linked — the due date. Bilingual EN/AR, consistent with the rest of the UI. `window.print()` primary, jspdf "save as PDF" secondary.

**Files.** New `frontend/src/features/documents/` slice; a route on the sales order details page; possibly a backend endpoint returning a document-shaped payload.

**DB impact.** None — unless the owner wants an invoice-number series distinct from `orderNumber`, which must be **asked, not assumed**.

**Backend impact.** Minimal. **Totals must come from the API.** A template doing its own arithmetic becomes a second source of financial truth.

**Security impact.** Invoices contain customer data — the route must respect existing auth.

**Tests required.** Snapshot test of the rendered document. A test asserting displayed totals match the API payload exactly.

**Dependencies.** None.

**Acceptance criteria.** Any sales order prints a correct, legible invoice on A4; totals match the order exactly; PDF export works; Arabic renders correctly.

**Effort.** 20–28 h · **Risk.** Low

---

## T2 · Printable payment receipt

**Objective.** Print a receipt voucher whenever money is taken.

**Existing implementation.** None. Payments are recorded correctly and produce no document.

**Problem.** A customer paying cash against a debt gets nothing to prove it. This is a trust issue as much as an operational one.

**Proposed change.** A receipt template — shop header, customer, date, amount, method, what it was allocated to, remaining balance after payment, and who received it. Printable from the payment confirmation and reprintable from payment history.

**Files.** `frontend/src/features/documents/`; entry points on the payment success dialog and the customer financial screen.

**Backend impact.** The receipt must show **what the payment was allocated to and the resulting balance** — that comes from the API, never from client arithmetic.

**Tests required.** Snapshot; allocation display correctness; reprint shows the same values as the original.

**Dependencies.** T1 (shared document infrastructure).

**Acceptance criteria.** Every payment can be printed at the time of payment and reprinted later, with identical values.

**Effort.** 14–18 h · **Risk.** Low

---

## T3 · Customer statement

**Objective.** Print a statement showing everything a customer owes and every payment made.

**Existing implementation.** The financial ledger is a filterable **register** of obligations. There is no `runningBalance` and no printable statement.

**Problem.** A customer asking "what do I owe and why?" cannot be handed an answer.

**Proposed change.** A date-ranged statement per customer: opening balance, every debt/installment/payment chronologically with a **running balance**, closing balance, and an aging summary. Printable and CSV-exportable.

**Files.** New backend report slice computing the running balance server-side; frontend document template.

**Backend impact.** **The running balance must be computed server-side**, consistent with ADR-02 — derived from transactions, never stored.

**Tests required.** Closing balance equals the independently-computed outstanding (INV-01). Ordering is deterministic for same-day entries. Voided payments are excluded but visible as voided.

**Dependencies.** T1.

**Acceptance criteria.** A statement reconciles exactly with the customer's outstanding balance; the running balance is arithmetically continuous.

**Effort.** 22–28 h · **Risk.** Low-Medium — ordering and opening-balance edge cases need care.

---

## T4 · Atomic return and refund flow

**Objective.** One reviewed action that returns goods, restores stock, and reverses the money.

**Existing implementation.** [sales-orders.service.ts:376-408](backend/src/features/sales/sales-orders/sales-orders.service.ts#L376). `RETURNED` requires the operator to have already unlinked the financial record and restored stock — three manual steps in a required order. **No refund or credit-note concept exists anywhere.**

**Problem.** CP-6-adjacent, and the largest operational gap in the sales module. Getting a customer's money back out is entirely manual, easy to get wrong, and leaves no coherent record of the return as a single event.

**Proposed change.**

**Ask the owner first — do not assume:**
- Are partial returns needed (some lines, not all)?
- Is a refund cash out, a credit against future purchases, or both?
- Can a returned item go back into sellable stock always, or does it depend on condition?

Then implement a single transaction that: validates the order is returnable; restores stock via the existing reversal machinery; reverses the financial position (cancel the debt or issue a refund/credit); writes a `RETURN` audit entry; and produces a printable return document.

**Files.** `sales-orders.service.ts`, a new return domain module, possibly a `Refund` or `CreditNote` model, plus frontend.

**DB impact.** Likely a new table for refunds/credits. **Design it with the owner's answers, not before.**

**Tests required.** Full return restores stock exactly once and clears the balance. Partial return (if in scope). A failed return leaves no partial state (INV-05). Returning an already-returned order is rejected. Audit history preserved.

**Dependencies.** Phase 1 T1 (CI), T7 (idempotency pattern — a return must not double-apply).

**Acceptance criteria.** A return is one reviewed action; stock and money both correct afterwards; the whole event is auditable; a return document prints.

**Effort.** 30–40 h · **Risk.** **Medium-High** — the most complex task in the phase, touching stock and money together. **The existing guards exist for good reasons; replace them with equivalent protection inside a transaction, never simply remove them.**

---

## T5 · Supplier payable due dates and aging

**Objective.** Answer "what must I pay this week?"

**Existing implementation.** `SupplierTransaction` has `transactionDate` and **no `dueDate`**. Customers have aging tiers; suppliers have none.

**Problem.** A cash-flow blind spot. The owner can see who owes them and how late, but not what they owe and when.

**Proposed change.** Add nullable `dueDate` to `SupplierTransaction`. Add a supplier aging report mirroring the customer receivables aging (reuse `receivables.tier.ts` logic). Add a dashboard alert for payables due soon.

**Files.** Migration; `schema.prisma`; supplier transaction service/validator/frontend; a new report slice; `dashboard-alerts.service.ts`.

**DB impact.** One additive nullable column. No backfill — existing rows keep a null due date, which correctly means "not tracked."

**Tests required.** Aging buckets correct at boundaries. Null due dates handled without crashing. Alert fires at the right threshold.

**Dependencies.** Phase 1 complete.

**Acceptance criteria.** A supplier aging report exists and matches the ledger; overdue payables appear in dashboard alerts.

**Effort.** 16–22 h · **Risk.** Low

---

## T6 · Customer credit limit

**Objective.** Stop unlimited credit being extended by accident.

**Existing implementation.** None. Zero matches for `credit limit`.

**Problem.** Any employee can create a debt of any size for any customer. BIRD has this. It is cheap.

**Proposed change.** Add nullable `creditLimit` to `Customer`. On debt creation and on linking a sales order to a debt, compare the projected outstanding against the limit. **Confirm with the owner: is exceeding it a hard block, or a warning an admin can override?** A warning-with-admin-override fits this codebase's existing step-up pattern better and is the recommended default.

**Files.** Migration; `schema.prisma`; `debts.service.ts`; `sales-orders.service.ts`; customer form; a warning UI.

**DB impact.** One additive nullable column. Null = no limit, preserving current behaviour exactly.

**Tests required.** Under limit passes. Over limit warns/blocks per the confirmed rule. Null limit is unrestricted. The check uses the **derived** outstanding, not a cached figure.

**Dependencies.** Phase 1 complete.

**Acceptance criteria.** A limit can be set per customer; exceeding it behaves per the confirmed rule; customers with no limit are unaffected.

**Effort.** 12–16 h · **Risk.** Low

---

## T7 · Product categories

**Objective.** Make a growing catalogue navigable.

**Existing implementation.** **No category model or field.** Only `brand` (a plain indexed string) and text search.

**Problem.** Browsing hundreds of products with only brand and search gets painful. BIRD has classifications.

**Proposed change.** A `Category` table (id, name EN/AR, parent for one level of nesting, active flag) and a nullable `categoryId` on `Product`. Category filter on the products page, category dimension on relevant reports.

**Ask first:** how does the owner actually group products — by type (fridges, washers), by room, or by supplier? Getting this wrong means re-categorising the whole catalogue later.

**Files.** Migration; `schema.prisma`; a new category feature slice; product form and list; report filters.

**DB impact.** New table plus one nullable FK. No backfill — uncategorised is valid.

**Tests required.** CRUD; assignment; filtering; a category with products cannot be hard-deleted (`onDelete: Restrict`, consistent with the rest of the schema).

**Dependencies.** Phase 1 complete.

**Acceptance criteria.** Products can be categorised and filtered; uncategorised products still work everywhere.

**Effort.** 20–26 h · **Risk.** Low

---

## T8 · Resolve the sales-order cash gap

**Objective.** Decide and implement how counter cash reaches the financial reports.

**Existing implementation.** `SalesOrder.paidAmount` records money received but **never creates a `Payment`**. `customer-financial-summary.repository.ts` has zero references to sales orders, so this money is absent from payment history, the "Customer Payments" and "Customers Who Paid" reports, and the `collected` metric feeding Monthly Review and the Analysis Portal.

**Problem.** CP-2 / R-03. Financial reports are incomplete by an amount nobody has measured.

**Proposed change.**

**Step 1 — measure it.** Query production: how much money sits in `SalesOrder.paidAmount` with no corresponding `Payment`, over what period, across how many orders? **Do not design before this number exists.** It determines whether this is a footnote or a serious gap.

**Step 2 — choose with the owner:**
- **(a)** Create a `Payment` row when counter cash is taken. Most correct; unifies all money into one model; needs care so the existing `assertNoFinancialLink` boundary is not broken.
- **(b)** Include sales-order cash in collected metrics without creating payments. Cheaper; leaves two money models.
- **(c)** Accept and document it, if the measured amount turns out to be negligible.

**Recommended: (a)**, if the measured amount is material.

**Files.** `sales-orders.service.ts`; `payments.service.ts`; report repositories; possibly a backfill migration.

**DB impact.** Option (a) may require backfilling historical `Payment` rows — **that is a data-correctness operation requiring a verified backup and the owner's sign-off.**

**Tests required.** INV-09 — the report reconciliation test must **encode the chosen answer** so the ambiguity cannot silently return.

**Dependencies.** Phase 1 complete (integrity reports needed to verify no double-counting is introduced).

**Acceptance criteria.** Every unit of money received appears exactly once in financial reporting — **not zero times, and not twice.**

**Effort.** 8 h (measure + decide) + 20–30 h (implement) · **Risk.** **Medium-High** — introducing double-counting here would be worse than the current omission. The Phase 1 integrity reports are the guard.

---

## T10 - Currency and VAT in operations and documents

**Objective.** Make USD/LBP and VAT usable at the counter and visible on every printed document.

**Existing implementation — corrected 2026-09-06.** Phase 1 T13/T14 delivered the schema, the domain modules, the ADMIN-only exchange-rate screen, and — after the review fix in `20260906150000` — the seeded tax configuration. What it did **not** deliver, contrary to this task's original wording:

- `sales-orders.service.ts` and `supplier-purchases.service.ts` pass `Currency.USD` as a literal to every `calculateVatLine` and totals call. Neither validator accepts a `currency` field.
- Debts, payments, payment allocations and installment plans **are** currency-aware, including cross-currency allocation. Sales orders and supplier purchases are not.
- `sales_orders` has no VAT total column; the document VAT is `totalAmount − deliveryFee − itemsSubtotal`, or the sum of `sales_order_items.vatAmount`. Both are correct; pick one and use it everywhere.
- The delivery fee is currently **outside** the VAT base. Confirm that is intended before it appears on a printed invoice.

**No operational UI and no document output yet.**

**Problem.** A foundation nobody can reach is not a feature. This is the phase where the shop actually transacts in two currencies and charges VAT.

**Proposed change.**

0. **Backend currency plumbing first.** Accept `currency` and `exchangeRate` in the sales-order and supplier-purchase validators, thread them through `prepareItems`, `calculateVatAwareOrderTotals`, the fingerprint builder and the repositories, and replace every `Currency.USD` literal in those two services. Make `updateProductCostsFromPurchase` round in the purchase's currency. **Until this is done, no amount of UI makes the shop transactable in LBP.**
1. **Currency selection** on sales orders, supplier purchases, and payments, defaulting to the shop's usual currency (confirm which) with the operative rate pre-filled and overridable per transaction.
2. **VAT on the sales screen** — line VAT visible as it is entered, so the operator sees the total the customer will pay before confirming.
3. **Documents (T1, T2, T3) must show the VAT breakdown**: subtotal before VAT, VAT amount, total including VAT — plus the currency and, where the payment currency differs from the invoice currency, the rate used.
4. **Statements** show each entry in its original currency with the base equivalent.
5. **Returns (T4) reverse VAT from the line snapshot**, never from the current rate.

**Why it matters.** A printed invoice is the artefact a Lebanese customer checks by hand. Every visible number must add up, in the currency they paid.

**Files.** `features/documents/`, sales order and supplier purchase forms, payment dialogs, statement report, return service.

**DB impact.** None — Phase 1 delivered the schema.

**Security impact.** None new.

**Tests required.** INV-21 (document VAT reconciles), INV-22 (currency x VAT), **INV-23 (refund reverses the VAT originally charged)**, plus document snapshot tests asserting the VAT breakdown renders correctly in both currencies.

**Dependencies.** Phase 1 T13 and T14 merged; this phase's T1, T2, T3, T4.

**Acceptance criteria.** A VAT-inclusive LBP sale prints an invoice whose subtotal, VAT and total add up exactly; a return reverses the VAT actually charged even after a rate change; a statement reconciles across currencies.

**Effort.** ~~43-60 h~~ **55-75 h** (revised 2026-09-06: step 0 — the backend currency plumbing on two services, their validators and the cost update — was not in the original estimate) - **Risk.** Medium-High - touches the return flow (T4), which is already the riskiest task in the phase, and now also touches the sales-order and supplier-purchase write paths.

---

## T9 · Phase 2 hardening and buffer

Review findings, UAT feedback on the new documents, polish.

**Effort.** 20–30 h

---

## Summary

| Task | Effort | Risk | Closes |
|---|---:|---|---|
| T1 Sales invoice | 20–28 | Low | BIRD gap #1 |
| T2 Payment receipt | 14–18 | Low | BIRD gap |
| T3 Customer statement | 22–28 | Low-Med | BIRD gap |
| T4 Atomic return/refund | 30–40 | Med-High | Largest sales gap |
| T5 Supplier due dates + aging | 16–22 | Low | Cash-flow blind spot |
| T6 Credit limit | 12–16 | Low | BIRD gap |
| ~~T7 Categories~~ | ~~20–26~~ | — | **DESCOPED** to Phase 5 — MASTER_PLAN §10 |
| T8 Sales cash gap | 28–38 | Med-High | CP-2 |
| **T10 Currency + VAT in operations** | **55–75** | Med-High | **ADR-19/20/21** |
| T9 Buffer | 20–30 | — | — |
| **Total** | **217–295 h** | | |

**This substantially exceeds the 170–200 h budget.** T7 (categories) is already descoped per MASTER_PLAN §10, recovering 20–26 h and landing at ~197–269 h. T10 grew again on 2026-09-06 once the Phase 1 review established that the currency work stops at the schema on the two busiest write paths. **If this phase has to be cut, cut T6 and take MASTER_PLAN §10 Option 2 rather than compressing T10 step 0** — a half-plumbed currency is worse than none, because the columns imply a capability the services do not have.

If time still runs short: **defer T6 (credit limits) next**. **Never defer T4, T8, or T10** — returns, the cash gap, and currency/VAT are correctness and completeness, and T10 is what makes the whole Phase 1 foundation reachable.

**Definition of done:** invoices, receipts, and statements print correctly **with a VAT breakdown, in the transaction currency** · a return is one reviewed action leaving stock and money right **and reversing the VAT originally charged** · payables have due dates and aging · every unit of money appears exactly once in reporting.

---

## Migration disclosure

Four tasks change the schema. Each must carry this block in its commit body and the PR.

**T4 — return / refund model** *(shape depends on the owner's answers; do not design before asking)*
```
Migration required:    Yes
Backward compatible:   Yes — new table(s); existing rows untouched
Existing data impact:  None. Historical returns remain as they were recorded
Rollback strategy:     Drop the new table(s); no existing data depends on them
Backup required:       Yes
Validation check:      Full return restores stock exactly once and clears the
                       balance; inventory reconciliation clean afterwards
```

**T5 — supplier `dueDate`**
```
Migration required:    Yes
Backward compatible:   Yes — nullable
Existing data impact:  None. Existing rows keep NULL = "not tracked", and are
                       excluded from aging rather than defaulted into a bucket
Rollback strategy:     Drop the column
Backup required:       Yes (standard)
Validation check:      Supplier aging report matches the ledger; supplier
                       financial integrity report still clean
```

**T6 — customer `creditLimit`**
```
Migration required:    Yes
Backward compatible:   Yes — nullable; NULL = no limit = today's behaviour exactly
Existing data impact:  None. No existing customer's behaviour changes
Rollback strategy:     Drop the column
Backup required:       Yes (standard)
Validation check:      A customer with NULL limit is unrestricted; one over
                       limit behaves per the confirmed rule
```

**T7 — categories**
```
Migration required:    Yes
Backward compatible:   Yes — new table plus one nullable FK
Existing data impact:  None. Every product starts uncategorised, which is a
                       valid permanent state
Rollback strategy:     Drop the FK then the table
Backup required:       Yes (standard)
Validation check:      Uncategorised products still appear in every screen and
                       report; a category in use cannot be hard-deleted
```

**T8 — possible historical backfill.** If option (a) is chosen, backfilling `Payment` rows is a **data-correctness operation, not a schema change**: it requires a verified backup, must be idempotent (safe to run twice), must produce a before/after report of affected totals, and needs explicit owner sign-off. Run the customer financial integrity report before and after; **any change in reported outstanding must be explained before merge.**

---

## Suggested commit sequence

```
feat: add shared document rendering infrastructure          (T1)
feat: add sales invoice print layout                        (T1)
test: snapshot sales invoice and assert totals match API    (T1)
feat: add payment receipt print layout                      (T2)
feat: add customer statement with running balance           (T3)
test: reconcile statement closing balance with outstanding  (T3)
feat: add supplier maturity dates                           (T5)
feat: add supplier aging report and due-soon alert          (T5)
feat: add atomic sales order return and refund              (T4)
test: cover return stock and money reversal atomicity       (T4)
feat: add customer credit limits                            (T6)
feat: select transaction currency on sales and purchases    (T10)
feat: show vat breakdown on invoices and receipts           (T10)
test: assert refund reverses the vat originally charged      (T10)
fix: record counter cash as a payment                       (T8)
test: assert each unit of money is reported exactly once    (T8)
```

Keep T4 and T8 commits **separate from everything else** — they are the two that touch stock and money together, and they are the two most likely to need reverting.

---

## Phase completion — **REVISED 2026-09-06**

Nothing merges into `main` at the end of this phase. Phase 2 closes with a reviewed and pushed checkpoint on `develop`.

```
1. REVIEW.md completed
2. Tests passing (npm run test:ci, 0 skipped)
3. CI passing on develop
4. SUMMARY.md written with evidence, outstanding issues, and verdict
5. Coherent work committed and pushed to develop
6. main tip confirmed unchanged
7. Phase 3 continues on develop only if the verdict permits it
```

```bash
git checkout develop
git pull origin develop
git push origin develop
```

Do not create another branch. The final `develop → main` merge is considered once, after Phase 4 is complete and explicitly approved.
