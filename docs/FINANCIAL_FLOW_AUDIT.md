# Financial Flow Audit

Date: 2026-07-24

## 1. Current Implementation Summary

The current application implements customers, authentication, a generic transaction ledger, dashboard summaries, and customer profile transaction views.

Financial obligations are currently represented by one Prisma model:

- `Transaction` in `backend/prisma/schema.prisma`
- transaction backend routes under `/api/v1/transactions`
- customer transaction/balance routes under `/api/v1/customers/:id/transactions` and `/api/v1/customers/:id/balance`
- frontend transaction UI in `frontend/src/pages/LedgerPage.tsx`, `frontend/src/features/transactions/components/TransactionForm.tsx`, and `frontend/src/features/transactions/components/TransactionList.tsx`

The current model has been extended from the original roadmap ledger model. The migration `backend/prisma/migrations/20260723094305_init_ledger/migration.sql` created `TransactionType` as `SALE | PAYMENT | ADJUSTMENT`, while the current Prisma schema uses `ONE_TIME | INSTALLMENT | PAYMENT | ADJUSTMENT`. This indicates schema/migration drift that must be handled carefully before any new migration.

## 2. Existing Flow

### Customer Flow

- Customers are created through `POST /api/v1/customers`.
- `CustomersService.createCustomer` rejects duplicate active phone numbers.
- Customer deletion is implemented as soft delete by setting `deletedAt` and `isActive = false`.
- Customers have no foreign-key relation to `createdBy`; `createdBy` is a UUID field only.

### Debt Flow

- "Debt" is currently a `Transaction` with `type` `ONE_TIME` or `INSTALLMENT`.
- A transaction may be created by selecting an existing customer or by passing `customerName` and `customerPhone`.
- If `customerId` is omitted, `TransactionsService.createTransaction` creates a new customer inline.
- `dueDate` exists on `Transaction`, but there is no debt status transition logic.
- `TransactionStatus` exists in the schema as `PENDING | PARTIAL | PAID`, but there is no clear business use for single debts vs installment plans and no overdue/cancelled status.

### Installment Flow

- An installment plan is represented as a parent `Transaction` with `type = INSTALLMENT`.
- The service auto-generates six child `Transaction` records, also with `type = INSTALLMENT`, linked by `parentId`.
- The number of installments is hard-coded to six.
- There is no first-class `InstallmentPlan` or `Installment` model.
- Payment allocation is not modeled as allocations. Payments can be child `Transaction` rows under a parent debt/installment transaction.

### Payment Flow

- Payments are `Transaction` rows with `type = PAYMENT`.
- A payment may have `parentId` to associate it with a parent transaction.
- The service does not prevent overpayment.
- Payment amounts and balances are converted to JavaScript `number` in several places.
- Payments can be edited or soft-deleted, which violates immutable financial transaction requirements.

## 3. Logical Errors

| File | Function or Model | Current Behavior | Why It Is Wrong | Required Correction |
|---|---|---|---|---|
| `backend/src/services/transactions.service.ts` | `createTransaction` | Creates a new customer when `customerId` is missing and `customerName/customerPhone` are provided. | The requested business flow says debts and installment plans must reference an existing customer and must not create customers during obligation creation. | Require `customerId` for all financial obligations. Customer creation must stay in the customer module. |
| `frontend/src/pages/LedgerPage.tsx` | New transaction modal | Allows "New Customer" during transaction creation. | It encourages duplicate customer records and mixes customer onboarding with financial obligation creation. | Remove inline customer creation from financial transaction forms. |
| `frontend/src/features/quick-action/components/CustomerSearch.tsx` | `onCreateNew` path | Allows creating a customer while entering a debt flow. | This conflicts with "customer should exist only once" unless the admin intentionally enters customer management first. | Quick action should select an existing customer or route to customer creation before starting obligation creation. |
| `backend/src/services/transactions.service.ts` | `createTransaction` | Treats `INSTALLMENT` as both parent plan and generated installment schedule row. | A plan and a scheduled installment are different concepts with different status, due date, amount paid, remaining amount, and sequence number. | Introduce explicit `InstallmentPlan` and `Installment` models. |
| `backend/src/repositories/transactions.repository.ts` | `calculateCustomerBalance` | Sums only parent rows where `parentId = null`; subtracts only top-level payments. | Payments made as child rows under a debt are excluded from customer balance. A parent debt with child payments can remain overstated. | Calculate balance from first-class debts/plans/payments/allocations or include allocated child payments correctly. |
| `backend/src/services/transactions.service.ts` | `getCustomerTransactionsWithBalance` | Adds parent amount then subtracts child payments inline, but returns history reversed. | Running balances should be chronological and based on immutable financial events; child schedule rows are mixed with payments. | Return explicit debts, plans, installments, and payment history with calculated balances. |
| `backend/src/routes/transactions.routes.ts` | `PUT /:id`, `DELETE /:id` | Allows updating and soft-deleting financial transactions. | Financial records must be immutable. Corrections should be void/cancel/status transitions with audit records, not edits/deletes. | Remove general edit/delete for financial records; add cancel/void endpoints with reason and audit trail. |
| `frontend/src/pages/LedgerPage.tsx` | Edit/delete transaction UI | Lets the admin edit or delete transactions and child payments. | This violates immutable payment/debt history and can change balances without a proper audit action. | Replace with cancel/void actions where allowed, and show immutable history. |
| `backend/src/services/transactions.service.ts` | Installment generation | Always creates six child installments, ignores requested count/frequency. | The requested flow requires `installmentCount`, `frequency`, schedule preview, and exact schedule generation. | Accept validated plan inputs and generate schedules in a transaction. Initial frequency: `MONTHLY`. |
| `backend/src/services/transactions.service.ts` | Installment dates | Adds months starting from `startDate + i`, so the first child due date is one month after start date. | The requested example expects the first installment due on the start date. | Generate installment 1 at `startDate`, then add monthly increments. |
| `frontend/src/features/quick-action/components/DebtForm.tsx` | Debt form | No due date field for one-time debt; installment is only a hard-coded 6-month option; no schedule preview. | The acceptance flow requires exact due date for single debt and preview before installment creation. | Split into Single Debt and Installment Plan forms. |
| `frontend/src/features/transactions/components/TransactionForm.tsx` | Transaction form | Does not support notes, installment count, frequency, schedule preview, or payment allocation. | Required fields and admin flow are missing. | Replace generic transaction form with obligation-specific forms. |
| `backend/src/services/dashboard.service.ts` | `getSummary` | Uses raw SQL over `transactions` and `parentId IS NULL`. | It does not include child payments and cannot represent overdue debts/installments accurately. | Rebuild summaries from debts, installment plans/installments, payments, and allocations. |
| `frontend/src/components/ui/BalanceBadge.tsx` | Balance display | Supports credit/negative balances. | Overpayment is not an explicitly designed rule in the requested flow. | Prevent overpayment; remove credit state unless an overpayment policy is explicitly added. |

## 4. Missing Database Relationships

| File | Function or Model | Current Behavior | Why It Is Wrong | Required Correction |
|---|---|---|---|---|
| `backend/prisma/schema.prisma` | `Transaction` | One model represents debt, installment parent, installment schedule, and payment. | It does not encode the required domain relationships cleanly. | Add `Debt`, `InstallmentPlan`, `Installment`, `Payment`, and `PaymentAllocation` models. |
| `backend/prisma/schema.prisma` | `Customer` | Has `transactions`, but no `debts`, `installmentPlans`, or `payments` relations. | Customer profile cannot query obligations and payment history directly. | Add explicit relations from `Customer` to debts/plans/payments. |
| `backend/prisma/schema.prisma` | `Customer.createdBy` | Plain UUID without a relation to `User`. | Audit ownership is not referentially enforced. | Add relation `createdByUser` or rename to `createdById` and enforce FK. |
| `backend/prisma/schema.prisma` | `Transaction.parentId` | Used for both installment schedules and payments. | One nullable self-reference cannot enforce target type or allocation correctness. | Replace with typed allocation rows and installment relations. |
| `backend/prisma/schema.prisma` | Payment target | Payment may be top-level or child row; no database constraint ensures one valid target. | Payment allocation cannot support one payment covering multiple installments. | Use shared `Payment` and `PaymentAllocation` with exactly one of `debtId` or `installmentId` set. |

## 5. Missing Validations

| File | Function or Model | Current Behavior | Why It Is Wrong | Required Correction |
|---|---|---|---|---|
| `backend/src/validators/transactions.validator.ts` | `createTransactionSchema` | Allows `customerId` to be omitted if `customerName/customerPhone` exist. | Financial obligations must reference an existing customer. | Require `customerId` for debt/plan/payment creation. |
| `backend/src/validators/transactions.validator.ts` | `createTransactionSchema` | No validation that due date is present for one-time debt. | Single debt requires an exact due date. | Require local date-only `dueDate` for debt creation. |
| `backend/src/validators/transactions.validator.ts` | `createTransactionSchema` | No installment count/frequency/start date validation. | Installment plan creation needs count >= 1, monthly frequency, and start date. | Add dedicated installment plan schema. |
| `backend/src/services/transactions.service.ts` | `createTransaction` | No overpayment check for parent debt/installment. | Payments can exceed remaining balance and create unintended credit balances. | Check remaining balance inside a database transaction before inserting payment/allocation. |
| `backend/src/services/customers.service.ts` | `deleteCustomer` | Does not check financial history before soft-deleting customer. | Customers with debts/payments/plans must not be deleted because financial history needs an active customer reference. | Block deletion when financial history exists; allow deactivate only if policy allows. |
| `backend/src/routes/transactions.routes.ts` | Transaction routes | No role middleware on create/update/delete. | Employees can create or mutate financial records if authenticated. | Require `ADMIN` for creating, paying, cancelling, or voiding financial records. |
| `backend/src/validators/customers.validator.ts` | `customerQuerySchema` | Zod transform/default ordering currently fails TypeScript build. | Broken validation code blocks production build. | Use `z.coerce.number().int().positive().default(...)` or apply default before transform safely. |
| `frontend/src/features/transactions/components/TransactionForm.tsx` | Client validation | No due date, notes, payment method, reference, installment count/frequency rules. | UI can submit incomplete business data. | Add client schemas matching backend contracts. |

## 6. Incorrect Calculations

| File | Function or Model | Current Behavior | Why It Is Wrong | Required Correction |
|---|---|---|---|---|
| `backend/src/repositories/transactions.repository.ts` | `calculateCustomerBalance` | Uses `Number(Decimal)` and ignores child payments due to `parentId: null`. | Causes precision risk and can overstate debt. | Use Prisma Decimal arithmetic or database `NUMERIC` aggregation over allocations. |
| `backend/src/services/transactions.service.ts` | Installment amount split | Uses JavaScript division and `toFixed(2)` on `number`. | JavaScript floating point can create money rounding errors. | Use Prisma Decimal or integer cents. Final installment should absorb rounding difference. |
| `backend/src/services/transactions.service.ts` | Installment schedule | Starts due dates at `startDate + 1 month`. | Required flow starts installment 1 on the start date. | Create sequence 1 at start date, then monthly increments. |
| `backend/src/services/dashboard.service.ts` | `getSummary` | Totals only top-level rows. | Child payments and allocated payments are not reliably reflected. | Build dashboard from obligation/payment allocation views. |
| `frontend/src/pages/LedgerPage.tsx` | Remaining display | Calculates remaining as `Number(tx.amount) - childPaymentsSum`. | Client-side display can disagree with backend and uses floating point. | Backend should return calculated remaining amounts; frontend should format only. |

## 7. Security Or Authorization Problems

| File | Function or Model | Current Behavior | Why It Is Wrong | Required Correction |
|---|---|---|---|---|
| `backend/src/routes/transactions.routes.ts` | Transaction route registration | Only `requireAuth` is applied. | The requested flow is admin-managed; authenticated employees can create/edit/delete transactions. | Add `requireRole([Role.ADMIN])` to financial mutation routes. |
| `backend/src/app.ts` and `backend/src/routes/transactions.routes.ts` | Auth middleware | `requireAuth` is applied both in app route mounting and transaction router. | Redundant, not directly unsafe, but indicates route ownership is unclear. | Keep auth in one layer and add role policies explicitly. |
| `backend/src/middleware/auth.middleware.ts` | JWT secret fallback | Uses a hard-coded fallback secret. | Financial system tokens should not be valid under a predictable fallback. | Fail startup when `JWT_SECRET` is missing outside tests/dev. |
| `backend/src/services/transactions.service.ts` | Update/delete methods | Any authenticated user can mutate history through routes. | This can alter financial balances without authorized audit controls. | Replace with admin-only cancel/void flows. |

## 8. Data Integrity Risks

| File | Function or Model | Current Behavior | Why It Is Wrong | Required Correction |
|---|---|---|---|---|
| `backend/prisma/schema.prisma` | `Customer.phone` | Indexed but not unique. | Duplicate phone numbers can exist through races or imported data despite service-level checks. | Add a partial unique policy for active phone numbers if PostgreSQL migration strategy supports it, or normalize and enforce uniqueness at application plus DB level. |
| `backend/src/services/customers.service.ts` | `createCustomer` | Duplicate phone check and insert are not in a transaction with a DB unique constraint. | Concurrent requests can create duplicates. | Add DB uniqueness or transactional lock strategy. |
| `backend/prisma/schema.prisma` | `Transaction.status` | Status is stored but not reliably updated. | Status can become stale or meaningless. | Either calculate status from due dates/payments or update within payment/cancel transactions. |
| `backend/src/repositories/transactions.repository.ts` | `update` and `softDelete` | Changes financial rows directly. | History can be rewritten and child rows can be cascaded to deleted state. | Preserve rows; use `CANCELLED`/`VOIDED` status and audit reason. |
| `backend/src/services/transactions.service.ts` | Payment creation | No idempotency key or duplicate submission protection. | Double-click/retry can record duplicate payments. | Add optional `idempotencyKey` unique per createdBy/payment target, or frontend/server duplicate-submit protection. |
| `backend/prisma/migrations/*` vs `backend/prisma/schema.prisma` | Migration state | Existing migration enum is `SALE/PAYMENT/ADJUSTMENT`; schema enum is `ONE_TIME/INSTALLMENT/PAYMENT/ADJUSTMENT`. | Deploying migrations may fail or leave drift from local manual changes. | Audit current database state and create a deliberate migration from legacy transactions to new domain tables. |

## 9. Timezone And Date Risks

| File | Function or Model | Current Behavior | Why It Is Wrong | Required Correction |
|---|---|---|---|---|
| `backend/prisma/schema.prisma` | `Transaction.dueDate`, `Transaction.date` | Stored as `DateTime`. | Due dates are business-local date-only values. UTC conversion can shift dates. | Store due dates/start dates as date-only semantics. In PostgreSQL use `DATE`; in Prisma use DateTime with strict local-date parsing if `@db.Date` is unavailable in current Prisma provider. |
| `frontend/src/pages/LedgerPage.tsx` | Date conversion | Converts date input with `new Date(value).toISOString()`. | Browser interpretation can shift local business dates to previous/next UTC date. | Submit date-only strings (`YYYY-MM-DD`) and parse on backend as business-local dates. |
| `frontend/src/features/transactions/components/TransactionForm.tsx` | Date conversion | Converts date input to ISO string. | Same UTC shift risk. | Submit date-only strings. |
| `backend/src/services/dashboard.service.ts` | Today/month calculations | Uses UTC day/month boundaries. | Business operates in local time; UTC can include/exclude wrong transactions. | Use configured business timezone and local date boundaries. |
| `backend/src/services/transactions.service.ts` | Month increments | Uses `Date.setMonth`. | Month-boundary behavior can be surprising for dates like January 31 and February. | Implement tested month-add policy for business schedules and document it. |

## 10. Exact Files That Need To Change

Backend:

- `backend/prisma/schema.prisma`
- new Prisma migration under `backend/prisma/migrations/`
- `backend/src/app.ts`
- `backend/src/routes/customers.routes.ts`
- `backend/src/routes/transactions.routes.ts` or replacement debt/installment/payment routes
- new `backend/src/routes/debts.routes.ts`
- new `backend/src/routes/installment-plans.routes.ts`
- new `backend/src/controllers/debts.controller.ts`
- new `backend/src/controllers/installment-plans.controller.ts`
- new `backend/src/controllers/payments.controller.ts` if payments are shared
- new `backend/src/repositories/debts.repository.ts`
- new `backend/src/repositories/installment-plans.repository.ts`
- new `backend/src/repositories/payments.repository.ts`
- new `backend/src/services/debts.service.ts`
- new `backend/src/services/installment-plans.service.ts`
- new `backend/src/services/payments.service.ts`
- `backend/src/services/customers.service.ts`
- `backend/src/services/dashboard.service.ts`
- new validators for debts/installment plans/payments
- existing `backend/src/validators/transactions.validator.ts` if retained for compatibility
- `backend/src/middleware/auth.middleware.ts`

Frontend:

- `frontend/src/App.tsx`
- `frontend/src/layouts/DashboardLayout.tsx`
- `frontend/src/pages/customers/CustomerProfilePage.tsx`
- `frontend/src/pages/LedgerPage.tsx` if retained
- `frontend/src/features/transactions/*` or replacement `frontend/src/features/financial/*`
- `frontend/src/features/quick-action/*`
- `frontend/src/components/ui/BalanceBadge.tsx`
- `frontend/src/features/dashboard/*`
- `frontend/src/services/api.ts`

Tests/config:

- `package.json`
- test setup files (currently no financial test framework is configured)
- backend service tests for debts, installment plans, payments, and authorization

Docs:

- `docs/Phase4-task.md`
- `docs/Phase5-task.md`
- `docs/Phase6-task.md`
- this audit file after implementation decisions are finalized

## 11. Proposed Final Flow

### Single Debt

1. Admin opens an existing customer profile.
2. Admin selects Add financial obligation.
3. Admin selects Single debt.
4. Backend validates `customerId`, `amount > 0`, `description`, and local date-only `dueDate`.
5. Backend creates one `Debt` row with status `UNPAID`.
6. Admin records payments against that debt.
7. Backend creates immutable `Payment` and `PaymentAllocation` rows in one database transaction.
8. Backend prevents payment amount greater than remaining balance.
9. Backend returns recalculated `totalPaid`, `remainingBalance`, and status.
10. Status is `PARTIALLY_PAID` after partial payment, `PAID` when fully paid, `OVERDUE` when due date has passed and balance remains, `CANCELLED` only through a cancel endpoint.

### Installment Plan

1. Admin opens an existing customer profile.
2. Admin selects Add financial obligation.
3. Admin selects Installment plan.
4. Admin enters total amount, description, start date, installment count, frequency, and notes.
5. Frontend previews schedule using the same policy as backend.
6. Backend validates inputs and creates `InstallmentPlan` plus exact `Installment` schedule rows in one transaction.
7. Payment endpoint accepts a plan payment and allocates to the oldest unpaid or partially paid installment first.
8. Backend creates one immutable `Payment` row and one or more `PaymentAllocation` rows.
9. Backend prevents plan overpayment.
10. Plan summary returns total amount, total paid, remaining balance, next due date, overdue installments, completed installments, and plan status.

## 12. Proposed Database Structure

Recommended design: shared `Payment` plus `PaymentAllocation`.

This design is stronger than separate `DebtPayment` and `InstallmentPayment` because it supports one customer payment covering multiple installments and can also support future mixed allocations if the business later allows one receipt to cover multiple obligations.

### Customer

- Keep existing `Customer`.
- Add enforced relation for `createdBy`.
- Add relations to debts, installment plans, and payments.
- Consider unique normalized active phone constraint.

### Debt

- `id`
- `customerId`
- `description`
- `originalAmount` DECIMAL(12,2)
- `dueDate` local date
- `status` enum `UNPAID | PARTIALLY_PAID | PAID | OVERDUE | CANCELLED`
- `notes`
- `createdById`
- `createdAt`
- `updatedAt`
- `cancelledAt`
- `cancelledById`
- `cancelReason`

### InstallmentPlan

- `id`
- `customerId`
- `description`
- `totalAmount` DECIMAL(12,2)
- `startDate` local date
- `installmentCount`
- `frequency` enum `MONTHLY`
- `status` enum `ACTIVE | COMPLETED | OVERDUE | CANCELLED`
- `notes`
- `createdById`
- `createdAt`
- `updatedAt`
- `cancelledAt`
- `cancelledById`
- `cancelReason`

### Installment

- `id`
- `installmentPlanId`
- `installmentNumber`
- `dueDate` local date
- `amountDue` DECIMAL(12,2)
- `status` enum `PENDING | PARTIALLY_PAID | PAID | OVERDUE | CANCELLED`
- `paidDate`
- `createdAt`
- `updatedAt`

Add unique constraint:

- `(installmentPlanId, installmentNumber)`

### Payment

- `id`
- `customerId`
- `totalAmount` DECIMAL(12,2)
- `paymentDate` local date
- `paymentMethod`
- `reference`
- `notes`
- `idempotencyKey`
- `createdById`
- `createdAt`
- `voidedAt`
- `voidedById`
- `voidReason`

### PaymentAllocation

- `id`
- `paymentId`
- `debtId` nullable
- `installmentId` nullable
- `amount` DECIMAL(12,2)
- `createdAt`

Constraint:

- Exactly one of `debtId` or `installmentId` must be non-null.

### Legacy Transaction

Options:

1. Keep `Transaction` temporarily as `LegacyTransaction` for migration/backward compatibility.
2. Migrate existing rows into new tables, then remove transaction routes/UI.

Given current drift and dirty worktree, option 1 is safer for the first migration.

## 13. Proposed API Contracts

Use existing auth response envelope style:

```json
{
  "success": true,
  "data": {},
  "meta": { "timestamp": "..." }
}
```

### Debts

- `POST /api/v1/customers/:customerId/debts`
- `GET /api/v1/customers/:customerId/debts`
- `GET /api/v1/debts/:debtId`
- `POST /api/v1/debts/:debtId/payments`
- `POST /api/v1/debts/:debtId/cancel`

Create debt body:

```json
{
  "amount": "600.00",
  "description": "Refrigerator",
  "dueDate": "2026-08-10",
  "notes": "Optional"
}
```

Debt payment body:

```json
{
  "amount": "200.00",
  "paymentDate": "2026-07-24",
  "paymentMethod": "CASH",
  "reference": "optional",
  "notes": "optional",
  "idempotencyKey": "optional-client-generated-key"
}
```

### Installment Plans

- `POST /api/v1/customers/:customerId/installment-plans`
- `GET /api/v1/customers/:customerId/installment-plans`
- `GET /api/v1/installment-plans/:planId`
- `POST /api/v1/installment-plans/:planId/payments`
- `POST /api/v1/installment-plans/:planId/cancel`

Create plan body:

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

Plan payment body:

```json
{
  "amount": "150.00",
  "paymentDate": "2026-08-15",
  "paymentMethod": "CASH",
  "reference": "optional",
  "notes": "optional",
  "idempotencyKey": "optional-client-generated-key"
}
```

### Customer Profile Summary

- `GET /api/v1/customers/:customerId/financial-summary`

Response should include:

- total outstanding balance
- debts
- installment plans
- payment history
- overdue items
- next payment due

### Reports

- `GET /api/v1/reports/outstanding-debts`
- `GET /api/v1/reports/overdue-debts`
- `GET /api/v1/reports/installments-due`
- `GET /api/v1/reports/monthly-debts`

These should be implemented after the core data model and payment allocation rules are stable.

## 14. Migration Risks

1. Existing migration/schema drift around `TransactionType` can cause migration failure. The current database state must be inspected before applying any new migration.
2. Current data may contain parent `INSTALLMENT` rows, generated child `INSTALLMENT` rows, parent payments, and child payments. Mapping these into new tables requires explicit conversion rules.
3. Existing balances may already be wrong if child payments are excluded from dashboard/customer balance totals.
4. Existing frontend depends on `/transactions`; replacing it abruptly can break pages.
5. Current build fails before implementation due to TypeScript errors in `transactions.controller.ts` and `customers.validator.ts`.
6. Current lint fails because `@typescript-eslint/eslint-plugin` is missing.
7. Existing customer soft deletes may have hidden customers with financial rows. New constraints must account for historical data.
8. Date conversion from ISO `DateTime` to local date-only fields can shift due dates if not migrated carefully.

## 15. Implementation Order

1. Stabilize the baseline build:
   - install/fix missing ESLint dependencies
   - fix TypeScript errors in `transactions.controller.ts`
   - fix `customerQuerySchema`
   - fix missing `Plus` import in `CustomerProfilePage.tsx`
   - align frontend API default port with backend or `.env`
2. Add backend tests and test runner.
3. Add new Prisma enums and tables for debts, installment plans, installments, payments, and allocations.
4. Add migration with no destructive changes to existing `transactions`.
5. Implement Decimal/date utility helpers for money and business-local date handling.
6. Implement debt repository/service/controller/routes/validators.
7. Implement installment plan repository/service/controller/routes/validators.
8. Implement shared payment and allocation logic with database transactions and overpayment prevention.
9. Block customer deletion when financial history exists.
10. Rebuild dashboard summary from new models.
11. Update frontend API clients and hooks.
12. Replace customer profile transaction tab with:
    - financial summary
    - single debts
    - installment plans
    - payment history
    - overdue and next-due indicators
13. Replace generic transaction modal with "Add financial obligation" choice and dedicated forms.
14. Add installment schedule preview.
15. Remove or deprecate inline customer creation in debt/payment flows.
16. Add reports after the core flow passes tests.
17. Migrate legacy transaction data into new models, or keep legacy read-only until migration is verified.
18. Run lint, typecheck, tests, production build, and manual verification.

## Additional Baseline Build Findings

These are not the core business-flow problem but must be fixed before claiming completion:

- `npm run lint` fails because `.eslintrc.cjs` references `@typescript-eslint/eslint-plugin`, which is not installed.
- `npm run build` fails after frontend build:
  - `backend/src/controllers/transactions.controller.ts`: `req.params.id` is typed as `string | string[]`.
  - `backend/src/validators/customers.validator.ts`: Zod default/transform type errors for `page` and `limit`.
- `frontend/src/services/api.ts` defaults to `http://localhost:5000/api/v1`, while `backend/src/index.ts` defaults to port `3001`.
- `frontend/src/pages/customers/CustomerProfilePage.tsx` uses `Plus` without importing it.

## Conclusion

The current implementation is a useful prototype ledger, but it does not satisfy the requested financial business flow. The main issue is that debts, installment plans, installment schedules, and payments are all compressed into a generic `Transaction` table. That makes status management, payment allocation, overdue detection, immutability, reporting, and customer profile clarity fragile.

The recommended correction is to introduce explicit domain models for `Debt`, `InstallmentPlan`, `Installment`, `Payment`, and `PaymentAllocation`, preserve the existing transaction data during migration, and rebuild the API/frontend around the exact admin flows described in the request.
