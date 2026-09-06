# Legacy Transactions Audit

Date: 2026-08-30  
Branch: `upgrade/phase-01-core-integrity`  
Commit inspected: `1c3d608776bf7ae4d2af0a35d3ff0a4ba1c8c765`

## Decision

**The production data-loss gate passes, but it is not currently safe to remove the module and drop both tables as an isolated backend deletion.**

- `transactions` is empty.
- `activity_logs` is empty.
- Therefore, dropping the tables would not discard production rows.
- However, live frontend and backend paths still depend on the legacy transaction module, and the dashboard still queries `activity_logs`. Dropping the tables before removing or replacing those consumers would cause runtime failures.

Prompt 14 must include the frontend/customer-route/dashboard dependencies identified below. As currently written, Prompt 14's backend file list is incomplete, so it should not proceed unchanged.

No database rows were changed or deleted during this audit.

## 1. Prisma models confirmed

`backend/prisma/schema.prisma` defines both legacy models.

### `Transaction` → `transactions`

The model is at lines 420–448 and contains:

- UUID primary key `id`
- required customer relation through `customerId`
- `TransactionType type`
- `TransactionStatus status`, default `PENDING`
- `Decimal(12,2) amount`
- description, transaction date, optional due date and reference number
- optional JSON metadata
- required creator relation through `createdBy`
- timestamps, soft-delete timestamp, optional branch ID
- a self-relation through `parentId`/`payments`
- indexes on customer, date, type, customer/date, and deletion status

The model maps to `transactions`. Its inverse relations are `User.transactions` and `Customer.transactions`.

### `ActivityLog` → `activity_logs`

The model is at lines 450–465 and contains:

- UUID primary key `id`
- required user relation through `userId`
- action, entity type, UUID entity ID
- required JSON details
- optional IP address and branch ID
- creation timestamp
- indexes on entity type/entity ID and creation timestamp

The model maps to `activity_logs`. Its inverse relation is `User.activityLogs`.

The legacy `TransactionType` and `TransactionStatus` enums also remain in the schema.

## 2. Mounted routes

`backend/src/app.ts` imports `./routes/transactions.routes` and mounts it as:

```ts
app.use('/api/v1/transactions', requireAuth, transactionsRoutes);
```

The router itself also applies `requireAuth`. It currently exposes only:

- `GET /api/v1/transactions`
- `GET /api/v1/transactions/:id`

The controller still contains create, update, and delete handlers, but the router does not mount them.

There are two additional live legacy routes under the customer router, mounted through `/api/v1/customers`:

- `GET /api/v1/customers/:id/transactions`
- `GET /api/v1/customers/:id/balance`

Both call `TransactionsService` through `CustomersController`. Removing only `/api/v1/transactions` would leave these routes pointing at the legacy table.

## 3. Entire frontend search

### Legacy feature files

The complete legacy frontend feature is still present:

- `frontend/src/features/transactions/api/transactions.api.ts`
- `frontend/src/features/transactions/hooks/useTransactions.ts`
- `frontend/src/features/transactions/types.ts`
- `frontend/src/features/transactions/components/TransactionList.tsx`
- `frontend/src/features/transactions/components/TransactionForm.tsx`

The API declares these calls:

- `GET /transactions`
- `GET /transactions/:id`
- `POST /transactions`
- `PUT /transactions/:id`
- `DELETE /transactions/:id`
- `GET /customers/:customerId/transactions`
- `GET /customers/:customerId/balance`

The frontend mutation declarations do not match the current backend router: `POST`, `PUT`, and `DELETE /transactions` are not mounted and would return 404.

### Reachable consumer

`frontend/src/pages/customers/CustomerProfilePage.tsx` imports `TransactionList` and passes it into `CustomerFinancialProfile` as `legacyLedger`.

`frontend/src/features/customer-financial/components/CustomerFinancialProfile.tsx` exposes a visible **Legacy Ledger** tab and renders that node. It states that the section is retained for existing transaction history and is excluded from authoritative financial-summary totals.

This path calls `GET /customers/:customerId/transactions`, so dropping `transactions` without removing the tab and customer route would break a reachable customer-profile screen.

### Present but currently unmounted consumers

- `frontend/src/features/transactions/components/TransactionForm.tsx` calls the legacy create hook but has no importer elsewhere in the frontend.
- `frontend/src/features/quick-action/components/DebtForm.tsx` also calls the legacy create hook.
- `frontend/src/features/quick-action/QuickActionPanel.tsx` renders that `DebtForm`, but the entire `QuickActionPanel` has no importer or render site elsewhere in `frontend/src`.

These files are dead/unmounted in the current frontend, but they still need removal or migration to prevent the legacy API from being reintroduced accidentally.

### Non-dependencies found by the text search

- `frontend/src/features/financial-ledger/api/financial-ledger.api.test.ts` contains only a negative assertion that the authoritative ledger URL does **not** contain `/transactions`.
- Supplier transaction files and URLs such as `/suppliers/:id/transactions` are a separate, current `SupplierTransaction` domain. They are not part of this legacy module and must remain.

## 4. Production database result

The desktop application's `%APPDATA%/home-connect/config/production.env` and `backend/.env` were checked without printing credentials. They point to the same connection and the same database: `homeconnect`.

The requested read-only queries returned:

```sql
SELECT COUNT(*) FROM transactions;
-- 0

SELECT COUNT(*) FROM activity_logs;
-- 0
```

Because both counts are zero, there is no date range or row sample to report.

## 5. Remaining backend dependencies

### Direct legacy import chain

Every production backend file that imports or exposes the legacy transaction module is:

1. `backend/src/app.ts` — imports and mounts `transactionsRoutes`.
2. `backend/src/routes/transactions.routes.ts` — imports `TransactionsController` and transaction validators.
3. `backend/src/controllers/transactions.controller.ts` — imports `TransactionsService` and transaction parameter types.
4. `backend/src/services/transactions.service.ts` — imports `TransactionsRepository` and transaction input/query types.
5. `backend/src/controllers/customers.controller.ts` — imports `TransactionsService` for customer history and balance.
6. `backend/src/routes/customers.routes.ts` — exposes the two customer legacy endpoints through `CustomersController`.
7. `backend/src/repositories/transactions.repository.ts` — imports the legacy Prisma adapters and reads/writes both tables.
8. `backend/src/lib/prisma.ts` — exports `transactionModel` and `activityLogModel` compatibility aliases.

The module files that would be deleted are:

- `backend/src/routes/transactions.routes.ts`
- `backend/src/controllers/transactions.controller.ts`
- `backend/src/services/transactions.service.ts`
- `backend/src/repositories/transactions.repository.ts`
- `backend/src/validators/transactions.validator.ts`
- `backend/src/types/transactions.types.ts` — currently has no importer

### Unexpected `activity_logs` runtime consumer

`backend/src/features/dashboard/activity/dashboard-activity.repository.ts` imports `activityLogModel` and includes `activity_logs.findMany(...)` in a `Promise.all` used by dashboard activity and recent-activity endpoints.

Even though the table is empty, dropping it without changing this repository would reject the whole dashboard activity request. `DashboardActivityService` still maps the returned records as `legacy` activity.

### Test coupling

Forty backend test files mock `transactionModel` and/or `activityLogModel` as part of their `lib/prisma` mock. Most do not test legacy transactions, but removing the aliases may require their mock shapes to be updated. The files are:

- `backend/src/app.test.ts`
- `backend/src/features/backup/backup.routes.test.ts`
- `backend/src/features/dashboard/dashboard-financial.routes.test.ts`
- `backend/src/features/dashboard/dashboard.routes.test.ts`
- `backend/src/features/financial/corrections/corrections.routes.test.ts`
- `backend/src/features/financial/customer-summary/customer-financial-summary.routes.test.ts`
- `backend/src/features/financial/debts/debts.routes.test.ts`
- `backend/src/features/financial/installment-plans/installment-plans.routes.test.ts`
- `backend/src/features/financial/ledger/financial-ledger.routes.test.ts`
- `backend/src/features/financial/payments/payments.routes.test.ts`
- `backend/src/features/financial/receivables/receivables.routes.test.ts`
- `backend/src/features/inventory/inventory.routes.test.ts`
- `backend/src/features/inventory/inventory.service.test.ts`
- `backend/src/features/inventory/receiving/supplier-receivings.routes.test.ts`
- `backend/src/features/maintenance/maintenance.routes.test.ts`
- `backend/src/features/preflight/preflight.routes.test.ts`
- `backend/src/features/pricing/calculator/pricing-calculator.routes.test.ts`
- `backend/src/features/pricing/presets/pricing-presets.routes.test.ts`
- `backend/src/features/reports/metrics/reports-metrics.repository.test.ts`
- `backend/src/features/reports/monthly-debts/monthly-debts.repository.range.test.ts`
- `backend/src/features/reports/monthly-debts/monthly-debts.routes.test.ts`
- `backend/src/features/reports/monthly-review/monthly-review.routes.test.ts`
- `backend/src/features/reports/rows/report-rows.routes.test.ts`
- `backend/src/features/sales/sales-orders/sales-orders.routes.test.ts`
- `backend/src/features/scanner/lan-listener.lifecycle.test.ts`
- `backend/src/features/scanner/scanner-hardening.test.ts`
- `backend/src/features/scanner/scanner.lan.routes.test.ts`
- `backend/src/features/scanner/scanner.routes.test.ts`
- `backend/src/features/service/products/products.labels.test.ts`
- `backend/src/features/service/products/products.normalize.service.test.ts`
- `backend/src/features/service/products/products.pricing.routes.test.ts`
- `backend/src/features/service/products/products.repository.test.ts`
- `backend/src/features/service/products/products.routes.test.ts`
- `backend/src/features/service/products/products.scan.test.ts`
- `backend/src/features/service/products/products.service.test.ts`
- `backend/src/features/service/service-jobs/service-jobs.routes.test.ts`
- `backend/src/features/service/service-jobs/service-jobs.service.test.ts`
- `backend/src/features/suppliers/purchases/supplier-purchases.routes.test.ts`
- `backend/src/features/suppliers/suppliers.routes.test.ts`
- `backend/src/features/system/system.routes.test.ts`

## Required conditions before removal

Removal becomes safe only when one coordinated change also:

1. removes the `/api/v1/transactions` mount and legacy backend module;
2. removes the customer transaction and balance routes/controller calls;
3. removes the customer-profile Legacy Ledger tab and the `features/transactions` frontend feature;
4. removes or migrates the unmounted quick-action legacy debt form;
5. removes the `activity_logs` query and legacy mapping from dashboard activity;
6. removes the Prisma models, inverse relations, enums, and `lib/prisma` aliases;
7. updates affected test mocks;
8. applies the irreversible table-drop migration only after a verified backup and a fresh zero-row check.

Until those conditions are included, the answer is **no: it is not safe to remove the module and drop the tables**, despite both production tables being empty.
