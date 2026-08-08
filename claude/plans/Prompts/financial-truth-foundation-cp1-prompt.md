# Planning Prompt — Financial Truth Foundation, CP1 (review only)

Paste everything below the line into Claude Code. This produces a **plan document**, not code.

---

## Request

You are Claude Opus 5 acting as a senior ERP architect and accounting-system reviewer on **HomeConnect**
(Node/Express + Prisma/Postgres backend, React 19 frontend, Electron desktop shell, single shop PC).

Produce **CP1** of the Financial Truth Foundation: a review of how money actually flows through the current
code, and a proposed checkpoint breakdown for the implementation that follows.

**CP1 is review and planning only.**

- Do **not** write application code.
- Do **not** create or edit migrations, and do not touch `schema.prisma`.
- Do **not** run tests, builds, lint, or typecheck.
- Do **not** bump the version.
- Do **not** commit.
- You may create exactly **one** new file: the plan document (see "Deliverable").

Read the repository. Do not re-derive the positioning argument — it is settled (see "Settled decisions").

---

## Background you must read first

1. [claude/documentation/ERP_POSITIONING.md](claude/documentation/ERP_POSITIONING.md) — §4 (financial gaps),
   §6 (the approved feature and its decisions), §7 (why not Chart of Accounts), §8 (what not to build),
   §9 (forced sequence). **This document is approved. Do not re-argue it.**
2. [claude/plans/lebanese-chart-of-accounts-review-plan.md](claude/plans/lebanese-chart-of-accounts-review-plan.md)
   — §2.6 and §2.7 for the four-competing-balances and semantic-mismatch findings. Note that
   `ERP_POSITIONING.md` §7 deliberately **defers** that plan's P2 and P3.

Do not scan the whole repository. Inspect the areas listed below and the files they lead to.

---

## Settled decisions — do not reopen these

| # | Decision |
|---|---|
| D1 | **Expenses are out of scope.** No `Expense` model, no expense categories, no P&L, no net income, no profit reports, no trial balance, no balance sheet. Expenses are the *next* feature, not this one |
| D2 | **No standalone Chart of Accounts.** No `ChartAccount`, no `JournalEntry`, no `AccountMapping`, no `AccountingEvent`, no `FiscalPeriod`, no period locking |
| D3 | **No inventory or COGS work.** Sales orders still do not move stock in this phase |
| D4 | **Cash/bank accounts are exactly three, seeded:** Cash Drawer / الصندوق, Bank / المصرف, Other / آخر. **No `type` column, no parent account, no official account code.** No per-person floats and no Wish/OMT accounts unless the business confirms daily use |
| D5 | **The `paidAmount` fix is forward-only.** No retroactive conversion of historical sales-order cash into payments |
| D6 | **The "accurate from &lt;date&gt;" boundary appears on both dashboard cards and reports** — not hidden inside reports only. Every cash figure affected by D5 shows its start date where the number is read |
| D7 | **Legacy `Transaction` is frozen read-only.** Block new writes if feasible; preserve historical visibility. Do not migrate, delete, or rewrite it until live-data status is confirmed |
| D8 | **Prepaid reclassification must be visible.** An in-app before/after explanation when advances are separated from AR. No silent change to the receivables number |
| D9 | **Currency-aware, USD default.** A currency column on money-carrying records going forward, defaulted to USD. No rate table, no conversion, no dual-currency display |
| D10 | **Service-job financial actions are prompted, never automatic.** One-click *create debt from service job* and *record payment from service job*. No silent posting |

If the code makes one of these decisions look wrong, **say so in a "Concerns" section and continue planning
under the decision as written.** Do not quietly redesign around it.

---

## Facts about this repo you must not re-derive incorrectly

- Version is **1.6.0**. `schema.prisma` is ~1031 lines, **24 models, 36 enums**.
- **No accounting models exist.** `ChartAccount`, `JournalEntry`, `AccountingEvent`, `AccountMapping`,
  `FiscalPeriod`, `CashAccount`, `Expense` — none are in the schema.
- **No currency column exists anywhere** in the schema today.
- `sales_orders.paidAmount` is a **plain `Decimal` column** written by `changePayment` in
  [sales-orders.service.ts](backend/src/features/sales/sales-orders/sales-orders.service.ts). It is audited
  and admin-verified, but **backed by no `Payment` row**. `grep PaymentsService backend/src/features/sales`
  returns nothing.
- A sales order can create a `Debt` (for `remainingAmount`) or an `InstallmentPlan` via explicit user action,
  setting `settlement = DEBT | INSTALLMENT`. The **paid** portion has no such path.
- `ServiceJob.finalPrice` has **no reference to `Debt` or `Payment`** anywhere in
  `backend/src/features/service/`.
- `PrepaidPurchase` is a companion record to a `Debt` with `kind = PREPAID_PURCHASE`. The `Debt`, `Payment`,
  and `PaymentAllocation` rows are the immutable financial record and are never rewritten by it.
- Legacy `Transaction` is still routed: [app.ts:118](backend/src/app.ts#L118) mounts
  `backend/src/routes/transactions.routes.ts` at `/api/v1/transactions`.
- `Product.stockQuantity` is written by exactly one path — `PATCH /:productId/stock`, admin-only, absolute
  value. **Not in scope here**; do not touch it.
- Money is `Decimal(12,2)` in the database and crosses the API as **strings**. Never introduce a float.
- The backend is **authoritative for all totals**. The frontend does not compute balances.
- Admin-gated financial mutations go through `verifyAdminPassword` and write an audit row with before/after
  values, reason, actor snapshot, request id, and IP.
- The business PC's schema was built by **hand-run repair scripts** and drifts from Prisma's migration
  history. Any future migration plan must account for that; a repair path may be needed.

---

## Investigation areas

For each area: report **what the code actually does today**, cite `file:line`, and state the specific defect
or gap. Do not propose fixes inside this section — findings first, proposals later.

### A. SalesOrder `paidAmount` flow

- Every write path that sets `paidAmount`, `remainingAmount`, or `paymentStatus`. Include create, update,
  `changePayment`, recalculation, cancel, return, and restore.
- What authorization, admin verification, and audit each path carries.
- What happens to `paidAmount` when the order is cancelled or returned.
- The interaction between `paidAmount` and `createDebt` / `createInstallmentPlan` — confirm whether the debt
  is raised for `remainingAmount` only, and what happens if `paidAmount` changes *after* a debt is linked.
- Whether `unlink` / settlement-reset can leave the order and the debt disagreeing.

### B. Payment creation and allocation flow

- `backend/src/features/financial/payments` and `financial/domain` — how a `Payment` is created, how
  `PaymentAllocation` rows are produced, and what enforces that allocations sum to the payment.
- The idempotency mechanism (`Payment.idempotencyKey`) and where the key comes from.
- Void semantics: what `voidedAt` does to derived balances, and whether allocations are voided with it.
- **The extension question:** what would a sales-order-originated payment need in order to reuse this path
  unchanged? Identify what is genuinely missing (an origin/source reference? a customer, given
  `SalesOrder.customerId` is nullable?) versus what already fits.
- Walk-in orders with **no customer** are the hard case. `Payment.customerId` is required. State plainly
  what that implies.

### C. PrepaidPurchase and debt behaviour

- How `DebtKind.PREPAID_PURCHASE` debts are created, paid into, and settled on delivery, including the
  `remainderDebt` path.
- **Every place that currently counts prepaid debts as receivables** — `financial/receivables`,
  `financial/customer-summary`, `financial/ledger`, `dashboard/*`. This list is the blast radius of D8.
- Whether aging/tiering treats a prepaid advance as overdue, and what that does to the aging buckets.
- What the receivables number would become if prepaid were excluded — describe the shape of the change, and
  say whether it can be computed for the before/after display without new tables.

### D. ServiceJob `finalPrice` flow

- Where `finalPrice` is set, validated, audited, and displayed; which statuses allow it to change.
- Which lifecycle point is the right trigger for a prompt (completion? return to customer?), and what the
  code makes available at that point.
- Whether a service job has enough information to raise a debt — customer is required on `ServiceJob`, so
  confirm what else a `DebtsService.createDebt` call would need.
- Idempotency: what prevents two debts from being raised for the same job, given D10 makes this
  user-triggered and therefore repeatable.

### E. Legacy `Transaction`

- Everything mounted under `/api/v1/transactions`: routes, controller, repository, and which frontend
  screens (if any) still call it.
- Whether it is reachable from the current UI at all.
- **What "freeze read-only" would concretely mean** — route-level rejection, service-level guard, or
  permission change — and which option preserves historical reads with the least risk.
- **State clearly that whether it holds live data is a question for the business PC's database, not for the
  code.** Propose a read-only query to answer it (row count, min/max `createdAt`) and do not guess.

### F. Dashboard cash and receivables calculations

- Every place a cash or receivables figure is computed: `dashboard/overview`, `dashboard/month-end`,
  `dashboard-financial.*`, `dashboard/sales`, `dashboard/customer`, `financial/receivables`.
- For each figure: its source tables, and whether it would change when (a) sales-order cash becomes a real
  payment, (b) prepaid leaves AR.
- Which figures need the D6 "accurate from &lt;date&gt;" boundary, and where that date would come from.
- Whether `month-end`'s existing `disclosure` pattern can carry the boundary, or whether something new is
  needed.

---

## Deliverable

Create **one** file:

```
claude/plans/financial-truth-foundation-plan.md
```

Structure it as:

1. **Scope and settled decisions** — restate D1–D10 as the fixed frame.
2. **Findings** — one subsection per investigation area A–F, with `file:line` evidence.
3. **Blast radius** — the full list of screens, endpoints, and figures whose displayed numbers change.
   This is the section the owner will actually be judged against; be exhaustive.
4. **Proposed checkpoints** — CP2 onward. For each: goal, files touched, schema changes (described only, not
   written), audit/authorization requirements, tests required, and what "done" means. **Each checkpoint must
   be independently releasable and independently safe to stop after.**
5. **Schema changes required** — described in prose and tables. Additive only. Explicitly list what is
   *not* being added (D1, D2, D3).
6. **Migration and rollout safety** — including the business-PC drift, backup requirements, and whether a
   repair script path is needed.
7. **Test plan** — backend, frontend, and manual. Existing debt/payment/installment tests must produce
   **byte-identical balances** except where a finding says otherwise; call out precisely which expectations
   are expected to change and why.
8. **Concerns** — anything the code revealed that makes a settled decision look expensive or wrong. State
   it; do not act on it.
9. **Open questions for the business** — things the code cannot answer (does the shop use OMT/Wish daily? is
   there live data in `transactions`? are walk-in cash sales common enough to need a customer-less payment
   path?).

Use the direct, evidence-first style of `ERP_POSITIONING.md`. Tables over prose where a table fits. No
marketing tone. `file:line` citations throughout — a claim without a citation is a guess.

---

## Constraints on what you propose

Anything you propose for CP2+ must satisfy all of these, or you must flag it as violating one:

- Additive migrations only. No `migrate reset`, no destructive SQL, no data deletion.
- Backup before any business-PC migration.
- Backend remains authoritative for all totals. Decimal-safe money, strings across the API.
- Admin password + reason + audit on every sensitive financial change.
- **No hidden automatic financial side effects.** Prompt, don't post.
- No scanner, mobile, product, or inventory work mixed into this feature.
- Historical financial records are not rewritten. Corrections are recorded, not applied in place.
- Every changed number is explainable to the owner in one sentence.

---

## Stop conditions

Stop and ask rather than guessing if:

- A finding contradicts a settled decision in a way that makes the decision unimplementable (not merely
  inconvenient).
- The walk-in / customer-less sales-order payment case has no clean answer within the current `Payment`
  model — this is the most likely genuine blocker, and it is a business question, not a code question.
- You cannot determine from the code whether a dashboard figure is affected. Say "cannot determine from
  code" and list what would settle it.

Report at the end: what you inspected, what you found, what you propose, and what you need answered.
