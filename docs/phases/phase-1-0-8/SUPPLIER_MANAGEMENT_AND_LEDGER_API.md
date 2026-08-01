# Supplier Management And Ledger API

All endpoints use `/api/v1`, require bearer authentication, and return the existing HomeConnect response envelope. Mutation endpoints require an `ADMIN` token.

## Suppliers

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/suppliers` | Create a supplier |
| `GET` | `/suppliers` | Search, filter, sort, and paginate suppliers |
| `GET` | `/suppliers/:supplierId` | Supplier details with lifetime summary |
| `PATCH` | `/suppliers/:supplierId` | Edit supplier fields |
| `POST` | `/suppliers/:supplierId/archive` | Archive supplier |
| `POST` | `/suppliers/:supplierId/restore` | Restore supplier |
| `DELETE` | `/suppliers/:supplierId` | Remove a supplier with no transactions |
| `GET` | `/suppliers/:supplierId/summary` | Lifetime totals and balance |
| `GET` | `/suppliers/:supplierId/audit` | Paginated audit history, admin only |

Supplier list filters: `search`, `isActive`, `sortBy`, `sortOrder`, `page`, and `pageSize`.

Sensitive supplier changes include:

```json
{
  "reason": "Correcting supplier identity",
  "accountPassword": "current-admin-password"
}
```

## Supplier Transactions

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/suppliers/:supplierId/transactions` | Create transaction |
| `GET` | `/suppliers/:supplierId/transactions` | Supplier transaction history |
| `GET` | `/supplier-transactions` | Global paginated transaction list |
| `GET` | `/supplier-transactions/:transactionId` | Transaction details |
| `PATCH` | `/supplier-transactions/:transactionId` | Protected edit |
| `POST` | `/supplier-transactions/:transactionId/remove` | Protected soft removal |
| `POST` | `/supplier-transactions/:transactionId/restore` | Protected restoration |

Create example:

```json
{
  "type": "SUPPLIER_DEBT",
  "amount": "400.00",
  "transactionDate": "2026-07-30",
  "description": "Air conditioner stock invoice",
  "reference": "INV-2026-104",
  "notes": null
}
```

Amounts are positive strings with at most two decimal places. Standard transaction types derive direction on the backend. `SUPPLIER_ADJUSTMENT` additionally requires `direction` as `INCREASE_OWED` or `DECREASE_OWED`.

## Supplier Ledger

`GET /supplier-ledger` accepts `supplierId`, `type`, `direction`, `dateFrom`, `dateTo`, `search`, `includeRemoved`, `sortBy`, `sortOrder`, `page`, and `pageSize`.

The response includes:

- filtered `totalOwed`
- filtered `totalPaid`
- filtered `totalCredit`
- filtered `balance`
- filtered transaction and supplier counts
- paginated transaction rows

Removed transactions affect summaries only when `includeRemoved=true` is explicitly requested. The default newest-first sort is `transactionDate desc` with deterministic tie breakers.
