# Phase 6 Customer Financial Summary Design

Date: 2026-07-24

## Scope

Phase 6 adds a backend-only customer financial summary endpoint:

```http
GET /api/v1/customers/:customerId/financial-summary
```

The endpoint is read-only and uses the existing authenticated customer-read policy. It does not require admin access because no mutation occurs.

## Response Contract

The response uses the standard API envelope and returns:

- `customer`: customer identity and read-only profile fields
- `summary`: authoritative totals, counters, and next due rollup
- `debts`: compact single-debt financial views
- `installmentPlans`: compact plan views with schedule summary
- `overdueItems`: normalized overdue debt/installment obligations
- `nextDue`: normalized earliest unresolved due date and same-date items
- `recentPayments`: unique payment records with allocations

All money values are strings with two decimals. Business dates use `YYYY-MM-DD`.

## Customer Read Policy

Soft-deleted customers are treated as missing and return `404`.

Inactive customers remain readable when they are not soft-deleted. Historical financial records must remain accessible after a customer becomes inactive.

## Aggregation Rules

Single-debt outstanding sums remaining balances for non-cancelled debts.

Installment-plan outstanding sums remaining balances for non-cancelled plans.

Total outstanding is:

```text
singleDebtOutstanding + installmentPlanOutstanding
```

Total paid is aggregated from unique non-voided `Payment` rows for the customer. It does not sum allocation rows, so one payment allocated to multiple installments is counted once.

Active debt count uses calculated statuses and excludes `PAID` and `CANCELLED`.

Active plan count uses calculated statuses and excludes `COMPLETED` and `CANCELLED`.

Voided payments remain visible in recent history but do not affect balances or total paid.

Cancelled debts and plans are excluded by default. `includeCancelled=true` includes them in the returned lists, but they remain excluded from outstanding totals, overdue items, and next-due calculations.

## Overdue Policy

Overdue items are normalized into one list:

- debt items use remaining debt balance
- installment items use remaining installment amount
- paid and cancelled obligations are excluded
- items sort by oldest due date, then stable obligation ID

`daysOverdue` is calculated from business dates only.

## Next-Due Policy

The endpoint finds the earliest unresolved due date across non-cancelled debts and installments.

If multiple obligations share that date, `nextDue.totalAmount` is the combined remaining amount for that date, and `nextDue.items` lists each obligation.

Overdue obligations can be the next due item when they are the earliest unresolved obligations.

## Query Strategy

The repository performs a small set of explicit Prisma queries:

- customer read
- customer debts with payment allocations
- customer installment plans with installments and payment allocations
- non-voided payment total aggregate
- recent payments with allocations when `includePayments=true`

Business status decisions, money calculations, date formatting, overdue normalization, and response construction remain in the service layer.

No N+1 query pattern is introduced.

## Test Matrix

Focused tests cover:

- customer missing and inactive customer read behavior
- zero-summary customers
- debt balances and overdue debts
- installment-plan balances and overdue installments
- combined outstanding totals
- unique payment totals for multi-allocation payments
- same-date next-due aggregation
- cancelled obligation include/exclude behavior
- recent payment history with allocations and voided payment visibility
- route auth and query validation
- opt-in isolated database integration
