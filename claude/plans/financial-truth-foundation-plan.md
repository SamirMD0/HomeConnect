# Financial Truth Foundation — CP1 Review and Implementation Plan

**Status:** ⏸️ **PAUSED — high-risk until safety review.** Review / planning only. No code, migrations, tests, builds, or version changes were made.
**Date:** 2026-08-08 (paused same day, on business context — see §0.0)
**Repo version at review time:** 1.6.0
**Produced by:** `claude/plans/Prompts/financial-truth-foundation-cp1-prompt.md`
**Approved scope frame:** [ERP_POSITIONING.md](claude/documentation/ERP_POSITIONING.md) §6–§9
**Current recommended work instead:** Mobile Scanner React Native app — see §0.2 and
[claude/prompts/codex-mobile-scanner-next-phase.md](claude/prompts/codex-mobile-scanner-next-phase.md)

---

## 0.0 Business Debt Risk Note — read before anything else

**The business currently carries high active customer debts.** That single fact changes the risk profile of
this entire feature, and it is why the plan below is paused rather than scheduled.

- Every item in this plan touches numbers the owner **uses daily and trusts**: `SalesOrder.paidAmount`,
  `Payment` creation, customer balances, receivables totals, and the dashboard cash cards.
- The fix described here is **technically correct** — §2 establishes that with file-and-line evidence. That
  is not the concern. The concern is that **changing financial truth while the business is running on high
  debt balances is high risk regardless of correctness.** A number that becomes more accurate is still a
  number that changed, and the owner is currently making collection decisions against the old one.
- Per §3, the moment this ships, *Payments today*, *Payments this month*, *Net change today*, *Net change
  this month*, month-end *Collected / Closing / Reconciled*, and every customer-analytics *Collected* figure
  **all move**. Simultaneously. On a live shop floor.
- **This must not be implemented as a normal quick feature.** It requires a dedicated safety phase: a data
  review of current debt and payment state, a verified backup, a dry-run on copied data, and a manual
  reconciliation plan the owner has agreed to in advance.

> The gap this plan fixes has existed for the life of the sales-orders module. It has been survivable that
> long. It will be survivable a few weeks longer, and it becomes far cheaper to fix once the scanner work is
> done and the owner has a quiet window to reconcile in.

---

## 0.1 Two options

### Option A — Pause Financial Truth Foundation now ✅ **recommended**

Continue with work that cannot touch a financial record:

- **Mobile Scanner React Native app** (the immediate next step)
- Product and scanner workflow improvements
- Non-financial usability work

**Why:** none of it reads or writes `Debt`, `Payment`, `PaymentAllocation`, `SalesOrder` money columns, or
any dashboard financial aggregate. The blast radius is the product catalog and the scanner session store.
The worst realistic failure is a scan that does not resolve — recoverable in seconds, with no effect on what
any customer owes.

### Option B — Make this feature workable during high-debt operation

**Only on explicit later approval from the owner.** If approved, all thirteen conditions below are
mandatory, not aspirational:

| # | Condition |
|---|---|
| 1 | **No historical data changes** in the first implementation |
| 2 | **Fix forward only** |
| 3 | **No automatic backfill** of existing `sales_orders.paidAmount` into `Payment` |
| 4 | **No silent change to existing customer receivable totals** |
| 5 | Visible **"accurate from &lt;date&gt;" boundary** shipped *before* the new cash figures are relied on |
| 6 | A **dry-run report** produced before migration or code activation |
| 7 | **Verified backup** before any financial migration |
| 8 | **Feature flag or admin setting** where technically possible |
| 9 | **Manual reconciliation checklist**, agreed with the owner beforehand |
| 10 | **Tested on copied/local data** before the business PC |
| 11 | **Old numbers stay visible** until the owner confirms the new ones |
| 12 | **Never auto-refund or auto-reverse** a payment on cancellation (see Concern 1, §8) |
| 13 | **No hidden financial side effects** — prompt, don't post |

Conditions 1–5 are already the plan's design (D5, D6). Conditions 6–11 are **new requirements added by the
high-debt context** and are not yet reflected in the checkpoints in §4 — they would extend CP-A and CP-B.

---

## 0.2 Recommended roadmap as of 2026-08-08

1. **Continue the Mobile Scanner React Native app.**
2. Finish the scanner workflow and complete real-phone testing.
3. **Do not touch financial truth during scanner work.** No mixing.
4. After the scanner is stable, return here with a safety-first CP1.
5. **Before any financial implementation, run all five:**
   - debt / customer balance audit
   - sales `paidAmount` audit
   - dashboard cash-source audit
   - backup verification
   - business-owner confirmation

---

## 0.3 Pre-implementation safety checklist

Every line must be checked and recorded **before** the first line of financial code is written. This is a
gate, not a formality.

- [ ] Confirm **total active customer debt**
- [ ] Confirm **top high-debt customers**
- [ ] Confirm the **current dashboard receivables number** (screenshot it)
- [ ] Confirm **current payment totals** (today, month, and month-end `collected`)
- [ ] Confirm **which sales orders have `paidAmount > 0`**, and the sum
- [ ] Confirm **which of those rows existed before the feature** — this is the set that stays invisible under D5
- [ ] Confirm **no automatic backfill** is present in the implementation
- [ ] Confirm a **verified backup** exists and has been test-restored
- [ ] Confirm a **rollback plan** exists and is written down
- [ ] Confirm the **owner understands the "accurate from &lt;date&gt;" boundary** and what it means for
      comparing this month to last month
- [ ] Confirm a **test-database run** completed before touching the business PC

---

## 0. Headline finding — the scope is materially smaller than assumed

The approved direction assumed **four** defects. The code holds **two**.

| # | Assumed defect | Verdict after inspection |
|---|---|---|
| 1 | Sales-order cash bypasses `payments` | ✅ **Confirmed, and it is the whole feature** |
| 2 | Prepaid advances inflate receivables | ❌ **Already fixed.** Prepaid is excluded from every receivables and dashboard figure, and is already modelled as a negative liability |
| 3 | `ServiceJob.finalPrice` is orphaned | ✅ **Confirmed** |
| 4 | Legacy `Transaction` needs a write-freeze | ❌ **Already frozen.** The route file exposes only two `GET`s. No write endpoint exists |

Two of the four are done. Neither was done as part of this feature — they were already correct when the
positioning document and the Lebanese CoA review claimed otherwise. **Those two claims were wrong**, and §2.6
/ §2.7 of [lebanese-chart-of-accounts-review-plan.md](claude/plans/lebanese-chart-of-accounts-review-plan.md)
should be corrected rather than implemented against.

This is good news and it should shrink the release, not be spent on extra scope.

**One consequence deserves stating up front:** decision D8 (visible before/after for prepaid
reclassification) and decision D7 (freeze legacy `Transaction`) **have nothing to implement**. There is no
receivables number that changes, so there is nothing to disclose; there are no writes, so there is nothing
to block. Building a disclosure for a change that does not happen would be worse than building nothing.

---

## 1. Scope and settled decisions

Carried from the CP1 prompt. Where inspection changed the answer, it is marked.

| # | Decision | Status after CP1 |
|---|---|---|
| D1 | Expenses out of scope | unchanged |
| D2 | No standalone Chart of Accounts, no journal/mapping/period models | unchanged |
| D3 | No inventory or COGS | unchanged |
| D4 | Three seeded cash accounts, no `type`/parent/code | **conditional — see §4, CP-D** |
| D5 | `paidAmount` fix is forward-only | unchanged, and now the central item |
| D6 | "Accurate from &lt;date&gt;" boundary on cards *and* reports | unchanged |
| D7 | Freeze legacy `Transaction` read-only | **already true — no work** |
| D8 | Prepaid reclassification visible before/after | **no reclassification needed — no work** |
| D9 | Currency-aware, USD default | unchanged |
| D10 | Service-job actions prompted, never automatic | unchanged |

---

## 2. Findings

### A. SalesOrder `paidAmount` flow

**Write paths.** `paidAmount` is written in exactly two places, plus a recalculation that preserves it:

| Path | Location | Behaviour |
|---|---|---|
| `create` | [sales-orders.service.ts:86](backend/src/features/sales/sales-orders/sales-orders.service.ts#L86) | `paidAmount` taken from `calculateSalesOrderTotals(input)` |
| `changePayment` | [sales-orders.service.ts:330-335](backend/src/features/sales/sales-orders/sales-orders.service.ts#L330-L335) | Writes `paidAmount`, `remainingAmount`, `paymentStatus` directly |
| `recalculateOrder` | [sales-orders.service.ts:453-470](backend/src/features/sales/sales-orders/sales-orders.service.ts#L453-L470) | Re-reads existing `paidAmount`, recomputes `remainingAmount`/`paymentStatus`. Never changes the paid figure |

**Controls already in place — these are good and must be preserved.** `changePayment` requires
`assertEditable`, `assertNoFinancialLink`, and unconditional `requireAdminVerification`
([line 320-322](backend/src/features/sales/sales-orders/sales-orders.service.ts#L320-L322)), and writes a
`CHANGE_PAYMENT` audit row with before/after money as strings inside the same transaction
([line 339-344](backend/src/features/sales/sales-orders/sales-orders.service.ts#L339-L344)).

**The remainder already reaches the ledger.** This is the most important correction to the premise. An order
with a remainder that is not `DRAFT` **automatically creates and links a real `Debt`**:

- on create — [line 95-101](backend/src/features/sales/sales-orders/sales-orders.service.ts#L95-L101)
- on payment change and on any recalculation — via `validateMutationDebtTerms`
  ([line 656-680](backend/src/features/sales/sales-orders/sales-orders.service.ts#L656-L680)) → `createAndLinkDebt`
- `CONFIRMED` is blocked outright if a remainder exists with no financial link
  ([line 297-299](backend/src/features/sales/sales-orders/sales-orders.service.ts#L297-L299))

So receivables from sales orders are **already correct and already reconciled**. The defect is precisely and
only the **cash half**: the money the customer actually handed over is a column, and nothing else.

**Cancel / return.** `terminalMutation` refuses outright if `debtId || installmentPlanId` is set
([line 362-364](backend/src/features/sales/sales-orders/sales-orders.service.ts#L362-L364)) — the financial
record must be unlinked from the financial screen first. `paidAmount` is left untouched by cancel, return,
and restore. **A cancelled order therefore retains its `paidAmount`**, which today is inert; once that figure
becomes a real `Payment`, cancellation acquires a cash consequence it does not currently have. See §8.

**Disagreement risk.** `unlinkFinancial` ([line 509-530](backend/src/features/sales/sales-orders/sales-orders.service.ts#L509-L530))
clears `debtId`/`installmentPlanId` and sets `settlement = NONE`, but **does not cancel the underlying
`Debt`** and does not touch `paidAmount`. The order and the debt can therefore diverge by design — the debt
remains the customer's obligation and is managed from the financial screen. This is defensible, but it means
a naive "order total vs. linked debt" reconciliation will not balance. Do not build one.

### B. Payment creation and allocation flow

**`PaymentsService` has no create method.** It holds only `voidPayment`, `correctPayment`,
`reallocatePayment`, and the private `reissuePayment`
([payments.service.ts](backend/src/features/financial/payments/payments.service.ts)). Payment *creation*
lives in the two owning services:

- `DebtsRepository.createPayment` ([debts.repository.ts:164](backend/src/features/financial/debts/debts.repository.ts#L164))
- `InstallmentPlansRepository.createPayment` ([installment-plans.repository.ts:172](backend/src/features/financial/installment-plans/installment-plans.repository.ts#L172))

**The template already exists.** `DebtsService.createPrepaidPurchase`
([debts.service.ts:140-190](backend/src/features/financial/debts/debts.service.ts#L140-L190)) does exactly
what a sales-order cash payment needs, inside one `runFinancialTransaction`:

```
createDebt(…)                    →  the obligation
PrepaidRepository.createForDebt  →  companion state row
DebtsRepository.createPayment    →  the Payment
createDebtPaymentAllocation      →  the allocation
determineDebtStatus + update     →  recomputed status
```

A sales-order cash payment is the same shape with the companion row omitted. **This is the pattern to copy —
do not design a new one.**

**Void semantics.** `voidPayment` sets `voidedAt` on the payment, voids all its allocations, then
`recomputeAffectedStatuses` re-derives debt and installment statuses from the surviving allocations
([payments.service.ts:83-93](backend/src/features/financial/payments/payments.service.ts#L83-L93)). Balances
are derived, never stored, so a void is automatically correct everywhere. Any sales-order payment inherits
this for free — **provided it is a real `Payment` with a real allocation.**

**Idempotency.** `Payment.idempotencyKey` is `String? @unique`. `createPrepaidPurchase` passes `null`.
There is an `idempotency.ts` in `financial/infrastructure/`.

#### The blocker: walk-in orders have no customer

`Payment.customerId` is **required** ([schema.prisma:528](backend/prisma/schema.prisma#L528)).

`SalesOrder.customerId` is **nullable**, and the service deliberately permits a customerless order **exactly
when it is fully paid**:

```ts
// sales-orders.service.ts:682-686
function validateCustomerRequirement(customerId, remainingAmount, allowFullyPaidWithoutCustomer = true) {
  if (!customerId && (compareMoney(remainingAmount, '0.00') > 0 || !allowFullyPaidWithoutCustomer)) {
    throw new ValidationError('Customer is required for this order');
  }
}
```

**The case that most needs a cash record is the case that has no customer to hang it on.** A walk-in who
pays cash and leaves is precisely the fully-paid, customerless order. This is not an edge case; for a shop it
is the common one.

This is the single genuine design decision in the feature. Options are laid out in §9 — **it must be
answered before CP-B is built**, and none of the options should be chosen by the implementer.

### C. PrepaidPurchase and debt behaviour — *already correct*

Prepaid is excluded from receivables and every dashboard figure, and is modelled as a liability:

| Location | Evidence |
|---|---|
| [receivables.service.ts:228](backend/src/features/financial/receivables/receivables.service.ts#L228) | `if (debt.kind === DebtKind.PREPAID_PURCHASE) continue;` |
| [dashboard-financial.service.ts:65, 99, 223, 249](backend/src/features/dashboard/dashboard-financial.service.ts#L65) | filtered out of every aggregate |
| [customer-analytics.service.ts:261](backend/src/features/dashboard/customer/customer-analytics.service.ts#L261) | filtered |
| [customer-financial-summary.service.ts:366, 399-402](backend/src/features/financial/customer-summary/customer-financial-summary.service.ts#L366) | `overdueEligible: false`, surfaced as `isPrepaid` |
| [prepaid-balance.ts:39-42](backend/src/features/financial/domain/prepaid-balance.ts#L39-L42) | `calculatePrepaidAdminDebt` returns a **negative** figure — an explicit liability |

The domain file even documents the accounting reasoning: *"It is a real liability: if the customer walks
away, this is the refund amount."*

**Nothing to build.** The only true residue of the original claim is that prepaid rows are physically stored
in the `debts` table. That is a storage fact with **zero effect on any displayed number**, and changing it
would be a migration with no user-visible benefit — precisely the kind of work §8 of the positioning document
warns against.

### D. ServiceJob `finalPrice` flow — *confirmed orphaned*

`grep` across `backend/src/features/service/` finds **no reference to `Debt`, `Payment`, or
`DebtsService`**. `finalPrice` is validated
([service-jobs.validator.ts:34](backend/src/features/service/service-jobs/service-jobs.validator.ts#L34)),
stored, audited as `CHANGE_PRICE`
([service-jobs.service.ts:327](backend/src/features/service/service-jobs/service-jobs.service.ts#L327)),
serialized, and never reaches finance. The dashboard service section computes **no revenue figure at all**.

**Trigger point.** `completedAt` is set on transition to `DELIVERED_TO_CUSTOMER`, `PRODUCT_EXCHANGE`, or
`NOT_REPAIRABLE` ([service-jobs.service.ts:165-166](backend/src/features/service/service-jobs/service-jobs.service.ts#L165-L166)).
`DELIVERED_TO_CUSTOMER` is the natural prompt point. `NOT_REPAIRABLE` may still carry an inspection fee, so
it should also be eligible — but the prompt must never fire by itself (D10).

**Customer is always present** — `ServiceJob.customerId` is required
([schema.prisma:718](backend/prisma/schema.prisma#L718)) — so unlike sales orders, **service jobs have no
walk-in problem.** `DebtsService.createDebt(customerId, {amount, description, dueDate, notes}, user, tx)`
can be called directly.

**Idempotency.** Nothing today prevents raising two debts for one job, because nothing raises one. A link
field plus a 409 is required, mirroring `SalesOrder.debtId @unique` + `assertCanConvert`
([sales-orders.service.ts:556-562](backend/src/features/sales/sales-orders/sales-orders.service.ts#L556-L562)).

### E. Legacy `Transaction` — *already read-only*

[transactions.routes.ts](backend/src/routes/transactions.routes.ts) is 18 lines and exposes exactly:

```
router.get('/',    … listTransactions)
router.get('/:id', … getTransaction)
```

**There is no POST, PUT, PATCH, or DELETE.** Mounted behind `requireAuth` at
[app.ts:118](backend/src/app.ts#L118). The write-freeze decision (D7) is already satisfied by construction.

**Additional finding — dead frontend code.** `frontend/src/features/transactions/` contains `transactions.api.ts`,
`useTransactions.ts`, `TransactionForm.tsx`, and `TransactionList.tsx`. **`useTransactions` has zero
consumers** — no page or component imports it. `TransactionForm` is a write UI for an API that has no write
endpoint.

Whether the table holds live rows is a question about the **shop's database**, not this code:

```sql
SELECT COUNT(*) AS rows,
       MIN("createdAt") AS first_row,
       MAX("createdAt") AS last_row
FROM transactions;
```

Read-only, safe to run in psql/pgAdmin on the business PC. **Do not guess the answer, and do not drop
anything before it is run.**

### F. Dashboard cash and receivables calculations

| Figure | Location | Source | Affected by the `paidAmount` fix? |
|---|---|---|---|
| `paymentsToday` | [dashboard-financial.service.ts:78, 104](backend/src/features/dashboard/dashboard-financial.service.ts#L78) | `payments` | **Yes — will increase** |
| `paymentsThisMonth` | [dashboard-financial.service.ts:79, 105](backend/src/features/dashboard/dashboard-financial.service.ts#L79) | `payments` | **Yes — will increase** |
| `netChangeToday` / `netChangeThisMonth` | [dashboard-financial.service.ts:108-109](backend/src/features/dashboard/dashboard-financial.service.ts#L108-L109) | `obligations − payments` | **Yes — will decrease** |
| month-end `collected` | [month-end.service.ts:49, 94](backend/src/features/dashboard/month-end/month-end.service.ts#L49) | `paymentsReceived` | **Yes** |
| month-end `closing` / `reconciled` | [month-end.service.ts:150-157](backend/src/features/dashboard/month-end/month-end.service.ts#L150-L157) | derived from `collected` | **Yes — knock-on** |
| customer-analytics `collected` (range, today, per-month) | [customer-analytics.service.ts:75, 107, 189, 202](backend/src/features/dashboard/customer/customer-analytics.service.ts#L75) | `payments` | **Yes** |
| `salesToday` / sales trend | [sales-analytics.service.ts:24, 33](backend/src/features/dashboard/sales/sales-analytics.service.ts#L24) | `sales_orders.totalAmount` | No — sales-side family, unchanged |
| Receivables aging / tiers | `receivables.service.ts` | debts + allocations | No — remainder already becomes a `Debt` |
| Customer financial summary | `customer-financial-summary.service.ts` | debts + payments | **Yes**, for customers with linked orders |

**Boundary date source.** `month-end` already carries a `disclosure` field pattern that the D6 boundary can
reuse rather than inventing a new mechanism. The date itself should be a single backend constant (the release
date), exposed with the figures — **not hardcoded in the frontend**, or the cards and reports will drift.

---

## 3. Blast radius

Screens and figures whose displayed numbers change on release day:

**Dashboard**
- Financial cards: *Payments today*, *Payments this month*, *Net change today*, *Net change this month* — **all increase or decrease**, immediately and permanently
- Month-end panel: *Collected*, *Closing*, *Reconciled*
- Customer analytics: *Collected* for range, today, and every per-month row
- Sales section: **unchanged** (different metric family — keep it that way)

**Financial screens**
- Customer financial summary and payment history — new payment rows appear for customers with sales orders
- Financial ledger feed — new payment rows
- Receivables aging — **unchanged** (the remainder was already a debt)

**Sales screens**
- Sales order detail gains a link to the payment it produced
- Cancel/return behaviour changes if a cash payment now exists — see §8

**Service screens**
- Service job detail gains two prompted actions and a linked-record indicator

**Not affected:** products, inventory, suppliers, scanner, labels, reports over supplier balances.

---

## 4. Proposed checkpoints — ⏸️ paused, not scheduled

**None of these are approved to start.** They are retained so the work does not have to be re-derived when
the safety window opens. Under Option B, CP-A and CP-B additionally absorb conditions 6–11 of §0.1 (dry-run
report, feature flag, copied-data test, rollback plan, old-numbers-visible).

Lettered to avoid collision with the CP1/CP2 numbering already used in conversation.

| CP | Goal | Independently releasable? |
|---|---|---|
| **CP-A** | **Decision gate.** Resolve the walk-in question (§9 Q1) and the cash-account question (§9 Q2). No code | n/a — blocking |
| **CP-B** | Schema + one additive migration: currency columns (USD default), sales-order↔payment link, service-job↔financial link, cash accounts **only if CP-A says yes** | Yes — inert until used |
| **CP-C** | Domain layer: sales-order cash → `Payment` + allocation, following the `createPrepaidPurchase` template. Pure/unit tested before any HTTP | Yes |
| **CP-D** | Wire CP-C into `create` and `changePayment`, inside the existing transactions and audit rows. Forward-only | **Yes — this is the core fix** |
| **CP-E** | Service-job prompted actions: create debt, record payment. 409 on second raise | Yes |
| **CP-F** | Backend boundary metadata: the "accurate from" date exposed with every affected figure | Yes |
| **CP-G** | Frontend: boundary display on cards *and* reports, service-job action UI, sales-order payment link | Yes |
| **CP-H** | Docs, `ERP_POSITIONING.md` correction (§0 of this document), full verification | Yes |

**Deleted from the original plan:** the prepaid reclassification checkpoint and the legacy-`Transaction`
freeze checkpoint. Neither has work. Their decisions (D7, D8) are satisfied.

**CP-A is a hard gate.** CP-B's migration shape depends on both answers. Building the migration first and
adjusting later would mean a second migration on a business PC whose migration history is already drifted.

---

## 5. Schema changes required

Described only. Additive. One migration at CP-B.

| Change | Shape | Note |
|---|---|---|
| Currency on money-carrying records | `currency String @default("USD")` on `Payment`, `Debt`, `SalesOrder`, `ServiceJob`, `SupplierTransaction` | D9. Column only — no rate table, no conversion, no UI |
| Sales order → payment link | Nullable link from `SalesOrder` to the `Payment` it produced | Shape depends on CP-A. If one payment per order, `paymentId String? @unique` mirrors the existing `debtId` pattern |
| Service job → financial link | `debtId String? @unique` and/or `paymentId String? @unique` on `ServiceJob` | Enables the 409 that prevents double-raising |
| Cash accounts | **Only if CP-A approves.** Three seeded rows: `Cash Drawer / الصندوق`, `Bank / المصرف`, `Other / آخر` | **No `type`, no `parentId`, no `code`** |

**Explicitly not added:** `Expense`, `ChartAccount`, `JournalEntry`, `JournalEntryLine`, `AccountMapping`,
`AccountingEvent`, `FiscalPeriod`, any stock or COGS field, any rate table.

---

## 6. Migration and rollout safety

- Additive only. No `migrate reset`, no destructive SQL, no column drops, no data deletion.
- **No backfill of historical `paidAmount`** (D5). Existing orders keep their column value.
- The business PC's schema was built by hand-run repair scripts and held **2 of 25** `_prisma_migrations`
  rows as of the 2026-08-06 diagnostics. Verify its repair history **before** release.
- If a repair-script path is needed, the `.sql` must be listed in
  `backend/prisma/repair/manifest.json` with a matching SHA-256 or `RepairRegistry` rejects it as an
  `ORPHAN_FILE`. `RepairRunner` wraps the whole file in one transaction and runs the manifest
  `verificationQuery` inside it — that constrains what the SQL may contain.
- Full backup before the business-PC migration.
- The one-sentence explanation the owner gets: *"Cash taken at the counter on a sales order is now recorded
  as a real payment, so the cash figures include it from &lt;date&gt; onward."*

---

## 7. Test plan

**Backend**
- Sales-order cash produces exactly one `Payment` + one `PaymentAllocation`, inside the same transaction as
  the order write
- A fully-paid order produces a payment and **no** debt; a partially-paid order produces a payment **and**
  the debt it already produces today
- Voiding a sales-order payment recomputes order payment status correctly
- `changePayment` from a higher to a lower figure behaves correctly (this is the case most likely to be wrong)
- Service job: first raise succeeds, second returns **409**
- Currency defaults to `USD` on every new money record
- Boundary date is present on every affected dashboard figure

**Regression net — must stay byte-identical**
`debts.*.test.ts`, `payments.*.test.ts`, `installment-plans.*.test.ts`,
`balances-statuses-allocation.test.ts`, `calculation-contract.test.ts`,
`prisma/financial-domain-schema.test.ts`, `receivables.*.test.ts`.

**Expectations that will legitimately change:** `dashboard-financial` and `month-end` tests whose fixtures
include sales orders with `paidAmount > 0`. Each change in its own step, with the reason in the diff.
Everything else changing is a bug.

**Manual**
- Walk-in fully-paid cash sale (whichever CP-A path is chosen)
- Counter sale with a remainder → confirm one payment **and** one debt, no double counting
- Service job delivered with a `finalPrice` → prompt → debt created → paid
- Dashboard before/after screenshots showing the cash figures moving and the boundary text

---

## 8. Concerns

1. **Cancel and return acquire a cash consequence they do not have today.** `terminalMutation` leaves
   `paidAmount` untouched. Once that figure is a real `Payment`, cancelling an order silently leaves a live
   payment behind. The payment is arguably correct — the shop did receive that cash, and a refund is a
   separate event — but this must be a **deliberate decision with a test**, not an accident. Recommendation:
   leave the payment standing and require an explicit void or refund from the financial screen, mirroring how
   `unlinkFinancial` already refuses to cancel the debt for you.

2. **`unlinkFinancial` will need the same care.** It currently clears links without touching the debt. If a
   payment link is added, decide explicitly whether unlink clears it too.

3. **Two of the four premises were wrong.** The positioning document and the CoA review both asserted defects
   that the code does not have. That is a documentation-accuracy problem worth one line in CP-H:
   `ERP_POSITIONING.md` §4.1 and §4.3 need correcting, as does the CoA plan's §2.6/§2.7. Left uncorrected,
   the next reviewer will re-derive the same wrong scope.

4. **The `changePayment` admin gate may become friction.** Every payment change requires an admin password
   today. Once each change also writes a real `Payment`, an employee recording ordinary counter cash cannot
   do so without an admin. **This is a workflow question the owner should answer**, not something to relax
   unilaterally — but it is likely to surface on day one.

---

## 9. Open questions for the business

These are **not asked now.** The feature is paused (§0.0), so they need no answer until the safety window
opens. They are recorded here, with recommendations, so the eventual restart begins from a decision list
rather than a blank page.

**Q1 — walk-in cash sales (blocking CP-B).** *Retained as a future implementation option.* A fully-paid order
with no customer is explicitly allowed today, and `Payment.customerId` is required. Which?

| Option | Consequence |
|---|---|
| **(a) Require a customer on any order with cash** | Simplest and safest. Changes shop workflow: every counter sale needs a customer record |
| **(b) Seed one "Walk-in / زبون عابر" customer** | Preserves workflow; all anonymous cash lands on one customer whose ledger becomes meaningless |
| **(c) Make `Payment.customerId` nullable** | Cleanest data model, **largest blast radius** — every query, balance, and summary assumes a customer. Not recommended in this release |

**Recommendation: (b)**, with the walk-in customer flagged and excluded from receivables the way prepaid
already is — the exclusion pattern exists and works.

**Q2 — cash accounts (blocking CP-B).** *Retained as a future implementation option.* With prepaid and
legacy-`Transaction` work removed, cash accounts are the only remaining non-essential item. Are
`Cash Drawer / الصندوق`, `Bank / المصرف`, `Other / آخر` genuinely useful now, or should the eventual release
ship the cash-truth fix alone and defer accounts? Deferring keeps it to one idea — and under the high-debt
constraint, one idea is the right size. The constraints from D4 still hold whenever it is built: **no `type`,
no parent, no code column.**

**Q3 — does `transactions` hold live rows?** Run the query in §E on the business PC. Determines whether the
dead frontend code and the model can eventually be removed. Not blocking.

**Q4 — should an employee be able to record counter cash without an admin password?** See Concern 4.

**Q5 — cancelled orders with cash.** Confirm the Concern 1 recommendation: the payment stands, and a refund
is a separate explicit action.

---

## 10. Related documents

- [claude/documentation/ERP_POSITIONING.md](claude/documentation/ERP_POSITIONING.md) — approved scope; §4.1
  and §4.3 need the correction in §0 above
- [claude/plans/lebanese-chart-of-accounts-review-plan.md](claude/plans/lebanese-chart-of-accounts-review-plan.md)
  — §2.6/§2.7 assert two defects the code does not have
- [claude/plans/Prompts/financial-truth-foundation-codex-prompt.md](claude/plans/Prompts/financial-truth-foundation-codex-prompt.md)
  — the build prompt; its "four defects" list should be reduced to two before it is run
