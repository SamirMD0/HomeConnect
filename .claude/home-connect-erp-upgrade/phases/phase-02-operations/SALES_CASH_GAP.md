# Prompt 09 — sales-order cash-gap measurement

Measured: 2026-09-14, final aggregate check at **09:50:40 UTC / 12:50:40 Asia/Beirut**.

Branch: `upgrade/phase-02-operations`. Measurement only: this document is the only file added in Prompt 09. No application code, schema, migration, business data, payment, or ledger changes. No merge, deployment, or proposed fix.

## Verdict

**MATERIAL, not negligible.** The business database contains **$983.00** in current sales-order `paidAmount` snapshots across **12 paid orders**, dated **2026-08-03 through 2026-08-22 inclusive**. No corresponding record for those order-paid amounts was identified in Payments.

Payments for the identical date window total **$1,932.13 across 7 rows**. The order-paid gap is **50.88%** of that recorded Payment total:

`983.00 / 1,932.13 × 100 = 50.8765%`.

The literal all-orders amount includes **one DRAFT order with $100.00**. Excluding that draft, consistent with the existing sales metrics' status policy, leaves **$883.00 across 11 non-draft orders**, still **45.70%** of the same Payment total. Ten delivered orders account for **$851.00**; one preparing order accounts for **$32.00**. This finding does not depend on treating draft cash as recognized sales.

These are recorded-system amounts, not a bank/till reconciliation or evidence that money was physically received. Unreferenced manual duplication cannot be proved absent solely from this schema. The specific linkage, reference, and allocation checks below establish the identifiable bookkeeping/reporting omission; they are not authorization for historical data changes.

## 1. Confirmed write path — no Payment creation

Reviewed the existing service, its repository, and the called debt/plan creation paths. `changePayment` writes an absolute paid snapshot and derived remaining/payment-status values to the sales order, optionally creates a debt for the remainder, then audits the mutation. It does not create a Payment or PaymentAllocation.

Excerpt from [sales-orders.service.ts](../../../../backend/src/features/sales/sales-orders/sales-orders.service.ts), `changePayment`, lines 363–391:

```ts
return runFinancialTransaction(async (tx) => {
  const existing = await requiredOrder(id, tx);
  assertEditable(existing);
  assertNoFinancialLink(existing);
  await requireAdminVerification(input, user, context, id, 'CHANGE_SALES_ORDER_PAYMENT', tx);
  const totals = calculateVatAwareOrderTotals(existing.items, deliverySnapshot(existing), input.paidAmount);
  validateCustomerRequirement(existing.customerId, totals.remainingAmount);
  const shouldCreateDebt = validateMutationDebtTerms(existing, totals.remainingAmount, input.debtDueDate);
  let updated = await SalesOrdersRepository.update(id, {
    paidAmount: totals.paidAmount,
    remainingAmount: totals.remainingAmount,
    basePaidAmount: totals.paidAmount,
    baseRemainingAmount: totals.remainingAmount,
    paymentStatus: deriveSalesOrderPaymentStatus(totals.paidAmount, totals.totalAmount),
    updatedById: user.userId,
  }, tx);
  if (shouldCreateDebt) {
    updated = await this.createAndLinkDebt(updated, { dueDate: input.debtDueDate!, description: `Sales order ${updated.orderNumber}`, notes: null }, user, context, tx);
  }
  await auditMutation(updated, {
    action: SalesAuditAction.CHANGE_PAYMENT,
    reason: input.reason,
    beforeValues: { paidAmount: moneyToApiString(existing.paidAmount), remainingAmount: moneyToApiString(existing.remainingAmount), paymentStatus: existing.paymentStatus },
    afterValues: { paidAmount: totals.paidAmount, remainingAmount: totals.remainingAmount, paymentStatus: updated.paymentStatus },
  }, user, context, tx);
  return serializeSalesOrder(updated);
});
```

Supporting traces:

- `sales-orders.repository.ts:118/122`: create/update call only `tx.salesOrder.create` / `tx.salesOrder.update`, with the standard order include.
- `sales-orders.service.ts:67`: initial order creation also stores `paidAmount`/`basePaidAmount` on the order; it does not record that amount as a Payment.
- `sales-orders.service.ts:474`: `createAndLinkDebt` passes **`existing.remainingAmount`**, not the original total or down payment, into `DebtsService.createDebt`.
- `debts.service.ts:203`: ordinary `createDebt` creates a debt only. The distinct prepaid-purchase/payment methods elsewhere in that service must not be confused with this called method.
- `sales-orders.service.ts:529`: installment conversion likewise creates a plan for `existing.remainingAmount`, not a Payment for paid cash.
- `sales-orders.service.ts:600`: `assertNoFinancialLink` rejects monetary/identity changes while a debt or plan is linked. This boundary was inspected and not changed.

## 2. Reporting consequence

| Surface | Does it consume sales-order paid snapshots? | Source/evidence |
|---|---|---|
| Customer payment history | **No** | `customer-financial-summary.repository.ts:140/171` loads customer, debts, plans, and `prisma.payment.findMany`; zero `salesOrder` or `paidAmount` references. `customer-financial-summary.service.ts:356` maps only `records.recentPayments`. |
| Customer Payments report | **No** | `report-rows.repository.ts:77` selects Payments by payment date and void cutoff. `report-rows.service.ts:179` renders/sums those Payment rows only. |
| Customers Who Paid report | **No, not from these snapshots** | `report-rows.service.ts:79/98/196` builds customer movements from `MonthlyDebtsService` activity, adds only `PAYMENT_RECEIVED` entries to paid totals/counts, then filters on `paymentCount > 0`. The report-metrics payer count likewise reads distinct Payment customer IDs in `reports-metrics.repository.ts:27`. A customer can appear because of a separate debt payment; that does not mean their order-paid amount was included. |
| Customer `collected` movement in Monthly Review | **No** | `monthly-debts.repository.ts:152/176` loads activity Payments; `monthly-debts.service.ts:130/145` validates their void cutoff and sums stored `baseAmount` (fallback `totalAmount`). `month-end.service.ts:117` assigns `activity.summary.paymentsReceived` to `collected`; `monthly-review.service.ts:72` exposes that movement. |
| Analysis customer-collected metric | **No** | `analysis.service.ts:29` composes Monthly Review results; `:101/112` reads `now.customers.movement.collected` for comparisons/findings. No order-paid addition occurs. |

Important qualification: **sales paid summaries do include this money separately**. `reports-metrics.repository.ts:36` groups sales orders using stored `basePaidAmount`, excluding DRAFT/CANCELLED; `reports-metrics.service.ts:23` sums it into `sales.paidAmount`. Monthly Review's Sales/Paid card and Analysis's Sales-versus-Debt/Paid figure expose that separate sales metric. The claim is therefore not “absent from every report”; it is absent from the named **customer Payment history/payment reports/collected movement**, while existing sales-side summaries still show it. Those separate paid and collected figures must not be treated as independently received cash and summed without understanding their sources.

## 3. Production measurement and matching checks

Source: the existing business `DATABASE_URL` in `backend/.env`, database **`homeconnect`**, not the isolated `homeconnect_test_phase4_phase5_phase6` database. Credentials were not printed or copied into this report.

Queries ran inside explicitly **READ ONLY, REPEATABLE READ** transactions. `current_database()` returned `homeconnect`; `current_setting('transaction_read_only')` returned `on`. Only SELECTs and transaction/session configuration were executed; no business DML or migrations.

| Measurement | Result |
|---|---:|
| All sales orders | 18 |
| Orders with `paidAmount > 0` | 12 |
| Sum of `paidAmount`, all sales orders | $983.00 |
| Sum of stored `basePaidAmount` | $983.00 |
| Identifiable unmatched order-paid snapshots | $983.00 / 12 orders |
| First / last paid order date | 2026-08-03 / 2026-08-22 |
| Currency of all sales orders and Payments | USD |
| Payment rows for that exact date window | 7 |
| Sum of `Payment.totalAmount` for that window | $1,932.13 |
| Sum of stored `Payment.baseAmount` for that window | $1,932.13 |
| Voided Payments in that window | 0 |
| Same-window valid Payments with non-deleted customers | 7 / $1,932.13 |
| Gap / same-window Payment total | 50.88% |
| Non-draft subset / same-window Payment total | $883.00 / 45.70% |

All-time Payment totals are **$2,803.13 across 15 active USD Payments**, dated July 28–August 17. That broader total was **not** used as the denominator: using a different period would understate the requested comparison.

Matching approach:

1. Inspected production columns and Prisma relations: Payments have no sales-order foreign key; PaymentAllocations link to debt/installment, while orders link to debt/plan. There is no direct receipt identifier linking an order-paid snapshot to a Payment.
2. Checked allocations through each paid order's linked debt or installment plan. Only **SO-2026-0005** has a related Payment. Its order total is **$844.00**, original order-paid snapshot **$200.00**, and linked original debt **$644.00**. The related Payment is **$644.00**, fully allocated to that debt, created after the order/debt. It settles the distinct unpaid remainder and does **not** represent the $200.00 down payment. It remains in the $1,932.13 denominator; it is not subtracted from the gap.
3. Searched every Payment's reference/notes, case-insensitively for the order number and for the order UUID: **0 candidate orders**.
4. Checked same customer + currency + order/payment date + amount: **0 candidate orders**. Such a match would only be a candidate, not proof of identity.
5. Reviewed all Payment allocations for customers attached to paid orders. They allocate to other debts/orders or the $644.00 remainder above; none identifies an original order-paid receipt. In particular, the later $200.00 Payment belongs to a separate $400.00 debt and is not matched solely because its amount equals a down payment.
6. Seven paid orders are walk-ins without a customer, totaling **$612.00**. Payment requires a customer, so no direct customer-linked receipt exists for them. Five customer-attached paid orders total **$371.00**, including the $100.00 draft.

Do not implement the naïve rule “an order has any related debt Payment, therefore its paidAmount is already reported”: it would incorrectly remove $200.00 from this measured gap.

### Paid-order breakdown

| Order | Order date | Status | Paid snapshot USD |
|---|---|---|---:|
| SO-2026-0002 | 2026-08-03 | DELIVERED | 25.00 |
| SO-2026-0003 | 2026-08-03 | DRAFT | 100.00 |
| SO-2026-0005 | 2026-08-03 | DELIVERED | 200.00 |
| SO-2026-0006 | 2026-08-03 | DELIVERED | 25.00 |
| SO-2026-0008 | 2026-08-03 | DELIVERED | 10.00 |
| SO-2026-0009 | 2026-08-12 | DELIVERED | 29.00 |
| SO-2026-0010 | 2026-08-13 | DELIVERED | 29.00 |
| SO-2026-0011 | 2026-08-13 | PREPARING | 32.00 |
| SO-2026-0012 | 2026-08-13 | DELIVERED | 29.00 |
| SO-2026-0013 | 2026-08-15 | DELIVERED | 25.00 |
| SO-2026-0016 | 2026-08-17 | DELIVERED | 450.00 |
| SO-2026-0018 | 2026-08-22 | DELIVERED | 29.00 |
| **Total** | | **12 orders** | **983.00** |

### Snapshot/date caveat

`paidAmount` is a mutable cumulative snapshot, not a receipt-event ledger. Dates above are **order dates**, not necessarily physical receipt dates. The inspected paid-snapshot audits occur on the same business days as the corresponding orders in this dataset. SO-2026-0008 was created at paid **$20.00**, then changed to **$10.00** on August 3; the requested current snapshot sum uses **$10.00**. The audit reduction is not proof of a refund, and summing successive snapshots would double-count. This report does not claim gross lifetime receipts, reconstruct missing cash events, or infer refund transactions.

## Reproducible aggregate SQL

Executed through the existing Prisma client with an explicit read-only transaction. The equivalent aggregate SQL is:

```sql
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;

SELECT current_database(), current_setting('transaction_read_only');

SELECT count(*) AS all_orders,
       count(*) FILTER (WHERE "paidAmount" > 0) AS paid_orders,
       coalesce(sum("paidAmount"), 0) AS paid_total,
       coalesce(sum("basePaidAmount"), 0) AS base_paid_total,
       min("orderDate") FILTER (WHERE "paidAmount" > 0) AS first_paid_date,
       max("orderDate") FILTER (WHERE "paidAmount" > 0) AS last_paid_date
FROM sales_orders;

WITH span AS (
  SELECT min("orderDate") AS first_date,
         max("orderDate") AS last_date,
         sum("paidAmount") AS paid_total
  FROM sales_orders WHERE "paidAmount" > 0
), comparison AS (
  SELECT count(*) AS payment_count,
         coalesce(sum(p."totalAmount"), 0) AS payment_total
  FROM payments p CROSS JOIN span
  WHERE p."paymentDate" >= span.first_date
    AND p."paymentDate" <= span.last_date
)
SELECT span.*, comparison.*,
       round(100 * paid_total / nullif(payment_total, 0), 4) AS gap_percentage
FROM span CROSS JOIN comparison;

ROLLBACK;
```

Read-only matching probes also joined `sales_orders → payment_allocations → payments` through `debtId` or `installments.installmentPlanId`, checked reference/notes candidates, inspected paid snapshots in `sales_audits`, and verified the draft/status/currency/customer splits above. No heuristic correspondence was silently treated as a proven receipt match.

## Scope and next checkpoint

Prompt 09 measurement is complete. No fix is proposed or selected here. Prompt 10 requires the owner's separate design decision before implementation or historical changes. No tests were rerun because no executable code changed; the prior full-suite return-migration safety blocker remains unresolved and unmodified.
