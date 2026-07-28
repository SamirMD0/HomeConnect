# Phase 5 Installment Plan API

Date: 2026-07-24

## Overview

Phase 5 adds backend-only installment plan APIs. The customer must already exist. The API never creates customers and never accepts client-generated schedules.

Money values are strings. Business dates use strict `YYYY-MM-DD`.

## Auth

All routes require authentication.

Admin-only:

- `POST /api/v1/customers/:customerId/installment-plans`
- `POST /api/v1/installment-plans/:planId/payments`
- `POST /api/v1/installment-plans/:planId/cancel`

Authenticated read:

- `GET /api/v1/customers/:customerId/installment-plans`
- `GET /api/v1/installment-plans/:planId`
- `GET /api/v1/installment-plans/:planId/payments`

## Create Installment Plan

```http
POST /api/v1/customers/:customerId/installment-plans
```

Request:

```json
{
  "totalAmount": "600.00",
  "description": "Refrigerator",
  "startDate": "2026-08-01",
  "installmentCount": 6,
  "frequency": "MONTHLY",
  "notes": "Optional"
}
```

Response includes:

- plan ID
- customer
- total amount
- total paid
- remaining balance
- start date
- installment count
- frequency
- calculated status
- next due date
- completed installment count
- overdue installment count
- schedule
- payment history

Schedule items include:

- installment ID
- installment number
- due date
- amount due
- total paid
- remaining amount
- calculated status
- stored status
- paid date

## List Customer Plans

```http
GET /api/v1/customers/:customerId/installment-plans
```

Query:

- `page`
- `limit`
- `status`
- `includeCancelled`
- `sortOrder=asc|desc`

## Get Plan Details

```http
GET /api/v1/installment-plans/:planId
```

Returns complete plan details, schedule, payments, allocations, creator, customer, cancellation metadata, and calculated totals.

## List Plan Payments

```http
GET /api/v1/installment-plans/:planId/payments
```

Returns immutable payment history for the plan.

## Record Plan Payment

```http
POST /api/v1/installment-plans/:planId/payments
```

Request:

```json
{
  "amount": "150.00",
  "paymentDate": "2026-08-15",
  "paymentMethod": "CASH",
  "reference": "optional",
  "notes": "optional",
  "idempotencyKey": "optional-key-123"
}
```

Rules:

- One `Payment` row is created.
- One or more `PaymentAllocation` rows are created.
- Allocations target installments only.
- `debtId` is null.
- Oldest unpaid or partially paid installment receives payment first.
- Ordering is due date, then installment number.
- Paid and cancelled installments are skipped.
- Payment cannot exceed plan remaining balance.
- Completed and cancelled plans reject new payments.
- A fully paid installment gets `paidDate` equal to the business payment date that completed it.

## Cancel Plan

```http
POST /api/v1/installment-plans/:planId/cancel
```

Request:

```json
{
  "reason": "Agreement cancelled"
}
```

Policy:

- Only plans with no valid non-voided payments can be cancelled.
- Plan and installment rows are preserved.
- Unpaid/partially paid active installments become `CANCELLED`.
- Paid installments remain historically paid.
- Cancellation stores reason, actor, and timestamp.

## Status Rules

Installment priority:

1. `CANCELLED`
2. `PAID`
3. `OVERDUE`
4. `PARTIALLY_PAID`
5. `PENDING`

Plan priority:

1. `CANCELLED`
2. `COMPLETED`
3. `OVERDUE`
4. `ACTIVE`

## Idempotency

For plan payments:

- Same key and same logical request returns the existing result.
- Same key and different plan, amount, payment date, payment method, key, or actor returns `409`.
- No key proceeds with normal transaction and overpayment checks.

## Errors

- `400`: invalid body, money, date, count, enum, or unknown field
- `401`: unauthenticated
- `403`: authenticated non-admin mutation
- `404`: customer or plan not found
- `409`: overpayment, completed plan, cancelled plan, idempotency conflict, cancellation blocked by payments
- `500`: internal invariant failure

## Manual Smoke

Use safe test data only.

1. Create a `600.00` plan with 6 monthly installments.
2. Confirm 6 schedule rows.
3. Confirm first due date is `2026-08-01`.
4. Confirm schedule total is `600.00`.
5. Pay `150.00`.
6. Confirm first installment is `PAID`.
7. Confirm second installment is `PARTIALLY_PAID` with `50.00` remaining.
8. Retry with same idempotency key and confirm no duplicate payment.
9. Attempt overpayment and confirm `409`.
10. Pay remaining `450.00`.
11. Confirm plan is `COMPLETED`.
12. Attempt another payment and confirm `409`.
13. Create a separate unpaid plan and cancel it.
14. Confirm payment after cancellation is rejected.
15. Confirm non-admin mutation returns `403`.
