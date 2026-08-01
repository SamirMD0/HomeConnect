# Prepaid Purchase API

## Create

```http
POST /api/v1/customers/:customerId/prepaid-purchases
Authorization: Bearer <admin-token>
Content-Type: application/json
```

```json
{
  "itemName": "Air conditioner",
  "paymentAmount": "100.00",
  "fullAmount": "400.00",
  "notes": "Customer will collect the item later"
}
```

The initial payment method is `CASH` and its business date is the current configured business date.

Success returns the standard debt detail view with:

```json
{
  "kind": "PREPAID_PURCHASE",
  "originalAmount": "400.00",
  "totalPaid": "100.00",
  "remainingBalance": "300.00",
  "adminDebt": "-300.00",
  "status": "PARTIALLY_PAID"
}
```

`remainingBalance` stays positive for payment validation. `adminDebt` is the display and reporting value. Prepaid purchases are excluded from customer receivables and standard outstanding totals.

Validation returns `400` for missing fields, invalid money, or payment above the full amount. Authentication and authorization use the existing financial admin policy.

Later payments use the existing endpoint:

```http
POST /api/v1/debts/:debtId/payments
```
