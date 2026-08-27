# Supplier Balance Review

Date: 2026-08-27
Branch: `upgrade/phase-01-core-integrity`
Starting commit: `8a6f7877f768fe2cdee844074c3996a5ae392317`

## Result

Supplier balances cannot drift from a separately stored balance because no supplier balance is stored. Every displayed balance is derived from `supplier_transactions` at read time. The arithmetic is consistent across the supplier list, supplier detail/summary, and supplier ledger: active increases minus active decreases.

The core balance calculation is clean. I found three application-level document-consistency gaps and two database-hardening gaps that can make a transaction-derived balance economically misleading even though it still agrees arithmetically with the transaction rows:

1. A removed debt linked to a receiving can be restored after the receiving has been voided. The restored debt becomes active and re-enters the supplier balance while its stock document remains voided.
2. A manually created debt can be linked to an already-voided receiving because link validation checks existence, supplier ownership, uniqueness, and debt type, but not receiving status.
3. The generic transaction update route can change a purchase transaction's `amount` without changing its purchase lines, `amountOverride`, or `amountOverrideReason`. The new transaction amount immediately drives the balance even when the purchase document still says it was not overridden.
4. The database does not constrain transaction type to direction. The application enforces the mapping, but direct SQL, an import, or a future unguarded writer could store a payment/credit with `INCREASE_OWED` or a debt with `DECREASE_OWED`.
5. The database does not enforce `supplier_transactions.amount > 0`. Current application writers do, but a direct or future unguarded writer could store zero or negative money and invert the intended direction semantics.

There is also a lifecycle caveat: a purchase's optional paid-now payment is an ordinary, independent supplier transaction with no relation back to the purchase debt. Removing or restoring the debt does not remove or restore that companion payment. This does not create arithmetic drift—the balance still exactly follows the active rows—but it can produce a business-surprising negative or understated balance after only one half is removed.

## 1. Exact balance computation

`backend/src/features/suppliers/suppliers/suppliers.repository.ts:41-56` implements `balances()`:

1. Group `SupplierTransaction` rows by `supplierId` and `direction`.
2. Include only `status = ACTIVE`.
3. Sum the `amount` column in each group.
4. Return separate `increase` and `decrease` totals, defaulting missing groups to `0.00`.

`backend/src/features/suppliers/suppliers/suppliers.service.ts:32-43` computes the displayed value as:

```text
supplier balance = sum(ACTIVE INCREASE_OWED amounts)
                 - sum(ACTIVE DECREASE_OWED amounts)
```

`SuppliersService.summary()` uses the same rule through `summaryRows()`. `SupplierTransactionsService.summaryForWhere()` also subtracts direction totals. Transaction `type` is used for the `totalPaid` and `totalCredit` breakdowns, but direction—not type—determines balance.

Negative results are allowed and represent net supplier credit/prepayment.

## 2. No stored balance column

The Prisma schema and all migration SQL were searched case-insensitively for fields or columns containing `balance`.

- `Supplier` has identity, contact, archive, ownership, timestamp, and relation fields only (`backend/prisma/schema.prisma:1038-1067`).
- `SupplierTransaction` stores `amount`, `direction`, and `status`, but no balance (`backend/prisma/schema.prisma:1190-1233`).
- No other Prisma model or migration defines a supplier balance column.
- The only migration match was the name of the unrelated stock constraint `stock_movements_nonnegative_balances_check`; it is not a balance column.

`balance` is therefore an API projection, not persisted state.

## 3. Every SupplierTransaction write path

### Production creation paths

| Path | Rows written | Atomicity |
| --- | --- | --- |
| `SupplierTransactionsService.create()` (`supplier-transactions.service.ts:15-30`) | One manually entered debt, payment, credit, or adjustment; plus its supplier audit | Entire operation is inside `runFinancialTransaction()` and all repository writes receive its `tx`. Any validation, actor lookup, create, or audit failure rolls everything back. |
| `SupplierPurchasesService.create()` (`supplier-purchases.service.ts:50-243`) | One `SUPPLIER_DEBT`; optionally one `SUPPLIER_PAYMENT`; purchase lines; optionally receiving, receiving items, stock movements, quick-added products, and audits | Entire purchase workflow uses one `runFinancialTransaction()`. The supplier debt, optional payment, stock effects, document links, lines, and audits commit or roll back together. Idempotent calls use zero retries but remain one serializable database transaction. |

### Production modification paths

| Path | Change | Atomicity |
| --- | --- | --- |
| `SupplierTransactionsService.update()` (`supplier-transactions.service.ts:52-73`) | Changes an active row's type/direction, amount, transaction date, description, reference, or notes | Password verification, before/after balance reads, update, actor lookup, and audit are all inside one serializable transaction. A failure leaves the transaction unchanged. |
| `SupplierTransactionsService.remove()` via `setStatus()` (`supplier-transactions.service.ts:76-90`) | Sets `status=REMOVED` and removal metadata | Status update and audit are in one serializable transaction. No physical deletion occurs. |
| `SupplierTransactionsService.restore()` via `setStatus()` (`supplier-transactions.service.ts:77-90`) | Sets `status=ACTIVE` and clears removal metadata | Status update and audit are in one serializable transaction. |

### Physical removal

There is no production repository delete method and no production service or route physically deletes a `SupplierTransaction`. The only direct Prisma create/update/delete calls outside the repository are database-test fixture setup and cleanup. Migration and repair SQL create or alter the table but do not create business transaction rows.

The write repository itself requires a `Prisma.TransactionClient` for both `create()` and `update()` (`supplier-transactions.repository.ts:56,63`), which prevents current services from accidentally using the global client for those writes.

## 4. Transaction boundary and partial-state review

`runFinancialTransaction()` (`backend/src/features/financial/infrastructure/transaction.ts:31-41`) wraps its callback in `prisma.$transaction(..., { isolationLevel: Serializable })`. It retries Prisma `P2034` serialization/write-conflict failures by default; disabling retries for keyed idempotent supplier purchases changes retry behavior, not rollback atomicity.

All five production mutation entry points listed above use this wrapper. Audit rows are written through the same transaction client. Purchase creation additionally passes the same client into receiving, stock, product, line, and payment writes. I found no production path capable of committing a SupplierTransaction while leaving its same-command audit or purchase writes partially committed.

## 5. Removed and restored transactions

Removed transactions are excluded consistently:

- `SuppliersRepository.balances()` explicitly filters `status: ACTIVE`.
- `SuppliersRepository.summaryRows()` explicitly filters `status: ACTIVE`.
- `supplierTransactionWhere()` adds `status: ACTIVE` whenever `includeRemoved` is false; internal balance reads always call it with `includeRemoved: false`.

Removal therefore subtracts the row's effect from the next derived balance read. Restoration changes the same row back to `ACTIVE`, so it is automatically re-included. No balance-repair write is necessary because there is no stored balance.

The before/after values recorded in the removal/restoration audit are also calculated within the same transaction as the status change.

## 6. Purchase lines and amountOverride

Purchase creation first calculates:

```text
lineSum = sum(each SupplierPurchaseLine.lineTotal)
transaction.amount = amountOverride ?? lineSum
```

The balance always uses `SupplierTransaction.amount`. Therefore:

- without an override, the line sum drives the stored transaction amount and thus the balance;
- with an override, the override drives the balance;
- purchase lines retain the unmodified line totals;
- `amountOverride=true`, its reason, and the audit's `lineSum` preserve why the header differs from its lines.

This intended creation behavior is explicit in `supplier-purchases.service.ts:149-168` and covered by its service tests.

Finding: the generic update endpoint is also available for purchase-header transactions. It can change `amount`, but its update input has no purchase-line or override fields and the service does not detect that the row has purchase lines. Consequently an administrator can change `transaction.amount` while `amountOverride` remains false and the line sum remains unchanged. The supplier balance will match the edited transaction, but the purchase document's internal explanation becomes inconsistent.

## 7. Voided receiving and linked supplier transaction

`SupplierReceivingsService.void()` (`supplier-receivings.service.ts:238-340`) does not modify the linked supplier transaction. It reads at most one linked transaction and:

- returns HTTP 409 `RECEIVING_HAS_ACTIVE_DEBT` if that transaction is active;
- allows the void only after the linked debt has been removed;
- reverses stock, marks the receiving/items voided/reversed, and writes the receiving audit in one transaction;
- leaves the removed linked debt in place for history.

That separation prevents voiding stock while an active linked payable remains. However, transaction restoration does not check its linked receiving's status, so the removed debt can later be restored and re-enter the balance after the receiving is voided. Similarly, `validateReceivingLink()` does not read or validate receiving status, allowing a new debt to be linked to a voided receiving when no transaction is already linked.

## Final assessment

The supplier balance formula itself is authoritative and cannot become stale: it has no cached or stored value to drift. All current application mutation commands are atomic, and removed/restored rows are handled correctly by the active-row filter.

The clean arithmetic result should not hide the document-consistency findings. The balance can be made economically misleading through supported admin flows involving voided receivings, independent paid-now payments, or edits to purchase-header amounts. Direct database writes also lack type/direction and positive-amount constraints. These should be addressed or explicitly accepted in later implementation work; Prompt 9 made no code changes.
