# Phase 4 Single Debt API

Date: 2026-07-24

## Overview

Phase 4 adds backend-only APIs for single customer debts. The customer must already exist. These endpoints never create customers and never modify legacy `Transaction` records.

All money values are strings. All business dates use strict `YYYY-MM-DD`.

## Authentication And Authorization

All endpoints require authentication.

Admin-only mutations:

- `POST /api/v1/customers/:customerId/debts`
- `POST /api/v1/debts/:debtId/payments`
- `POST /api/v1/debts/:debtId/cancel`

Authenticated read endpoints:

- `GET /api/v1/customers/:customerId/debts`
- `GET /api/v1/debts/:debtId`
- `GET /api/v1/debts/:debtId/payments`

## Endpoints

### Create Debt

```http
POST /api/v1/customers/:customerId/debts
```

Request:

```json
{
  "amount": "600.00",
  "description": "Refrigerator",
  "dueDate": "2026-08-10",
  "notes": "Optional"
}
```

Response:

```json
{
  "success": true,
  "data": {
    "id": "...",
    "customer": {
      "id": "...",
      "name": "Ali Ahmad",
      "phone": "70123456"
    },
    "description": "Refrigerator",
    "originalAmount": "600.00",
    "totalPaid": "0.00",
    "remainingBalance": "600.00",
    "dueDate": "2026-08-10",
    "status": "UNPAID",
    "storedStatus": "UNPAID",
    "notes": null,
    "createdAt": "...",
    "updatedAt": "...",
    "createdBy": {
      "id": "...",
      "name": "...",
      "username": "..."
    },
    "cancellation": null,
    "payments": []
  },
  "meta": {
    "timestamp": "..."
  }
}
```

Rejected fields include `status`, `createdById`, `totalPaid`, and `remainingBalance`.

### List Customer Debts

```http
GET /api/v1/customers/:customerId/debts
```

Query parameters:

- `page`
- `limit`
- `status`
- `includeCancelled`
- `sortBy=dueDate|createdAt`
- `sortOrder=asc|desc`

Response data is an array of debt view models. Pagination is returned in `meta.pagination`.

### Get Debt

```http
GET /api/v1/debts/:debtId
```

Returns the complete debt view model, including payment history and cancellation metadata.

### List Debt Payments

```http
GET /api/v1/debts/:debtId/payments
```

Returns immutable payment history for the debt.

### Record Debt Payment

```http
POST /api/v1/debts/:debtId/payments
```

Request:

```json
{
  "amount": "200.00",
  "paymentDate": "2026-07-24",
  "paymentMethod": "CASH",
  "reference": "optional",
  "notes": "optional",
  "idempotencyKey": "optional-key-123"
}
```

Rules:

- Payment creates one `Payment` row.
- Payment creates one `PaymentAllocation` row targeting the debt.
- `installmentId` is null.
- Payment cannot exceed remaining balance.
- Paid and cancelled debts reject new payments.
- Payment and allocation are created in one serializable Prisma transaction.

### Cancel Debt

```http
POST /api/v1/debts/:debtId/cancel
```

Request:

```json
{
  "reason": "Customer returned the product"
}
```

Policy:

- Only debts with no valid non-voided payments can be cancelled.
- Debts with payment history require a later reversal/refund/void workflow.
- Cancellation stores reason, actor, and timestamp.
- The debt row is not deleted.

## Status Rules

Debt status priority:

1. `CANCELLED`
2. `PAID`
3. `OVERDUE`
4. `PARTIALLY_PAID`
5. `UNPAID`

Overdue outranks partial payment.

## Idempotency Rules

For payment creation:

- Same idempotency key and same logical request returns the existing result.
- Same idempotency key and different debt, amount, payment date, payment method, idempotency key, or actor returns `409`.
- Requests without an idempotency key proceed with normal transaction and overpayment checks.

## Error Responses

Common mappings:

- `400`: invalid body, money, date, enum, or unknown field
- `401`: unauthenticated
- `403`: authenticated but not admin for mutation
- `404`: customer or debt not found
- `409`: overpayment, paid debt, cancelled debt, idempotency conflict
- `500`: internal invariant failure

Error envelope:

```json
{
  "success": false,
  "error": {
    "code": "OVERPAYMENT",
    "message": "Payment amount exceeds debt remaining balance"
  },
  "meta": {
    "timestamp": "..."
  }
}
```

## Manual Verification Steps

Use a safe test customer only.

1. Login as admin and capture the bearer token.
2. Create or select a safe test customer.
3. `POST /api/v1/customers/:customerId/debts` with `600.00`.
4. `GET /api/v1/debts/:debtId` and confirm `UNPAID`.
5. `POST /api/v1/debts/:debtId/payments` with `200.00`.
6. Confirm `totalPaid=200.00`, `remainingBalance=400.00`, `PARTIALLY_PAID`.
7. Attempt `401.00` payment and confirm `409`.
8. Pay `400.00` and confirm `PAID`.
9. Attempt another payment and confirm `409`.
10. Create another debt with old due date and confirm `OVERDUE`.
11. Create another eligible debt and cancel it.
12. Confirm cancellation metadata.
13. Attempt payment after cancellation and confirm `409`.
14. Repeat mutation as an employee and confirm `403`.
