# Phase 9 Unified Financial Ledger Design

Date: 2026-07-24

## Endpoint Decision

The existing APIs are customer-scoped:

- customer debts
- customer installment plans
- customer financial summary
- debt detail
- installment-plan detail

Using them for the global Ledger would require fetching customers and then issuing per-customer financial requests. Phase 9 therefore adds a focused global endpoint:

```http
GET /api/v1/financial-ledger
```

The endpoint loads debts, installment plans, and payments with a fixed set of Prisma queries and returns a normalized discriminated union. No schema change or migration is introduced.

## Old Vs New Data Source

Old Ledger source:

- `/api/v1/transactions`
- generic `Transaction` rows
- parent/child transaction payments
- editable/deletable rows
- client-side balance calculations

New Ledger source:

- `/api/v1/financial-ledger`
- `Debt`
- `InstallmentPlan`
- `Installment`
- `Payment`
- `PaymentAllocation`
- backend-calculated balances and statuses

The legacy transaction data and routes remain untouched. The new Ledger page no longer shows legacy transaction rows as its primary table.

## Normalized Items

The endpoint returns:

- `DEBT` items with original amount, paid amount, remaining balance, due date, and debt status
- `INSTALLMENT_PLAN` items with total amount, paid amount, remaining balance, next due date, progress, and plan status
- `PAYMENT` items with amount, payment date, method, status, and allocation summaries

Payment rows are unique `Payment` records. Multiple allocations remain nested under one payment item.

## Filters

Supported filters:

- type: all, debts, installment plans, payments, overdue
- simplified status: active, overdue, paid/completed, cancelled
- customer search by name or phone
- customer ID
- due date range
- payment date range
- include cancelled/voided
- pagination
- sort

Calculated status filtering is performed in the service because stored statuses can be stale relative to business date and allocations.

## Summary

The backend returns authoritative global totals:

- total outstanding
- total paid
- active debt count
- active plan count
- overdue debt count
- overdue installment count

Money is handled with the existing Decimal helpers and returned as strings.

## Mutation Reuse

The Ledger page reuses Phase 8 dialogs:

- add financial obligation
- record debt payment
- cancel debt
- record installment-plan payment
- cancel installment plan

Because Ledger is global, add/payment flows first select an existing customer. The payment flow then requires selecting an eligible debt or installment plan before entering an amount.

Successful mutations invalidate the global financial-ledger query. Phase 8 hooks still invalidate the relevant customer summary and detail queries.

## Legacy Coexistence

Legacy transaction tables and routes are retained for compatibility, but the new Ledger page does not mix legacy records into the financial totals or primary table.

No edit, delete, pencil, or trash actions exist in the new financial ledger.

## Test Matrix

Backend:

- route authentication
- query validation
- zero summary
- debt serialization
- plan serialization
- one payment with multiple allocations appears once
- cancelled excluded by default
- include cancelled behavior
- overdue filtering
- pagination
- customer search/date filter forwarding
- totals are strings

Frontend:

- API calls `/financial-ledger`, not `/transactions`
- stable query key
- summary cards render
- debt, plan, and payment rows render
- payment allocation summary renders under one payment row
- no edit/delete actions
- read-only users do not see mutation actions
- filters render
- loading, error, and empty states render
- Phase 7/8 customer financial tests still pass
