# PHASE 3 — PROMPTS

Prepend the **Standing Rules** from `phases/phase-01-core-integrity/PROMPTS.md` to every implementation prompt.

**Branch:** `develop` — continue only after an acceptable Phase 2 checkpoint.

---

## Git safety — prepend to every prompt that CHANGES CODE

Prompt 01 is investigative and does not need this block.

```
Git safety:
- Confirm current branch is develop.
- Do not modify code on main.
- Check git status before editing.
- Preserve unrelated local changes.
- Commit completed coherent work to develop.
- Do not create a new branch unless explicitly instructed.

Confirm Phase 1 T8 (cost prices update from receipts) and Phase 2 T8 (the sales
cash decision) are present and accepted before margin implementation.
```

---

## Prompt 01 — Trace what data exists for margin calculation

```
Do not change any code. Investigation only.

Determine exactly what is available to compute profit today.

  1. Where is the price a customer PAID recorded? (Check SalesOrderItem —
     unitPrice, lineTotal, and the snapshot fields.)
  2. Where is the cost the shop PAID recorded? (Check Product.costPrice and
     SupplierPurchaseLine.unitPrice. Report how they differ.)
  3. What does SalesOrderStockFulfillment record? List every column.
  4. Is cost recorded anywhere at the moment of sale? Report plainly yes or no.
  5. What happens to reported margin for a past sale if Product.costPrice is
     updated today? Trace it precisely.
  6. How would a RETURNED order affect a margin calculation?
  7. How many sales order fulfillments exist in production, over what date
     range? (This tells us how much history will have no cost snapshot.)

Then answer: if we built a profit report today using Product.costPrice, name
every way it could report a wrong number.

Write to
.claude/home-connect-erp-upgrade/phases/phase-03-control-and-intelligence/MARGIN_DATA_TRACE.md.
```

---

## Prompt 02 — Add unit cost snapshot at fulfillment

```
[STANDING RULES]

Prerequisite: read MARGIN_DATA_TRACE.md.

Goal: record the cost of goods at the moment stock is deducted, so historical
margin can never silently change.

CRITICAL CONSTRAINT: this touches sales-order-inventory.service.ts, which
contains the compare-and-set stock logic — the most safety-critical code in the
system. Change NOTHING about the CAS logic, the conflict handling, or the
movement writes. You are adding one field capture inside the existing
transaction.

Step 1 — Migration adding unitCostSnapshot Decimal(12,2) NULL to
sales_order_stock_fulfillments. Additive only. NO BACKFILL — historical rows
keep null, which correctly means "cost unknown at the time." Do not invent
history.

Step 2 — Capture Product.costPrice into the snapshot inside the EXISTING
runFinancialTransaction in the deduction path. Do not open a second transaction.

Step 3 — Handle a product with no costPrice: store null, do not store zero.
Zero is a claim that the goods were free; null is an honest absence.

Step 4 — Tests (in the DB integration suite):
  - deducting stock captures the current costPrice
  - changing costPrice afterwards does NOT change the snapshot (INV-10)
  - a product with no cost stores null, not zero
  - reversing a fulfillment does not alter the snapshot
  - the existing CAS conflict behaviour is unchanged — run every existing
    inventory test and report the results

Step 5 — Report how many existing fulfillment rows have a null snapshot and
their date range. Reports in T3 must handle these explicitly.
```

---

## Prompt 03 — Add operating expense recording

```
[STANDING RULES]

ASK ME FIRST: what expense categories does this business actually have?
(Rent, salaries, utilities, fuel, transport, maintenance, other?) Do not invent
a generic list — a wrong list means re-categorising later.

Also ask: should an expense optionally link to a supplier, or is it always
standalone?

Step 1 — Migration: an expenses table with date, category, amount
Decimal(12,2), note, optional supplierId, createdById, createdAt, updatedAt,
and soft-delete columns matching the schema's existing conventions. Use
onDelete: Restrict on all FKs, consistent with the rest of the schema.

This is a labelled cash-out record, NOT an accounting account. Do not add
account codes, debit/credit, or anything resembling a chart of accounts. See
GENERAL_LEDGER_DECISION.md.

Step 2 — A features/expenses/ slice following existing conventions (routes,
controller, service, repository, validator, types), with CRUD and a period list.

Step 3 — Frontend: an expenses page with entry, list, filter by period and
category, and a period total.

Step 4 — Authorization: decide and tell me whether employees may record
expenses. My recommendation: employees record, admin edits and deletes.

Step 5 — Tests: CRUD; soft delete preserves history; money is Decimal(12,2);
period filtering is correct at boundaries; role checks enforced.
```

---

## Prompt 04 — Build the profit and margin report

```
[STANDING RULES]

Prerequisites: Prompts 02 and 03 complete.

Goal: answer "did the business make money this period?"

THE RISK IN THIS TASK IS A PLAUSIBLE WRONG NUMBER. A report that is obviously
broken gets fixed. A report that looks right and is wrong gets used to make
decisions. Every design choice below exists to prevent the second.

Step 1 — Study the existing report-rows pattern
(features/reports/rows/) and follow it exactly.

Step 2 — Compute for a period:
  - revenue: from fulfilled, non-returned sales order items
  - COGS: from unitCostSnapshot × quantity on fulfillments
  - gross margin: absolute and percentage
  - operating expenses: from the expenses table
  - net: gross margin − expenses

Step 3 — NULL SNAPSHOTS. Historical fulfillments have no cost. You MUST:
  - exclude those lines from COGS and margin
  - report the excluded LINE COUNT and excluded REVENUE prominently in the
    report output, not in a footnote
  Do NOT substitute Product.costPrice for missing snapshots. That would produce
  a plausible wrong number, which is the exact failure this step prevents.

Step 4 — RETURNS. Confirm with me how a returned order should be treated:
reduce both revenue and COGS in the original period, or in the return period?
State the rule you implemented.

Step 5 — Breakdowns: by product, brand, category (if Phase 2 T7 shipped), and
sales channel. CSV export like every other report.

Step 6 — Tests:
  - margin equals revenue − COGS on known fixtures
  - null-snapshot lines excluded and counted correctly
  - returns handled per the confirmed rule
  - report totals reconcile against independently summed source orders (INV-09)
  - a period with no sales returns zeroes, not an error

Step 7 — Run it against real data. Manually verify ONE product's margin by hand
from its source orders. Report both numbers side by side. If they differ, stop
and investigate rather than adjusting the report to match.
```

---

## Prompt 05 — Build the inventory valuation report

```
[STANDING RULES]

Goal: answer "what is my stock worth?"

Step 1 — Compute stockQuantity × costPrice per product for products where
trackStock is true. Subtotal by category and brand. Grand total.

Step 2 — EXCLUSIONS must be explicit, not silent:
  - products with no costPrice: exclude, and report the count and their unit
    quantity
  - products with trackStock false: exclude (they have no meaningful quantity)
  Show both exclusion counts in the report output.

Step 3 — CSV export, following the existing report pattern.

Step 4 — Tests: valuation matches a manual calculation on fixtures; products
without cost are excluded and counted; untracked products excluded; the grand
total equals the sum of the subtotals.

Step 5 — Run it against real data. Cross-check the total unit count against the
inventory summary endpoint — they must agree. Report both.
```

---

## Prompt 06 — Build the owner's financial dashboard section

```
[STANDING RULES]

Prerequisites: Prompts 04 and 05 complete.

Goal: the owner opens the dashboard and sees whether the business is making
money.

Step 1 — Study features/dashboard/ structure and dashboard-cache.ts. Follow
both exactly. These are expensive aggregates and MUST be cached.

Step 2 — Add a financial section with: revenue this month vs last, gross
margin, expenses, net, cash collected, outstanding receivables, outstanding
payables, stock value.

Step 3 — CRITICAL: every KPI must EQUAL the corresponding report figure
exactly. A dashboard that disagrees with its own reports destroys trust in
both. Where possible, call the same service the report calls rather than
writing a second calculation.

Step 4 — ADMIN-only, consistent with reports. An employee must not see business
profit. Confirm the frontend hides the section rather than showing an empty one.

Step 5 — Tests:
  - every KPI equals the corresponding report value for the same period
  - the cache invalidates correctly
  - employees get 403 and the section is hidden in their UI

Step 6 — Load the dashboard against real data and compare each KPI against its
report. Report every pair. Any mismatch is a blocker.
```

---

## Prompt 07 — Build the cash flow view

```
[STANDING RULES]

Prerequisite: Phase 2 T8 (the sales-order cash gap) must be resolved. Read
SALES_CASH_GAP.md and confirm which option was implemented before starting.

Goal: what came in, what went out, and what is due next.

THE RISK IS DOUBLE-COUNTING with the Phase 2 T8 change. State explicitly, before
coding, how you are avoiding it.

Step 1 — Cash in for a period: customer payments, plus counter cash per the
Phase 2 T8 resolution. If T8 created Payment rows, counter cash is ALREADY in
payments — do not add it again. Confirm which case applies and show me the code.

Step 2 — Cash out: supplier payments plus expenses.

Step 3 — Net movement, and a forward view of receivables and payables due in
the next 30 days (using Phase 2 T5 supplier due dates).

Step 4 — Tests:
  - cash in matches the collected metric exactly
  - cash out matches supplier payments plus expenses
  - NO DOUBLE-COUNTING: write a test that would fail if counter cash were
    counted twice
  - the forward view uses real due dates and excludes cancelled obligations

Step 5 — Run against real data. Reconcile cash in against the customer payments
report. Report both numbers.
```

---

## Prompt 08 — Build the unified audit log viewer

```
[STANDING RULES]

Goal: answer "who changed what, when, and why" from one screen.

Step 1 — Inspect all five audit tables: FinancialCorrectionAudit, ServiceAudit,
SalesAudit, SupplierAudit, SupplierReceivingAudit. Report the columns they share
and where they differ.

Step 2 — Build a read-only unified view: filter by actor, date range, record
type, and action. Union across all five.

Step 3 — PERFORMANCE: check the existing indexes before writing the query. Every
audit table has changedAt indexed — confirm your query uses it. Report the query
plan for a filtered search if the tables are large.

Step 4 — ADMIN-only. Audit data reveals everything about the business.

Step 5 — Frontend: a filterable, paginated list showing actor, timestamp,
record type, action, reason, and a link to the affected record. Show the
before/after values on expand.

Step 6 — Tests: filters work across all five tables; non-admins get 403;
pagination is correct and stable; reason and actor always display.

Step 7 — Confirm this view is strictly READ-ONLY. There must be no path to edit
or delete an audit record. Verify no such endpoint exists.
```

---

## Prompt 09 — Phase 3 review

```
Do not change any code. Review only.

Review all Phase 3 work against
.claude/home-connect-erp-upgrade/phases/phase-03-control-and-intelligence/REVIEW.md.

Then:
  1. Run npm run test:ci; report the full output.
  2. Run all three integrity reports; report the results.
  3. RECONCILIATION CHECK — the most important part of this review:
     - manually compute one product's margin from source orders; compare
       against the profit report
     - compare each dashboard KPI against its corresponding report
     - compare cash-flow cash-in against the customer payments report
     - compare inventory valuation total units against the inventory summary
     Report every pair of numbers. Any mismatch is a blocker.
  4. Confirm null cost snapshots are excluded and COUNTED, never silently
     substituted. Report the excluded count and value.
  5. Confirm no chart of accounts, journal entry, or debit/credit code was
     introduced. Grep and report.
  6. Confirm every Phase 3 acceptance criterion is met, citing evidence.
  7. Review the Phase 3 commits on develop. Confirm the T1 cost
     snapshot was committed alone — it is the schema change and it touches the
     compare-and-set stock path.
  8. Confirm nothing was committed directly to main.

Classify as COMPLETE, COMPLETE WITH FOLLOW-UP, or NOT COMPLETE,
with justification. Apply REVIEW.md's NOT COMPLETE conditions literally — in
particular, any report figure disagreeing with a hand-computed value, or any
chart-of-accounts/journal-entry code, is NOT COMPLETE.
```

---

## Prompt 10 — Record and push the Phase 3 checkpoint

```
Do not change any code.

Prerequisite: Prompt 09 returned COMPLETE or COMPLETE WITH FOLLOW-UP.

Step 1 — git push origin develop

Step 2 — Update SUMMARY.md from actual evidence:
  - database/schema changes: unitCostSnapshot (T1) and the expenses table (T2),
    each with its full migration disclosure block from PLAN.md
  - state explicitly that T1 has NO BACKFILL, that historical fulfillments keep
    NULL, and how many rows that affects with their date range
  - business rules changed: the owner can now see profit — include the actual
    figures for a completed month and state that they were reconciled by hand
  - SCREENSHOTS of the profit report and the financial dashboard section
  - a diff summary for sales-order-inventory.service.ts showing the snapshot is
    a PURE ADDITION and the compare-and-set logic is untouched
  - tests executed: full npm run test:ci output including skipped count
  - the reconciliation evidence from Prompt 09 step 3 — every pair of numbers
  - confirm no chart-of-accounts or journal-entry code was introduced

Step 3 — Show me the summary checkpoint before continuing.

Do not merge into main.
```
