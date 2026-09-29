# Prompt 05 — Current sales-return trace

Date: 2026-09-10
Branch inspected: `upgrade/phase-02-operations`
Scope: investigation only; no application code was changed.

## Executive finding

There is no return workflow today. There are three separate sales-order mutations—financial unlink, stock restoration, and status change to `RETURNED`—and any financial correction is a fourth (or larger) workflow on the customer-financial screens. Each request is transactional by itself, but the complete business operation is not atomic.

Following the guards in the order the service presents them, the minimum sequence that makes the current `return` endpoint accept a delivered order is:

1. Unlink the debt or installment plan from the sales order.
2. Restore every active stock fulfillment.
3. Submit Return with an admin reason and account password.

Steps 1 and 2 may technically be swapped; both must finish before step 3. This minimum sequence is not financially correct by itself: unlinking does not cancel an obligation, void a payment, refund cash, issue credit, or change any order amount.

The return endpoint changes only `fulfillmentStatus` to `RETURNED` and `updatedById`. It does not change `paidAmount`, `remainingAmount`, `paymentStatus`, VAT snapshots, the linked financial record (which must already have been unlinked), or stock (which must already have been restored). Unlike cancellation, it does not write return timestamp/actor/reason columns on `SalesOrder`; those facts exist in `SalesAudit` only.

## Entry point and request-boundary gates

The UI exposes Return only to an admin and only while the order currently has status `DELIVERED` (`SalesOrderDetailsPage.tsx:89`). It sends the existing endpoint `POST /api/v1/sales-orders/:salesOrderId/return`; there is no return wizard or orchestrating endpoint.

Before the service path runs, the request must pass:

- the authenticated-router mount in `app.ts:112` (`requireAuth`);
- `requireSalesAdmin` on the return route in `sales-orders.routes.ts:40`;
- a valid database UUID for `salesOrderId`;
- `salesOrderActionSchema`: a trimmed reason of 5–1000 characters and a non-empty account password (`sales-orders.validator.ts:117-120`).

These duplicate some service protections intentionally; direct/internal service calls still encounter the service guards below.

## Every guard on the `returnOrder` → `terminalMutation` path

The guards are listed in execution order. They are protections to preserve inside a future single transaction, not candidates for removal.

### 1. Caller must be an administrator

`returnOrder` first executes:

```ts
assertSalesAdmin(user);
```

The policy implementation is:

```ts
if (!user) throw new AuthorizationError('User not authenticated');
if (user.role !== Role.ADMIN) {
  throw new AuthorizationError(
    'Only administrators can perform this sales order action'
  );
}
```

What it prevents: unauthenticated or non-admin callers performing the terminal sales mutation, including callers that bypass the Express route middleware.

### 2. The order must exist

`terminalMutation` calls `requiredOrder`:

```ts
const order = await SalesOrdersRepository.findById(id, tx);
if (!order) throw new NotFoundError('Sales order not found');
```

What it prevents: a return mutation and audit against a missing/stale order identifier.

### 3. No financial foreign key may remain on the order

The exact guard is:

```ts
if (existing.debtId || existing.installmentPlanId) {
  throw new SalesConflictError(
    'Unlink or cancel the financial record from the financial screen before changing this order'
  );
}
```

What it prevents: making the sale terminal while it is still structurally linked to a debt or installment plan.

Important discrepancy: this guard checks only whether the foreign-key value exists. Cancelling a debt/plan changes the financial record's status and cancellation metadata, but does **not** clear `SalesOrder.debtId` or `SalesOrder.installmentPlanId`. Therefore the message's “or cancel” wording is not true of the current persistence path: even after cancellation, the operator must still use Unlink.

### 4. No active stock fulfillment may remain

The exact guard is:

```ts
if (await SalesOrdersRepository.hasActiveStockFulfillmentForOrder(id, tx)) {
  throw new SalesConflictError(
    'Stock is still deducted for this order. Restore it before cancelling or returning it. / لا يزال المخزون مخصومًا لهذا الطلب. أعد المخزون قبل إلغائه أو إرجاعه.'
  );
}
```

The repository query looks specifically for a `SalesOrderStockFulfillment` belonging to the order with status `ACTIVE`.

What it prevents: marking the order returned while inventory still reflects goods as issued. It also catches partial restoration—one remaining active fulfillment blocks the whole return.

### 5. The order must currently be delivered

For the return branch, the exact guard is:

```ts
if (existing.fulfillmentStatus !== SalesOrderFulfillmentStatus.DELIVERED) {
  throw new SalesConflictError('Only delivered orders can be returned');
}
```

What it prevents: returning a draft/in-progress order, returning an already cancelled/returned order, or using Return where Cancel is the appropriate terminal action.

The adjacent `else if (isTerminalSalesOrderStatus(...))` is the cancellation branch and is not reached for a return; the delivered-only guard already rejects terminal statuses.

### 6. Admin verification inputs must exist

`requireAdminVerification` repeats service-level checks:

```ts
if (user.role !== Role.ADMIN) assertSalesAdmin(user);
if (!input.accountPassword) {
  throw new ValidationError('Account password is required');
}
if (!input.reason) throw new ValidationError('Reason is required');
```

What it prevents: an unverified sensitive mutation or an audit record with no stated reason, including an internal call that did not pass through the route validator.

### 7. The account and password must verify as an active admin

The path calls `verifyAdminPassword(..., { action: 'RETURN_SALES_ORDER', recordType: 'SALES_ORDER', ... })`. Its effective guards are:

- five recent failed attempts lock further verification temporarily;
- the user must still exist, be active, and not be deleted;
- the stored role must still be `ADMIN`;
- `bcrypt.compare` must accept the supplied password.

What they prevent: stale sessions, disabled/deleted users, changed roles, password guessing, and a return authorized only by possession of a session token.

From `requiredOrder` onward, the transaction-scoped guards, successful verification log, status update, and `RETURN` sales audit execute through the same `runFinancialTransaction`. The outer role guard runs before that transaction. A failure after transaction entry rolls back the database writes in that return request. It does not roll back prerequisite requests that already committed.

## What the operator must do today

### Minimum UI sequence to make Return succeed

1. Open the delivered sales order. Only an admin sees the Return action.
2. In **Payment / الدفع**, click **Unlink**, enter a reason and the admin's account password, and confirm. This is offered whenever `settlement !== NONE`.
3. In **Inventory fulfillment / حركة المخزون**, select every line with an active fulfillment. Click **Restore Stock / إرجاع إلى المخزون**, enter a reason (and optional note), and confirm. There is no password field for this action, but the route and service require the ADMIN role.
4. Click **Return**, enter a reason of at least five characters and the admin's account password, and confirm.

The stock and financial prerequisite actions are independent, so their relative order is not enforced. Return must be last.

### Extra financial steps needed for a coherent result

Before unlinking, the operator should follow the linked obligation to the customer's financial screen and deal with it explicitly:

1. If a standard debt or installment plan has non-voided payment allocations, void the relevant payment records first. The cancellation policies reject standard debts/plans with payment history; a paid debt or completed plan is also rejected.
2. Cancel the now-unpaid debt or plan with a cancellation reason and account password.
3. Return to the sales order and Unlink anyway. Cancellation does not clear the sales-order foreign key.

There is no direct debt link in the order's Payment card; it displays summary text. The Customer card links to the customer profile, so locating and matching the correct obligation is a manual responsibility.

Even this longer sequence does not refund money. Voiding a payment says that the recorded receipt should no longer count; it is not an outgoing payment. For money recorded only as `SalesOrder.paidAmount`, there is not even a `Payment` row to void.

## What unlinking does to the money

`unlinkFinancial` performs one `SalesOrder.update`:

```ts
{
  debtId: null,
  installmentPlanId: null,
  settlement: SalesOrderSettlement.NONE,
  updatedById: user.userId,
}
```

It then writes a `SalesAudit` with action `UNLINK_FINANCIAL` and the old/new references.

It does **not**:

- update, cancel, or delete the `Debt` or `InstallmentPlan`;
- void a `Payment` or `PaymentAllocation`;
- change `SalesOrder.paidAmount`, `remainingAmount`, `paymentStatus`, currency, exchange rate, or any VAT snapshot;
- create an outgoing cash movement, customer credit, refund, or VAT reversal.

Consequently, unlinking an active half-balance debt leaves that debt in customer receivables and leaves the customer profile's derived outstanding unchanged. It only removes the navigation/relation from the order and changes the order's settlement label to `NONE`. Cancelling the debt/plan, not unlinking it, is what excludes that obligation from the customer profile's derived outstanding.

This separation makes a dangerous state easy to create: an operator can unlink first, satisfy the return guard, and leave an orphaned active debt that still says `Sales order <number>` but has no database relation back to the order.

## Refund and credit concepts found by repository-wide search

There is no implemented customer sales-return refund, credit note, store-credit balance, or outgoing customer-payment model.

The exhaustive search did find similarly named concepts, but none closes this gap:

- `reverseVatSnapshot` in `backend/src/features/tax/domain/vat.ts` is a pure, tested helper that negates a stored VAT snapshot. It has no runtime callers and persists nothing.
- Prepaid-purchase accounting derives a negative “admin debt” while the business holds a customer's prepayment. Comments call that liability a refund amount, but there is no refund/disbursement transaction. It is also a separate pre-delivery workflow, not a delivered sales-order return.
- `SUPPLIER_CREDIT` exists in the supplier ledger. It concerns money owed to suppliers, not credit owed to customers.
- `BalanceBadge` can label a generic negative balance as “Credit,” but it is presentation, not a customer-credit ledger model.
- Planning/audit documents mention future refunds, credit notes, and INV-23. Those are requirements, not implementation.

The Prisma schema confirms the absence: there is no `Refund`, `CreditNote`, customer-credit, payment-direction, or cash-out model/action. `Payment.totalAmount` is positive incoming money allocated to debts/installments; voiding preserves it as historical but removes its balance effect.

## Stock restoration behavior and reversibility

`restoreStock` accepts selected active fulfillment IDs and a reason. In one database transaction for that request, it:

1. verifies the order and each fulfillment exist, belong together, and are still `ACTIVE`;
2. preflights the resulting per-product quantities and the integer ceiling;
3. increases each `Product.stockQuantity` by the originally fulfilled quantity using compare-and-set concurrency protection;
4. appends a positive `StockMovement` of type `SALE_CANCEL_RESTORE`, carrying before/after quantity, reason, optional note, source order-item reference, actor, and timestamp;
5. changes the original fulfillment from `ACTIVE` to `REVERSED` and stores the reversal movement ID, actor, timestamp, and reason;
6. writes one order-level `SalesAudit` action `RESTORE_STOCK` with the line results.

The original stock-out movement is never edited or deleted. A repeated restore of the same fulfillment is rejected, so restoration is not directly reversible by erasing it.

It is operationally compensatable: while the order remains `DELIVERED`, that status is in `DEDUCTIBLE_STATUSES`, the UI marks a restored line eligible, and a new Deduct Stock action can append a new `SALE_FULFILLMENT` movement and active fulfillment. After the order becomes `RETURNED`, deduction is blocked as `ORDER_NOT_ELIGIBLE`. Restoring the sales order status later still does not re-deduct stock automatically; an operator would have to perform another explicit deduction.

There is no item-condition or disposition input. Every selected returned fulfillment is added back to ordinary sellable quantity. A damaged, incomplete, or not-yet-physically-received fridge can therefore overstate available stock if the operator restores it blindly.

## Audit and history produced today

### The Return request itself

A successful return produces:

- an `AdminVerificationLog` with action `RETURN_SALES_ORDER`, outcome `SUCCESS`, actor, timestamp, and IP address;
- one `SalesAudit` with action `RETURN`, the operator-supplied reason, actor ID plus name/username snapshots, timestamp, before `{ fulfillmentStatus: 'DELIVERED' }`, after `{ fulfillmentStatus: 'RETURNED' }`, and request/IP context.

The return facts are not duplicated into return-specific columns on `SalesOrder`. Only `updatedById` and the status are changed. This contrasts with cancellation's `cancelledAt`, `cancelledById`, and `cancelledReason` columns.

### Records produced by prerequisite/correction steps

- **Restore Stock:** one positive `StockMovement` and reversal metadata on each selected `SalesOrderStockFulfillment`, plus one `SalesAudit` action `RESTORE_STOCK`. No admin-password verification log is produced because this action uses role authorization and a reason, not password verification.
- **Unlink:** one `AdminVerificationLog` action `UNLINK_SALES_ORDER_FINANCIAL` and one `SalesAudit` action `UNLINK_FINANCIAL`.
- **Void an existing payment, if needed:** void metadata on the `Payment` and its allocations, recalculated obligation statuses, an `AdminVerificationLog`, and a `FinancialCorrectionAudit` action `VOID_PAYMENT`.
- **Cancel a debt/plan, if needed:** cancellation status plus timestamp, actor ID, and reason on the record. The current `cancelDebt` and `cancelPlan` services do not write a separate `FinancialCorrectionAudit`.

These records can describe the individual actions, but there is no shared return-operation ID tying them together and no transaction boundary across them.

## Worked case: fridge paid half in cash and half on credit

Assume a delivered fridge totals `$1,000`, `$500` was entered as paid at sale, and the remaining `$500` became the order-linked standard debt. The creation path stores `$500` in `SalesOrder.paidAmount` and creates a `$500` debt; it does not create a `Payment` row for the paid-at-sale cash.

The least-wrong procedure available today is:

1. **Identify and cancel the `$500` debt on the customer-financial screen.** Because this debt has no later allocations in the stated example, cancellation should be permitted after admin password verification. If later debt payments do exist, the operator must first find and void each relevant `Payment`; otherwise cancellation is blocked by `Debt with payments requires a dedicated reversal workflow` (or by the paid-debt guard).
2. **Return to the order and Unlink the cancelled debt.** This is still mandatory because debt cancellation leaves `sales_orders.debtId` populated.
3. **Select the fridge's active fulfillment and Restore Stock**, entering a reason. Do this only once the fridge is physically back and sellable; there is no damaged/not-restocked disposition.
4. **Click Return**, enter a reason and the admin account password, and confirm.
5. **Return the original `$500` cash outside the ERP.** There is no application action that can represent this disbursement.

What can go wrong at each step:

| Step | Failure or inconsistency |
|---|---|
| Find/void payments | The operator can pick the wrong payment or miss a shared/multi-allocation payment. Voiding removes the whole payment's allocations and increases derived outstanding; it does not prove cash was paid back. A completed/paid obligation cannot be cancelled until its payments are handled. |
| Cancel debt | Selecting the wrong similarly described debt changes the wrong customer obligation. Cancellation removes the `$500` from the profile's outstanding but does not clear the sales-order link and does nothing about the `$500` already received. |
| Unlink | Unlinking before cancellation leaves the customer owing `$500` after the goods are returned and weakens traceability by removing the direct relation. Unlinking the correct cancelled debt still leaves the order's `paidAmount`, `remainingAmount`, and `paymentStatus` unchanged. |
| Restore stock | Restoring before physical receipt or without checking condition overstates sellable stock. Missing one active fulfillment makes Return fail; successfully restored lines remain restored because the later steps are separate transactions. |
| Return status | A bad password, stale order status, or newly active fulfillment makes this final request fail while all earlier requests remain committed. On success, `RETURNED` alone does not reverse revenue/cash/VAT snapshots or create a return document. |
| Hand back cash | The physical `$500` leaves the shop with no ERP record, actor/reason, payment method, currency/exchange-rate snapshot, receipt, double-refund protection, or reconciliation entry. Forgetting it harms the customer; doing it twice harms the business. |

The possible partial states are the core defect: delivered order with restored stock, delivered order with cancelled/unlinked debt, returned order with an orphaned active debt, or returned order whose physical refund is unknown. The existing guards correctly prevent two of those inconsistencies inside the final status request, but only one atomic return/refund transaction can protect the complete operation.
