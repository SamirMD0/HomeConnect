# PHASE 2 — PROMPTS

Prepend the **Standing Rules** from `phases/phase-01-core-integrity/PROMPTS.md` to every implementation prompt.

**Branch:** `develop`. Phase 2 begins only after an acceptable Phase 1 checkpoint; `main` remains untouched.

**Before the first code prompt,** read [phase-01-core-integrity/SUMMARY.md](../phase-01-core-integrity/SUMMARY.md). Phase 1's outstanding issues remain in cumulative `develop` history, and three of them (C1, I3, I4) change what these prompts must do.

---

## Git safety — prepend to every prompt that CHANGES CODE

Investigative prompts (01, 05, 09, 13) do not need this block.

```
Git safety:
- Confirm current branch is develop.
- Do not modify code on main.
- Check git status before editing.
- Preserve unrelated local changes.
- Commit completed coherent work to develop.
- Do not create a new branch unless explicitly instructed.
```

---

## Prompt 01 — Study the existing print pipeline

```
Do not change any code. Investigation only.

Product labels already print successfully. Learn that pipeline so documents can
reuse it rather than inventing a second one.

  1. Read frontend/src/pages/products/ProductLabelPage.tsx and
     ProductLabelsPage.tsx. How is a label rendered and printed?
  2. How is print CSS handled — a print stylesheet, a media query, a dedicated
     print route?
  3. How does the bulk A4 sheet tile labels, and how does PDF export work
     (jspdf usage)?
  4. How does Electron handle window.print()? Check desktop/src for any print
     configuration.
  5. Read frontend/src/shared/labels/ and report what is reusable.
  6. How is Arabic text handled in the printed output? Any RTL handling?

Then propose the smallest reusable document infrastructure for invoices,
receipts, and statements — what to extract from the label code and what to
build new.

Write to
.claude/home-connect-erp-upgrade/phases/phase-02-operations/PRINT_PIPELINE.md.
```

---

## Prompt 02 — Build the sales invoice document

```
[STANDING RULES]

Prerequisite: read PRINT_PIPELINE.md.

Goal: print or PDF a professional invoice for any sales order.

BEFORE CODING, ask me:
  a) What shop details appear in the header (name, address, phone, tax number)?
  b) Should the invoice number be the existing orderNumber, or a separate
     series? (A separate series is a schema change — do not assume it.)
  c) Bilingual side by side, or a language toggle?

Step 1 — Create frontend/src/features/documents/ following the existing feature
slice convention.

Step 2 — Build the invoice template: shop header, customer details, line items
(quantity, unit price, line total), delivery fee, total, paid, remaining, and
the debt due date when one is linked.

Step 3 — CRITICAL: every monetary figure must come from the API response. Do
NOT compute totals in the template. A template doing its own arithmetic is a
second source of financial truth and will eventually disagree with the ledger.
Show me the code proving totals are passed in, not calculated.

Step 4 — Print via window.print() with a print stylesheet; add PDF export
using the same jspdf approach as bulk labels.

Step 5 — Tests: a snapshot of the rendered document; a test asserting every
displayed total equals the API payload value exactly.

Step 6 — Print one to actual paper (or print preview) and confirm: fits A4,
Arabic renders correctly, nothing is clipped. Report what you observed.
```

---

## Prompt 03 — Build the payment receipt document

```
[STANDING RULES]

Prerequisite: Prompt 02 complete.

Goal: print a receipt whenever money is taken, and reprint it later.

Step 1 — Inspect what the payment API returns after a payment is recorded. The
receipt must show what the payment was ALLOCATED to and the resulting balance.
Confirm both are available; if not, extend the API rather than computing them
client-side.

Step 2 — Build the receipt template: shop header, customer, date, amount,
method, allocations (which debts/installments and how much to each), remaining
balance after this payment, and who received it.

Step 3 — Add print entry points at the payment confirmation and in payment
history for reprinting.

Step 4 — Tests: snapshot; allocations displayed correctly for a payment split
across multiple obligations; a reprint shows identical values to the original.

Step 5 — Confirm a voided payment either cannot be printed or is clearly marked
VOID. Ask me which if it is ambiguous.
```

---

## Prompt 04 — Build the customer statement

```
[STANDING RULES]

Goal: a date-ranged statement with a running balance, reconciling exactly with
the customer's outstanding.

Step 1 — Backend first. Add a report endpoint returning, for a customer and
date range: opening balance, chronological entries (debts, installments,
payments) each with a running balance, closing balance, and an aging summary.

CRITICAL: compute the running balance SERVER-SIDE, derived from transactions.
Do not store it and do not compute it in the frontend. This follows ADR-02.

Step 2 — Handle these explicitly and tell me your approach for each:
  - deterministic ordering when several entries share a date
  - the opening balance for a range starting after the customer's first
    transaction
  - voided payments: excluded from the balance but visible, marked voided
  - cancelled debts: same treatment

Step 3 — Frontend statement document, printable, matching invoice/receipt styling.

Step 4 — Tests: the closing balance equals the independently-computed
outstanding (INV-01); the running balance is arithmetically continuous entry to
entry; ordering is deterministic.

Step 5 — Run it for a real customer with a complex history (partial payments
across multiple debts) and verify the closing balance matches the customer
profile screen exactly. Report both numbers.
```

---

## Prompt 05 — Trace the current return flow

```
Do not change any code. Investigation only.

Trace exactly what a user must do today to return a delivered sales order.

  1. Read the terminalMutation path in sales-orders.service.ts. Quote every
     guard that blocks a return.
  2. For each guard, explain WHAT it prevents. These guards are correct — the
     goal is to preserve their protection inside a single transaction, not to
     remove them.
  3. List, in order, every manual step the operator must perform today.
  4. What happens to the money? Trace what unlinking a debt actually does.
  5. Is there ANY refund or credit concept in the codebase? Search thoroughly
     and report.
  6. What does restoring stock do, and is it reversible?
  7. What audit records does a return currently produce?

Then answer: if a customer returns a fridge they paid half for in cash and half
on credit, what exactly must the operator do, and what could go wrong at each
step?

Write to
.claude/home-connect-erp-upgrade/phases/phase-02-operations/RETURN_TRACE.md.
```

---

## Prompt 06 — Design the return and refund flow

```
Do not write implementation code yet. Design only.

Prerequisite: read RETURN_TRACE.md.

ASK ME THESE BUSINESS QUESTIONS FIRST. Do not proceed without answers — the
data model depends on them:
  a) Are partial returns needed (some lines, not all)?
  b) When money is returned, is it cash out, a credit against future purchases,
     or both?
  c) Does a returned item always go back into sellable stock, or does that
     depend on its condition?
  d) Is there a return window (e.g. 14 days), and who can override it?
  e) Should a returned item's original sale still appear in sales reports?

Then produce a design covering:
  - the state machine (which statuses can be returned, and to what)
  - schema changes (a Refund/CreditNote model, if the answers require one)
  - the single transaction: what is validated, what is written, in what order
  - how each existing guard's protection is preserved inside that transaction
  - how stock restoration reuses the existing reversal machinery
  - what the audit trail records
  - what the return document shows
  - every failure mode and what happens on each

Write to
.claude/home-connect-erp-upgrade/phases/phase-02-operations/RETURN_DESIGN.md
and stop for my approval before implementing.
```

---

## Prompt 07 — Implement the return and refund flow

```
[STANDING RULES]

Prerequisite: RETURN_DESIGN.md, approved by me.

This is the highest-risk task in Phase 2. It touches stock and money together.

Step 1 — Implement exactly the approved design. If you find something the
design did not anticipate, STOP and report rather than improvising.

Step 2 — Everything happens inside ONE runFinancialTransaction. Stock
restoration and financial reversal must succeed or fail together. A partial
return is the failure mode this task exists to eliminate.

Step 3 — Every guard identified in RETURN_TRACE.md must still be enforced —
inside the transaction now, rather than as a precondition the operator satisfies
manually. Map each old guard to its new equivalent and show me the mapping.

Step 4 — Add an idempotency key using the Phase 1 pattern. A retried return
must not restore stock twice.

Step 5 — Tests, added to the DB integration suites:
  - full return restores stock exactly once and reverses the money
  - partial return, if in scope
  - a failure mid-return leaves NO partial state (INV-05)
  - returning an already-returned order is rejected
  - a retried return with the same key applies once
  - audit history is complete and readable
  - the inventory reconciliation report stays clean afterwards

Step 6 — Run npm run test:ci and the inventory reconciliation report. Report
both outputs.
```

---

## Prompt 08 — Add supplier due dates and aging

```
[STANDING RULES]

Goal: answer "what must I pay this week?"

Step 1 — Inspect features/financial/receivables/receivables.tier.ts — the
customer aging logic. Reuse its tier approach rather than writing a second one.

Step 2 — Migration adding a nullable dueDate to supplier_transactions. No
backfill: existing rows keep null, correctly meaning "not tracked."

Step 3 — Expose dueDate in the supplier purchase and transaction forms.

Step 4 — Add a supplier aging report mirroring the customer receivables aging
report's structure.

Step 5 — Add a dashboard alert for payables due soon. Ask me the threshold
(7 days? 3?) rather than picking one.

Step 6 — Tests: aging buckets correct exactly at boundaries; null due dates
handled without error and excluded from aging; the alert fires at the right
threshold.

Step 7 — Confirm the supplier balance is unchanged by this work — run the
Phase 1 supplier integrity report and report the result.
```

---

## Prompt 09 — Measure the sales-order cash gap

```
Do not change any code. This is measurement, and its result decides the design.

Context: SalesOrder.paidAmount records money received but never creates a
Payment row. customer-financial-summary.repository.ts has zero references to
sales orders.

Step 1 — Confirm the finding. Read sales-orders.service.ts changePayment and
trace what happens to paidAmount. Confirm no Payment is created. Quote the code.

Step 2 — Confirm the reporting consequence. Read
customer-financial-summary.repository.ts and the report repositories. Determine
whether sales-order paidAmount appears in ANY of:
  - customer payment history
  - the "Customer Payments" report
  - the "Customers Who Paid" report
  - the collected movement metric feeding Monthly Review and Analysis

Step 3 — MEASURE IT against the production database:
  - total Σ(paidAmount) across all sales orders
  - how much of that has no corresponding Payment row
  - how many orders and over what date range
  - that total as a percentage of Σ(Payment.totalAmount) for the same period

Step 4 — Report whether this is material or negligible.

Do not propose a fix yet. Write to
.claude/home-connect-erp-upgrade/phases/phase-02-operations/SALES_CASH_GAP.md.
```

---

## Prompt 10 — Close the sales-order cash gap

```
[STANDING RULES]

Prerequisite: SALES_CASH_GAP.md, and my decision on which option to take.

The danger in this task is DOUBLE-COUNTING. Reporting the same money twice is
worse than the current omission — the current state understates predictably,
double-counting corrupts unpredictably.

Step 1 — Restate which option I chose and why.

Step 2 — Implement it. If creating Payment rows for counter cash:
  - do it inside the same transaction as the sales order payment change
  - preserve the assertNoFinancialLink boundary — understand why it exists
    before touching anything near it
  - decide and state whether historical rows are backfilled

Step 3 — If backfilling: this is a data-correctness operation. Require a
verified backup, make it idempotent (safe to run twice), and produce a
before/after report of affected totals. Get my explicit sign-off before running
it against production.

Step 4 — Tests (INV-09): every unit of money appears in reporting EXACTLY ONCE.
Write a test that would fail if it appeared twice, and one that would fail if it
appeared zero times. Both are required.

Step 5 — Run the Phase 1 customer financial integrity report before and after.
Report both. Any change in reported outstanding must be explained.
```

---

## Prompt 11 — Add customer credit limits

```
[STANDING RULES]

ASK ME FIRST: when a customer exceeds their credit limit, is that a hard block
or a warning an admin can override? (My recommendation: warning with admin
override, matching the existing step-up verification pattern — but confirm.)

Step 1 — Migration adding a nullable creditLimit to customers. Null means no
limit, preserving current behaviour exactly for every existing customer.

Step 2 — Enforce it on debt creation and on linking a sales order to a debt.
CRITICAL: compare against the DERIVED outstanding balance, never a cached
figure. Show me the code that computes the projected outstanding.

Step 3 — Frontend: the limit on the customer form; a clear warning when a new
debt would exceed it, showing current outstanding, the limit, and the overage.

Step 4 — Tests: under limit passes; over limit behaves per the confirmed rule;
null limit is unrestricted; the check uses derived outstanding; an admin
override (if chosen) is audited.

Step 5 — Confirm no existing customer's behaviour changes. All existing rows
have a null limit.
```

---

## Prompt 12 — Add product categories

```
[STANDING RULES]

ASK ME FIRST: how does the owner actually group products — by type (fridges,
washers, ovens), by room, by supplier, or something else? And is one level
enough, or is nesting needed? Getting this wrong means re-categorising the
whole catalogue later.

Step 1 — Migration: a categories table (id, name EN, name AR, optional parentId
for one level of nesting, isActive) and a nullable categoryId on products.
Use onDelete: Restrict, consistent with the rest of the schema.

Step 2 — A category feature slice following existing conventions, with CRUD.

Step 3 — Category selection on the product form; category filter on the
products page; category dimension on the product-related reports.

Step 4 — Tests: CRUD; assignment; filtering; a category with products cannot be
hard-deleted; uncategorised products still appear everywhere they do today.

Step 5 — Confirm every existing product (all uncategorised) still works in
every screen and report. Uncategorised must remain a valid permanent state.
```

---

## Prompt 13 — Phase 2 review

```
Do not change any code. Review only.

Review all Phase 2 work against
.claude/home-connect-erp-upgrade/phases/phase-02-operations/REVIEW.md.

Then:
  1. Run npm run test:ci; report the full output.
  2. Run all three integrity reports (inventory, customer financial, supplier
     financial); report the results.
  3. Print one invoice, one receipt, and one statement. Confirm each is legible
     on A4, renders Arabic correctly, and its totals match the source data
     exactly. Report the numbers you compared.
  4. Perform a full return on a test order end to end. Verify stock and money
     are both correct afterwards and reconciliation is still clean.
  5. Confirm every Phase 2 acceptance criterion is met, citing evidence.
  6. Review the Phase 2 commits on develop. Confirm the T4
     (return) and T8 (cash gap) commits are separate from unrelated work —
     they are the two most likely to need reverting.
  7. Confirm nothing was committed directly to main.

Classify as COMPLETE, COMPLETE WITH FOLLOW-UP, or NOT COMPLETE,
with justification. Apply REVIEW.md's NOT COMPLETE conditions literally —
in particular, any skipped test files, or money double-counted anywhere, is a
NOT COMPLETE.
```

---

## Prompt 14 — Record and push the Phase 2 checkpoint

```
Do not change any code.

Prerequisite: Prompt 13 returned COMPLETE or COMPLETE WITH FOLLOW-UP.

Step 1 — git push origin develop

Step 2 — Update SUMMARY.md from actual evidence:
  - database/schema changes: the return/refund model (T4), supplier dueDate
    (T5), customer creditLimit (T6), categories (T7) — each with its full
    migration disclosure block from PLAN.md
  - if T8 backfilled Payment rows: state that it was a data-correctness
    operation, that a verified backup was taken, that it is idempotent, and
    include the before/after affected-totals report
  - business rules changed: credit limit enforcement (hard block or override?),
    the new return flow, and how counter cash is now reported
  - SCREENSHOTS ARE REQUIRED — this phase changed UI substantially. Include the
    printed invoice, receipt, and statement
  - tests executed: full npm run test:ci output including skipped count
  - manual testing: the end-to-end return you performed, and the printed
    document totals you compared against source records

Step 3 — Show me the summary checkpoint before continuing.

Do not merge into main.
```
