# Phase 9 Unified Financial Ledger API

Date: 2026-07-24

## Get Financial Ledger

```http
GET /api/v1/financial-ledger
```

Authentication required. Any authenticated user can read the global ledger. Mutations remain admin-only through existing debt and installment-plan endpoints.

## Query Parameters

- `type=ALL|DEBT|INSTALLMENT_PLAN|PAYMENT|OVERDUE`
- `status=ACTIVE|OVERDUE|PAID_COMPLETED|CANCELLED`
- `customerId`
- `search`
- `dueFrom`
- `dueTo`
- `paymentFrom`
- `paymentTo`
- `includeCancelled=true|false`
- `page`
- `limit`
- `sortBy=date|createdAt|customer|amount`
- `sortOrder=asc|desc`

Dates use strict `YYYY-MM-DD`.

## Response

```json
{
  "success": true,
  "data": {
    "summary": {
      "totalOutstanding": "1850.00",
      "totalPaid": "950.00",
      "activeDebtCount": 4,
      "activePlanCount": 2,
      "overdueDebtCount": 1,
      "overdueInstallmentCount": 3
    },
    "items": [],
    "pagination": {
      "page": 1,
      "limit": 25,
      "total": 50,
      "totalPages": 2
    }
  },
  "meta": {
    "timestamp": "2026-07-24T00:00:00.000Z"
  }
}
```

## Item Types

Debt item:

```json
{
  "type": "DEBT",
  "id": "...",
  "customer": { "id": "...", "name": "Ali Ahmad", "phone": "70123456" },
  "description": "Television",
  "originalAmount": "600.00",
  "totalPaid": "200.00",
  "remainingBalance": "400.00",
  "dueDate": "2026-08-10",
  "status": "PARTIALLY_PAID",
  "storedStatus": "PARTIALLY_PAID",
  "notes": null,
  "createdAt": "...",
  "updatedAt": "...",
  "cancellation": null
}
```

Installment-plan item:

```json
{
  "type": "INSTALLMENT_PLAN",
  "id": "...",
  "customer": { "id": "...", "name": "Ali Ahmad", "phone": "70123456" },
  "description": "Refrigerator",
  "totalAmount": "600.00",
  "totalPaid": "150.00",
  "remainingBalance": "450.00",
  "startDate": "2026-08-01",
  "installmentCount": 6,
  "frequency": "MONTHLY",
  "completedInstallmentCount": 1,
  "overdueInstallmentCount": 0,
  "nextDueDate": "2026-09-01",
  "status": "ACTIVE",
  "storedStatus": "ACTIVE",
  "notes": null,
  "createdAt": "...",
  "updatedAt": "...",
  "cancellation": null,
  "scheduleSummary": {
    "totalInstallments": 6,
    "completedInstallments": 1,
    "remainingInstallments": 5,
    "nextInstallment": {
      "id": "...",
      "installmentNumber": 2,
      "dueDate": "2026-09-01",
      "remainingAmount": "100.00",
      "status": "PENDING"
    }
  }
}
```

Payment item:

```json
{
  "type": "PAYMENT",
  "id": "...",
  "customer": { "id": "...", "name": "Ali Ahmad", "phone": "70123456" },
  "amount": "150.00",
  "paymentDate": "2026-08-15",
  "paymentMethod": "CASH",
  "status": "COMPLETED",
  "reference": "receipt-1",
  "notes": null,
  "idempotencyKey": null,
  "createdAt": "...",
  "voidedAt": null,
  "allocations": []
}
```

## Error Responses

- `400`: invalid query parameter
- `401`: unauthenticated
- `500`: unexpected server error
