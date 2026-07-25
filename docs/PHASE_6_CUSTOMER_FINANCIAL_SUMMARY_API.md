# Phase 6 Customer Financial Summary API

Date: 2026-07-24

## Get Customer Financial Summary

```http
GET /api/v1/customers/:customerId/financial-summary
```

Authentication: required.

Authorization: any authenticated user who can read customers may read this endpoint. Admin access is not required.

Missing or soft-deleted customers return `404`. Inactive non-deleted customers remain readable for financial history.

## Query Parameters

- `includeCancelled=false`: include cancelled debts/plans in returned lists when `true`
- `includePayments=true`: include recent payment history when `true`
- `paymentLimit=20`: maximum `100`
- `debtLimit=50`: maximum `100`
- `planLimit=50`: maximum `100`

## Response

```json
{
  "success": true,
  "data": {
    "customer": {
      "id": "...",
      "name": "Ali Ahmad",
      "phone": "70123456",
      "address": null,
      "notes": null,
      "isActive": true
    },
    "summary": {
      "totalOutstanding": "850.00",
      "singleDebtOutstanding": "400.00",
      "installmentPlanOutstanding": "450.00",
      "totalPaid": "350.00",
      "activeDebtCount": 1,
      "activePlanCount": 1,
      "overdueDebtCount": 0,
      "overdueInstallmentCount": 0,
      "nextDueDate": "2026-08-01",
      "nextDueAmount": "100.00"
    },
    "debts": [],
    "installmentPlans": [],
    "overdueItems": [],
    "nextDue": {
      "date": "2026-08-01",
      "totalAmount": "100.00",
      "items": []
    },
    "recentPayments": []
  },
  "meta": {
    "timestamp": "2026-07-24T00:00:00.000Z"
  }
}
```

## Debt Items

Each debt includes:

- `id`
- `description`
- `originalAmount`
- `totalPaid`
- `remainingBalance`
- `dueDate`
- `status`
- `calculatedStatus`
- `storedStatus`
- `notes`
- `createdAt`
- `updatedAt`
- `createdBy`
- `cancellation`

## Installment-Plan Items

Each plan includes:

- `id`
- `description`
- `totalAmount`
- `totalPaid`
- `remainingBalance`
- `startDate`
- `installmentCount`
- `frequency`
- `completedInstallmentCount`
- `overdueInstallmentCount`
- `nextDueDate`
- `status`
- `calculatedStatus`
- `storedStatus`
- `notes`
- `createdAt`
- `updatedAt`
- `createdBy`
- `cancellation`
- `scheduleSummary`

Full schedules remain available through:

```http
GET /api/v1/installment-plans/:planId
```

## Overdue Items

Each overdue item includes:

- `type`: `DEBT` or `INSTALLMENT`
- `obligationId`
- `planId`
- `description`
- `dueDate`
- `originalDueAmount`
- `paidAmount`
- `remainingAmount`
- `daysOverdue`
- `calculatedStatus`

## Recent Payments

Recent payments are unique `Payment` records sorted by payment date descending, then creation time descending.

Voided payments are visible but excluded from financial totals.

Allocations identify:

- `targetType`
- `debtId`
- `installmentId`
- `planId`
- `description`
- `amount`

## Error Responses

- `400`: invalid customer ID or query parameter
- `401`: unauthenticated
- `404`: customer not found
- `500`: unexpected server error
