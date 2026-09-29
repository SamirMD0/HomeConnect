# Phase 1 Control Baseline

**Date:** 2026-08-26  
**Git commit:** `ac6ae9f555dd69d61ca79be527cc1a80513643d9`

No application code was changed and no findings were fixed while producing this baseline.

## `npm run typecheck`

**Exit code:** `0`

Exact output:

```text

> home-connect@2.0.0 typecheck
> npm run typecheck:frontend && npm run typecheck:backend


> home-connect@2.0.0 typecheck:frontend
> tsc -p tsconfig.json --noEmit


> home-connect@2.0.0 typecheck:backend
> tsc -p tsconfig.server.json --noEmit

```

## `npm run lint`

**Exit code:** `0`

Exact output:

```text

> home-connect@2.0.0 lint
> eslint frontend/src backend/src desktop/src --ext ts,tsx


D:\User\Documents\Home Connect\backend\src\controllers\auth.controller.ts
   45:21  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
   73:21  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  159:21  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any

D:\User\Documents\Home Connect\backend\src\controllers\customers.controller.ts
  25:75  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any

D:\User\Documents\Home Connect\backend\src\controllers\transactions.controller.ts
  25:95  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any

D:\User\Documents\Home Connect\backend\src\controllers\users.controller.ts
  18:21  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  59:21  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any

D:\User\Documents\Home Connect\backend\src\features\diagnostics\diagnostics.routes.test.ts
  1:48  warning  'afterEach' is defined but never used  @typescript-eslint/no-unused-vars

D:\User\Documents\Home Connect\backend\src\features\diagnostics\error-logger.test.ts
   4:8   warning  'path' is defined but never used                     @typescript-eslint/no-unused-vars
  62:13  warning  'existsSyncMock' is assigned a value but never used  @typescript-eslint/no-unused-vars

D:\User\Documents\Home Connect\backend\src\features\diagnostics\error-logger.ts
   8:26  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  28:37  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  28:43  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  50:39  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any

D:\User\Documents\Home Connect\backend\src\features\financial\authorization\account-password.test.ts
  47:10  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  49:75  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  90:10  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any

D:\User\Documents\Home Connect\backend\src\features\financial\corrections\correction-audit.test.ts
  59:29  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any

D:\User\Documents\Home Connect\backend\src\lib\errors.ts
   4:20  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
   6:85  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  16:42  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any

D:\User\Documents\Home Connect\backend\src\lib\prisma.ts
  13:21  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  14:32  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  15:32  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any

D:\User\Documents\Home Connect\backend\src\middleware\auth.middleware.ts
  32:12  warning  'error' is defined but never used  @typescript-eslint/no-unused-vars

D:\User\Documents\Home Connect\backend\src\repositories\transactions.repository.ts
    1:36  warning  'activityLogModel' is defined but never used  @typescript-eslint/no-unused-vars
  121:16  warning  Unexpected any. Specify a different type      @typescript-eslint/no-explicit-any
  129:14  warning  Unexpected any. Specify a different type      @typescript-eslint/no-explicit-any
  134:23  warning  Unexpected any. Specify a different type      @typescript-eslint/no-explicit-any
  149:18  warning  Unexpected any. Specify a different type      @typescript-eslint/no-explicit-any
  156:16  warning  Unexpected any. Specify a different type      @typescript-eslint/no-explicit-any
  162:23  warning  Unexpected any. Specify a different type      @typescript-eslint/no-explicit-any
  176:16  warning  Unexpected any. Specify a different type      @typescript-eslint/no-explicit-any
  182:23  warning  Unexpected any. Specify a different type      @typescript-eslint/no-explicit-any

D:\User\Documents\Home Connect\backend\src\services\auth.service.ts
   24:85  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
   25:95  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  110:14  warning  'error' is defined but never used         @typescript-eslint/no-unused-vars

D:\User\Documents\Home Connect\backend\src\services\dashboard.service.ts
  12:22  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  39:24  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any

D:\User\Documents\Home Connect\backend\src\services\transactions.service.ts
   24:44  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
   40:28  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  168:53  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  176:69  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any

D:\User\Documents\Home Connect\backend\src\services\users.service.ts
  2:10  warning  'AppError' is defined but never used  @typescript-eslint/no-unused-vars

D:\User\Documents\Home Connect\desktop\src\backend-process.test.ts
  67:41  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any

D:\User\Documents\Home Connect\desktop\src\lifecycle.test.ts
  70:43  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any

D:\User\Documents\Home Connect\desktop\src\preload.test.ts
  54:42  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  61:41  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  67:16  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  70:16  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  73:16  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  77:16  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  81:16  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  85:39  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  93:41  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any

D:\User\Documents\Home Connect\desktop\src\preload.ts
  21:36  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  25:38  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  25:50  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any

D:\User\Documents\Home Connect\desktop\src\startup-diagnostics.test.ts
   1:48  warning  'afterEach' is defined but never used                @typescript-eslint/no-unused-vars
   4:8   warning  'path' is defined but never used                     @typescript-eslint/no-unused-vars
  11:35  warning  Unexpected any. Specify a different type             @typescript-eslint/no-explicit-any
  62:13  warning  'existsSyncMock' is assigned a value but never used  @typescript-eslint/no-unused-vars

D:\User\Documents\Home Connect\desktop\src\startup-diagnostics.ts
  34:32  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any

D:\User\Documents\Home Connect\frontend\src\context\AuthContext.tsx
   55:14  warning  'e' is defined but never used      @typescript-eslint/no-unused-vars
  103:16  warning  'error' is defined but never used  @typescript-eslint/no-unused-vars

D:\User\Documents\Home Connect\frontend\src\features\customers\components\CustomerSearchInput.tsx
  14:62  warning  React Hook useMemo has unnecessary dependencies: 'focused' and 'historyVersion'. Either exclude them or remove the dependency array  react-hooks/exhaustive-deps

D:\User\Documents\Home Connect\frontend\src\features\customers\hooks\useCustomers.ts
  42:22  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  60:22  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  76:22  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any

D:\User\Documents\Home Connect\frontend\src\features\diagnostics\api\diagnostics.api.ts
  14:26  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any

D:\User\Documents\Home Connect\frontend\src\features\diagnostics\components\DiagnosticsPanel.tsx
  28:20  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any

D:\User\Documents\Home Connect\frontend\src\features\transactions\components\TransactionForm.tsx
  149:49  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any

D:\User\Documents\Home Connect\frontend\src\features\transactions\components\TransactionList.tsx
   40:62   warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
   74:66   warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
   74:120  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  126:110  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any

D:\User\Documents\Home Connect\frontend\src\features\transactions\types.ts
  12:28  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  41:29  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  51:29  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any

D:\User\Documents\Home Connect\frontend\src\pages\Login.tsx
  48:19  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any

D:\User\Documents\Home Connect\frontend\src\pages\Setup.tsx
  68:19  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any

D:\User\Documents\Home Connect\frontend\src\pages\customers\CustomersListPage.tsx
  38:43  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any

D:\User\Documents\Home Connect\frontend\src\services\api.test.ts
   6:28  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  13:22  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  25:52  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  37:14  warning  'e' is defined but never used             @typescript-eslint/no-unused-vars
  76:14  warning  'e' is defined but never used             @typescript-eslint/no-unused-vars
  84:45  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any

D:\User\Documents\Home Connect\frontend\src\services\api.ts
  132:14  warning  'e' is defined but never used  @typescript-eslint/no-unused-vars

✖ 89 problems (0 errors, 89 warnings)

```

## `npm test`

**Exit code:** `0`

Exact output:

```text

> home-connect@2.0.0 test
> vitest run


 RUN  v4.1.10 D:/User/Documents/Home Connect

[backend] DATABASE_URL=[REDACTED] starting

 Test Files  256 passed | 10 skipped (266)
      Tests  2181 passed | 10 skipped (2191)
   Start at  09:58:07
   Duration  152.04s (transform 37.58s, setup 0ms, import 208.82s, tests 19.25s, environment 45ms)

```

## Test totals

| Measure | Total | Passed | Skipped | Failed |
|---|---:|---:|---:|---:|
| Test files | 266 | 256 | 10 | 0 |
| Tests | 2,191 | 2,181 | 10 | 0 |

## Skipped test files and run gates

The test reporter did not print skipped suite names. The following ten files use a conditional `describe.skip` gate in their source and account for the ten skipped test files reported above.

| Skipped test file | Primary run environment variable | Additional condition checked |
|---|---|---|
| `backend/src/features/financial/customer-summary/customer-financial-summary-db.integration.test.ts` | `RUN_PHASE6_CUSTOMER_SUMMARY_DB_TESTS === '1'` | The database name parsed from `DATABASE_URL` must contain `phase6`. |
| `backend/src/features/financial/debts/debts-db.integration.test.ts` | `RUN_PHASE4_DEBT_DB_TESTS === '1'` | The database name parsed from `DATABASE_URL` must contain `phase4`. |
| `backend/src/features/financial/infrastructure/financial-db.integration.test.ts` | `RUN_FINANCIAL_DB_TESTS === '1'` | `DATABASE_URL` must be truthy. |
| `backend/src/features/financial/installment-plans/installment-plans-db.integration.test.ts` | `RUN_PHASE5_INSTALLMENT_DB_TESTS === '1'` | The database name parsed from `DATABASE_URL` must contain `phase5`. |
| `backend/src/features/inventory/inventory-awaiting-deduction-db.integration.test.ts` | `RUN_SALES_FULFILLMENT_DB_TESTS === '1'` | `DATABASE_URL` must be truthy. |
| `backend/src/features/inventory/inventory-db.integration.test.ts` | `RUN_INVENTORY_DB_TESTS === '1'` | `DATABASE_URL` must be truthy. |
| `backend/src/features/inventory/inventory-onboarding-db.integration.test.ts` | `RUN_INVENTORY_DB_TESTS === '1'` | `DATABASE_URL` must be truthy. |
| `backend/src/features/inventory/supplier-receiving-db.integration.test.ts` | `RUN_SUPPLIER_RECEIVING_DB_TESTS === '1'` | `DATABASE_URL` must be truthy. |
| `backend/src/features/sales/sales-orders/sales-order-stock-fulfillment-db.integration.test.ts` | `RUN_SALES_FULFILLMENT_DB_TESTS === '1'` | `DATABASE_URL` must be truthy. |
| `backend/src/features/suppliers/purchases/supplier-purchase-db.integration.test.ts` | `RUN_SUPPLIER_PURCHASE_DB_TESTS === '1'` | `DATABASE_URL` must be truthy. |

## Control result

- Typecheck: passed.
- Lint: passed with 89 warnings and 0 errors.
- Tests: passed with 10 test files and 10 tests skipped.
- No fixes were applied.
