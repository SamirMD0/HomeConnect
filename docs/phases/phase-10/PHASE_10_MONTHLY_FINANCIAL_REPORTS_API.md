# Phase 10 Monthly Financial Reports API

Date: 2026-07-24

All endpoints require authentication and `ADMIN` role.

## Monthly Debt Snapshot

```http
GET /api/v1/reports/monthly-debts
```

Query parameters:

| Name | Default | Notes |
| --- | --- | --- |
| `month` | required | Strict `YYYY-MM` |
| `mode` | `SNAPSHOT` | Only `SNAPSHOT` is accepted |
| `includeZero` | `false` | Includes zero-balance customer rows |
| `includeCancelled` | `false` | Cancelled obligations do not contribute active outstanding |
| `overdueOnly` | `false` | Restricts rows and summary to customers with overdue amount |
| `search` | empty | Customer name or phone |
| `page` | `1` | Positive integer |
| `limit` | `50` | Max `500` |
| `sortBy` | `OUTSTANDING` | `CUSTOMER`, `OUTSTANDING`, `OVERDUE`, `LAST_PAYMENT` |
| `sortOrder` | `DESC` | `ASC`, `DESC` |

Example:

```http
GET /api/v1/reports/monthly-debts?month=2026-07&sortBy=OUTSTANDING&sortOrder=DESC
```

Response shape:

```json
{
  "success": true,
  "data": {
    "mode": "SNAPSHOT",
    "summary": {
      "month": "2026-07",
      "cutoffDate": "2026-07-31",
      "customerCount": 10,
      "totalOutstanding": "13420.00",
      "singleDebtOutstandingTotal": "7000.00",
      "installmentPlanOutstandingTotal": "6420.00",
      "totalAmountDueByCutoff": "4800.00",
      "totalOverdueAtCutoff": "1200.00",
      "totalPaymentsReceivedDuringMonth": "900.00",
      "customersWithOverdueDebt": 3,
      "customersWithActiveInstallmentPlans": 5
    },
    "rows": [
      {
        "customer": { "id": "...", "name": "Ali Ahmad", "phone": "70123456" },
        "singleDebtOutstanding": "450.00",
        "installmentPlanOutstanding": "600.00",
        "totalOutstanding": "1050.00",
        "amountDueByCutoff": "550.00",
        "overdueAmountAtCutoff": "200.00",
        "activeDebtCount": 2,
        "activePlanCount": 1,
        "overdueDebtCount": 1,
        "overdueInstallmentCount": 2,
        "lastPaymentDate": "2026-07-20",
        "nextDueDateAfterCutoff": "2026-08-15"
      }
    ],
    "pagination": { "page": 1, "limit": 50, "total": 10, "totalPages": 1 }
  }
}
```

All money values are strings.

## Monthly Debt CSV

```http
GET /api/v1/reports/monthly-debts/export.csv?month=2026-07
```

Returns UTF-8 CSV with BOM and `Content-Disposition` filename:

```text
monthly-debts-2026-07.csv
```

CSV columns:

- Customer Name
- Phone
- Single Debt Outstanding
- Installment Plan Outstanding
- Total Outstanding
- Due By Cutoff
- Overdue At Cutoff
- Active Debt Count
- Active Plan Count
- Overdue Debt Count
- Overdue Installment Count
- Last Payment Date
- Next Due Date After Cutoff

## Monthly Financial Activity

```http
GET /api/v1/reports/monthly-financial-activity
```

Query parameters:

| Name | Default | Notes |
| --- | --- | --- |
| `month` | required | Strict `YYYY-MM` |
| `customerId` | optional | UUID |
| `page` | `1` | Positive integer |
| `limit` | `50` | Max `500` |

Response shape:

```json
{
  "success": true,
  "data": {
    "summary": {
      "month": "2026-07",
      "startDate": "2026-07-01",
      "endDate": "2026-07-31",
      "newSingleDebtAmount": "500.00",
      "newInstallmentPlanAmount": "600.00",
      "paymentsReceived": "200.00",
      "netFinancialChange": "900.00",
      "debtsCreated": 1,
      "plansCreated": 1,
      "payments": 1,
      "customerCountAffected": 1
    },
    "items": [],
    "pagination": { "page": 1, "limit": 50, "total": 0, "totalPages": 1 }
  }
}
```
