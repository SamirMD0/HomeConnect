Every route resolves accessible active branches from the database after requireAuth. 68 3B method/path pairs are covered.

| Method | Path | Scope enforcement |
| --- | --- | --- |
| GET | `/api/v1/debts/:debtId` | Load branch-only record → assertInScope; inherited ownership for prepaid/photos. |
| GET | `/api/v1/debts/:debtId/payments` | Load branch-only record → assertInScope; inherited ownership for prepaid/photos. |
| PATCH | `/api/v1/debts/:debtId` | Load → assertInScope → writeBranch before validators/roles; service checks cross-record parents. |
| POST | `/api/v1/debts/:debtId/corrections` | Load → assertInScope → writeBranch before validators/roles; service checks cross-record parents. |
| POST | `/api/v1/debts/:debtId/payments` | Load → assertInScope → writeBranch before validators/roles; service checks cross-record parents. |
| POST | `/api/v1/debts/:debtId/cancel` | Load → assertInScope → writeBranch before validators/roles; service checks cross-record parents. |
| GET | `/api/v1/installment-plans/:planId` | Load branch-only record → assertInScope; inherited ownership for prepaid/photos. |
| GET | `/api/v1/installment-plans/:planId/payments` | Load branch-only record → assertInScope; inherited ownership for prepaid/photos. |
| PATCH | `/api/v1/installment-plans/:planId` | Load → assertInScope → writeBranch before validators/roles; service checks cross-record parents. |
| POST | `/api/v1/installment-plans/:planId/corrections` | Load → assertInScope → writeBranch before validators/roles; service checks cross-record parents. |
| POST | `/api/v1/installment-plans/:planId/payments` | Load → assertInScope → writeBranch before validators/roles; service checks cross-record parents. |
| POST | `/api/v1/installment-plans/:planId/cancel` | Load → assertInScope → writeBranch before validators/roles; service checks cross-record parents. |
| GET | `/api/v1/payments/:paymentId/receipt` | Load branch-only record → assertInScope; inherited ownership for prepaid/photos. |
| POST | `/api/v1/payments/:paymentId/void` | Load → assertInScope → writeBranch before validators/roles; service checks cross-record parents. |
| POST | `/api/v1/payments/:paymentId/corrections` | Load → assertInScope → writeBranch before validators/roles; service checks cross-record parents. |
| POST | `/api/v1/payments/:paymentId/reallocate` | Load → assertInScope → writeBranch before validators/roles; service checks cross-record parents. |
| GET | `/api/v1/financial-ledger` | scopeWhere on root/owning parent; scoped search IDs; aggregates use the same filtered set. |
| GET | `/api/v1/receivables` | scopeWhere on root/owning parent; scoped search IDs; aggregates use the same filtered set. |
| GET | `/api/v1/prepaid-purchases` | scopeWhere on root/owning parent; scoped search IDs; aggregates use the same filtered set. |
| GET | `/api/v1/prepaid-purchases/:id` | Load branch-only record → assertInScope; inherited ownership for prepaid/photos. |
| POST | `/api/v1/prepaid-purchases/:id/deliver` | Load → assertInScope → writeBranch before validators/roles; service checks cross-record parents. |
| POST | `/api/v1/prepaid-purchases/:id/revert-delivery` | Load → assertInScope → writeBranch before validators/roles; service checks cross-record parents. |
| GET | `/api/v1/inventory/receivings/duplicate-check` | scopeWhere on root/owning parent; scoped search IDs; aggregates use the same filtered set. |
| GET | `/api/v1/inventory/receivings` | scopeWhere on root/owning parent; scoped search IDs; aggregates use the same filtered set. |
| POST | `/api/v1/inventory/receivings` | writeBranch; parent scope + derived branch, or selected branch for parent-less create. |
| GET | `/api/v1/inventory/receivings/:receivingId` | Load branch-only record → assertInScope; inherited ownership for prepaid/photos. |
| PATCH | `/api/v1/inventory/receivings/:receivingId/metadata` | Load → assertInScope → writeBranch before validators/roles; service checks cross-record parents. |
| POST | `/api/v1/inventory/receivings/:receivingId/void` | Load → assertInScope → writeBranch before validators/roles; service checks cross-record parents. |
| GET | `/api/v1/service-jobs/summary` | scopeWhere on root/owning parent; scoped search IDs; aggregates use the same filtered set. |
| GET | `/api/v1/service-jobs` | scopeWhere on root/owning parent; scoped search IDs; aggregates use the same filtered set. |
| POST | `/api/v1/service-jobs` | writeBranch; parent scope + derived branch, or selected branch for parent-less create. |
| GET | `/api/v1/service-jobs/:serviceJobId/audit` | Load branch-only record → assertInScope; inherited ownership for prepaid/photos. |
| POST | `/api/v1/service-jobs/:serviceJobId/status` | Load → assertInScope → writeBranch before validators/roles; service checks cross-record parents. |
| POST | `/api/v1/service-jobs/:serviceJobId/cancel` | Load → assertInScope → writeBranch before validators/roles; service checks cross-record parents. |
| POST | `/api/v1/service-jobs/:serviceJobId/reopen` | Load → assertInScope → writeBranch before validators/roles; service checks cross-record parents. |
| PATCH | `/api/v1/service-jobs/:serviceJobId` | Load → assertInScope → writeBranch before validators/roles; service checks cross-record parents. |
| GET | `/api/v1/service-jobs/:serviceJobId` | Load branch-only record → assertInScope; inherited ownership for prepaid/photos. |
| GET | `/api/v1/sales-orders/summary` | scopeWhere on root/owning parent; scoped search IDs; aggregates use the same filtered set. |
| GET | `/api/v1/sales-orders` | scopeWhere on root/owning parent; scoped search IDs; aggregates use the same filtered set. |
| POST | `/api/v1/sales-orders` | writeBranch; parent scope + derived branch, or selected branch for parent-less create. |
| GET | `/api/v1/sales-orders/:salesOrderId/audit` | Load branch-only record → assertInScope; inherited ownership for prepaid/photos. |
| POST | `/api/v1/sales-orders/:salesOrderId/fulfillment-status` | Load → assertInScope → writeBranch before validators/roles; service checks cross-record parents. |
| POST | `/api/v1/sales-orders/:salesOrderId/payment` | Load → assertInScope → writeBranch before validators/roles; service checks cross-record parents. |
| POST | `/api/v1/sales-orders/:salesOrderId/cancel` | Load → assertInScope → writeBranch before validators/roles; service checks cross-record parents. |
| POST | `/api/v1/sales-orders/:salesOrderId/restore` | Load → assertInScope → writeBranch before validators/roles; service checks cross-record parents. |
| POST | `/api/v1/sales-orders/:salesOrderId/return` | Load → assertInScope → writeBranch before validators/roles; service checks cross-record parents. |
| POST | `/api/v1/sales-orders/:salesOrderId/create-debt` | Load → assertInScope → writeBranch before validators/roles; service checks cross-record parents. |
| POST | `/api/v1/sales-orders/:salesOrderId/create-installment-plan` | Load → assertInScope → writeBranch before validators/roles; service checks cross-record parents. |
| POST | `/api/v1/sales-orders/:salesOrderId/unlink-financial` | Load → assertInScope → writeBranch before validators/roles; service checks cross-record parents. |
| POST | `/api/v1/sales-orders/:salesOrderId/items` | Load → assertInScope → writeBranch before validators/roles; service checks cross-record parents. |
| PATCH | `/api/v1/sales-orders/:salesOrderId/items/:itemId` | Load → assertInScope → writeBranch before validators/roles; service checks cross-record parents. |
| POST | `/api/v1/sales-orders/:salesOrderId/items/:itemId/remove` | Load → assertInScope → writeBranch before validators/roles; service checks cross-record parents. |
| POST | `/api/v1/sales-orders/:salesOrderId/deduct-stock` | Load → assertInScope → writeBranch before validators/roles; service checks cross-record parents. |
| POST | `/api/v1/sales-orders/:salesOrderId/restore-stock` | Load → assertInScope → writeBranch before validators/roles; service checks cross-record parents. |
| PATCH | `/api/v1/sales-orders/:salesOrderId` | Load → assertInScope → writeBranch before validators/roles; service checks cross-record parents. |
| GET | `/api/v1/sales-orders/:salesOrderId` | Load branch-only record → assertInScope; inherited ownership for prepaid/photos. |
| GET | `/api/v1/sales-returns/:salesReturnId` | Load branch-only record → assertInScope; inherited ownership for prepaid/photos. |
| GET | `/api/v1/supplier-transactions` | scopeWhere on root/owning parent; scoped search IDs; aggregates use the same filtered set. |
| GET | `/api/v1/supplier-transactions/:transactionId` | Load branch-only record → assertInScope; inherited ownership for prepaid/photos. |
| PATCH | `/api/v1/supplier-transactions/:transactionId` | Load → assertInScope → writeBranch before validators/roles; service checks cross-record parents. |
| POST | `/api/v1/supplier-transactions/:transactionId/remove` | Load → assertInScope → writeBranch before validators/roles; service checks cross-record parents. |
| POST | `/api/v1/supplier-transactions/:transactionId/restore` | Load → assertInScope → writeBranch before validators/roles; service checks cross-record parents. |
| GET | `/api/v1/supplier-purchases/receipt-check` | scopeWhere on root/owning parent; scoped search IDs; aggregates use the same filtered set. |
| GET | `/api/v1/supplier-purchases/:purchaseId` | Load branch-only record → assertInScope; inherited ownership for prepaid/photos. |
| GET | `/api/v1/supplier-purchases/:supplierReceivingId/receipts` | Load branch-only record → assertInScope; inherited ownership for prepaid/photos. |
| POST | `/api/v1/supplier-purchases/:supplierReceivingId/receipts` | Load → assertInScope → writeBranch before validators/roles; service checks cross-record parents. |
| GET | `/api/v1/supplier-ledger` | scopeWhere on root/owning parent; scoped search IDs; aggregates use the same filtered set. |
| GET | `/api/v1/corrections` | scopeWhere on root/owning parent; scoped search IDs; aggregates use the same filtered set. |

Global inventory allow-list (D3):

- `GET /api/v1/inventory/onboarding/pending`
- `POST /api/v1/inventory/onboarding/batch`
- `GET /api/v1/inventory/summary`
- `GET /api/v1/inventory/low-stock`
- `GET /api/v1/inventory/movements`

The complete registry inventory, including the existing customer/supplier parent routes, is in route-inventory.json. Receipt photo paths identify a supplier receiving, while purchase detail identifies a supplier transaction.
