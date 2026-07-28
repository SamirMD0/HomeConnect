# Phase 2 Financial Domain Design

Date: 2026-07-24

## 1. Current Prisma Schema Summary

The project uses Prisma 5.22 with a PostgreSQL datasource:

- `generator client`: `prisma-client-js`
- `datasource db`: `postgresql`
- package versions: `prisma@^5.22.0`, `@prisma/client@^5.22.0`

Existing models:

- `User`
  - UUID primary key
  - enum role `ADMIN | EMPLOYEE`
  - soft-delete support through `deletedAt`
  - relations to legacy `Transaction` and `ActivityLog`
- `Customer`
  - UUID primary key
  - `name`, `phone`, optional `address`, optional `notes`
  - soft-delete support through `deletedAt`
  - `createdBy` UUID, currently not enforced as a relation
  - relation to legacy `Transaction`
- `Transaction`
  - UUID primary key
  - required customer relation
  - required user relation through `createdBy`
  - `amount Decimal @db.Decimal(12, 2)`
  - current enum `TransactionType`: `ONE_TIME | INSTALLMENT | PAYMENT | ADJUSTMENT`
  - current enum `TransactionStatus`: `PENDING | PARTIAL | PAID`
  - optional `dueDate`
  - self-relation through `parentId` / `payments`
- `ActivityLog`
  - UUID primary key
  - required user relation
  - JSON details

Current conventions:

- IDs are `String @id @default(uuid()) @db.Uuid`.
- Money currently uses `Decimal @db.Decimal(12, 2)`.
- Audit timestamps use `DateTime @default(now())` and `DateTime @updatedAt`.
- Soft deletion exists for user/customer/transaction legacy data.
- Relations generally use PostgreSQL default restrict behavior when required, though not every FK specifies `onDelete`.

## 2. Existing Migration State

Repository migration files:

- `20260723075336_init`
  - Creates `Role` enum and `users`.
- `20260723091230_init_customers`
  - Creates `customers`.
- `20260723094305_init_ledger`
  - Creates legacy `TransactionType` as `SALE | PAYMENT | ADJUSTMENT`.
  - Creates `transactions` and `activity_logs`.
- `20260723133024_add_due_date_and_soft_delete_to_transactions`
  - Adds `dueDate`, `updatedAt`, `deletedAt` to `transactions`.

Local database inspection:

- Database is reachable through the configured `backend/.env` datasource.
- Existing public tables: `users`, `customers`, `transactions`, `activity_logs`.
- Existing row counts: 1 user, 1 customer, 2 transactions, 2 activity logs.
- `_prisma_migrations` table is missing.
- `prisma migrate status` reports all 4 repository migrations as not applied.

## 3. Existing Schema/Migration Drift

The checked migration history and current local database/schema are drifted.

Observed drift:

- Migration `20260723094305_init_ledger` creates `TransactionType` values `SALE | PAYMENT | ADJUSTMENT`.
- Current Prisma schema and local DB enum values are `ONE_TIME | INSTALLMENT | PAYMENT | ADJUSTMENT`.
- Current Prisma schema and local DB have `TransactionStatus`; checked migrations do not create it.
- Current Prisma schema and local DB have `transactions.status` and `transactions.parentId`; checked migrations do not create those fields.
- Local database has no `_prisma_migrations` table, so Prisma cannot consider migration history healthy.

Phase 2 will not repair legacy transaction drift because the phase boundary says not to alter or rewrite the legacy `Transaction` model, routes, enum values, or existing rows.

## 4. Proposed Financial Domain Models

Add explicit domain models alongside the legacy `Transaction` model:

- `Debt`
- `InstallmentPlan`
- `Installment`
- `Payment`
- `PaymentAllocation`

These models support the required future flows without changing existing legacy transaction data.

## 5. Proposed Enums

Add:

- `DebtStatus`: `UNPAID | PARTIALLY_PAID | PAID | OVERDUE | CANCELLED`
- `InstallmentPlanFrequency`: `MONTHLY`
- `InstallmentPlanStatus`: `ACTIVE | COMPLETED | OVERDUE | CANCELLED`
- `InstallmentStatus`: `PENDING | PARTIALLY_PAID | PAID | OVERDUE | CANCELLED`
- `PaymentMethod`: `CASH | CARD | BANK_TRANSFER | OTHER`

Payment method enum is justified because the business will need receipt/report filtering and it provides a controlled initial vocabulary without forcing a full payment processor design.

## 6. Relationship Diagram

Text form:

```text
User
  ├─ creates many Debt records
  ├─ cancels many Debt records
  ├─ creates many InstallmentPlan records
  ├─ cancels many InstallmentPlan records
  ├─ creates many Payment records
  └─ voids many Payment records

Customer
  ├─ has many legacy Transaction records
  ├─ has many Debt records
  ├─ has many InstallmentPlan records
  └─ has many Payment records

InstallmentPlan
  └─ has many Installment records

Payment
  └─ has many PaymentAllocation records

PaymentAllocation
  ├─ targets exactly one Debt, or
  └─ targets exactly one Installment
```

## 7. Money Storage Strategy

Use `Decimal @db.Decimal(12, 2)` for every money column:

- `Debt.originalAmount`
- `InstallmentPlan.totalAmount`
- `Installment.amountDue`
- `Payment.totalAmount`
- `PaymentAllocation.amount`

Do not use `Float`.

Later API phases should accept and return financial amounts as strings to avoid JavaScript floating-point errors.

Manual PostgreSQL `CHECK` constraints will enforce positive values:

- `originalAmount > 0`
- `totalAmount > 0`
- `amountDue > 0`
- `Payment.totalAmount > 0`
- `PaymentAllocation.amount > 0`

## 8. Date-Only Storage Strategy

Business dates must not shift with UTC conversion.

Use `DateTime @db.Date` for:

- `Debt.dueDate`
- `InstallmentPlan.startDate`
- `Installment.dueDate`
- `Installment.paidDate`
- `Payment.paymentDate`

Keep audit event timestamps as timestamps:

- `createdAt`
- `updatedAt`
- `cancelledAt`
- `voidedAt`

Business dates represent local calendar days. Audit timestamps represent exact event times.

## 9. Status Strategy

Status columns are retained for queryability and workflow control.

Phase 2 will only define enum/status columns. It will not add triggers or automatic status transitions.

Later services must update statuses in the same database transaction as:

- payment creation
- allocation creation
- debt cancellation
- installment plan cancellation
- payment voiding
- overdue recalculation

No mutable `remainingBalance` or `totalPaid` columns will be added.

## 10. Audit-Field Strategy

Creation:

- `createdById` is required for `Debt`, `InstallmentPlan`, and `Payment`.
- `createdAt` defaults to current timestamp.

Updates:

- `updatedAt` is used on mutable workflow records: `Debt`, `InstallmentPlan`, `Installment`.
- Payment and allocation rows remain immutable except payment voiding fields.

Cancellation/voiding:

- `cancelledAt`, `cancelledById`, `cancelReason` for debts/plans.
- `voidedAt`, `voidedById`, `voidReason` for payments.

## 11. Cancellation And Voiding Strategy

Financial records must not be deleted during normal operation.

- Debt cancellation keeps the debt record and records cancellation metadata.
- Installment plan cancellation keeps the plan and schedule records.
- Payment voiding keeps the payment and allocation records.
- No cascading deletes are used for financial history.

Application services in later phases must enforce valid state transitions.

## 12. Payment Allocation Constraint Strategy

`PaymentAllocation` will have nullable `debtId` and nullable `installmentId`.

The database must enforce XOR target behavior:

```sql
CHECK (
  ("debtId" IS NOT NULL AND "installmentId" IS NULL)
  OR
  ("debtId" IS NULL AND "installmentId" IS NOT NULL)
)
```

Prisma cannot express this check constraint directly, so the generated/manual migration SQL will include explicit PostgreSQL `CHECK` constraints.

## 13. Legacy Transaction Compatibility Strategy

The legacy `Transaction` model remains intact in Phase 2.

Phase 2 will not:

- rename `Transaction`
- delete `Transaction`
- change `TransactionType`
- migrate transaction records
- remove transaction routes
- remove frontend transaction screens

The new financial domain is added beside the legacy structure. A later dedicated phase must decide whether legacy transactions become read-only or are migrated into the new domain tables.

## 14. Migration Plan

1. Create this design document.
2. Update `backend/prisma/schema.prisma` with new enums, models, and relations.
3. Run `npx prisma format --schema backend/prisma/schema.prisma`.
4. Run `npm run prisma:validate`.
5. Create a new non-destructive migration directory.
6. Manually inspect and author migration SQL because the legacy migration history is already drifted.
7. Add new enum types, tables, indexes, foreign keys, and check constraints only.
8. Do not alter or drop legacy transaction objects.
9. Run `npx prisma generate`.
10. Run lint, typecheck, tests, build, and Prisma validation.
11. Attempt migration status and migration application only if safe.

Because the local database contains useful data and lacks `_prisma_migrations`, Phase 2 must not run `migrate reset`. If applying with Prisma migrate is blocked by drift, stop and document the blocked state.

Backup plan before any local additive migration attempt:

- Prefer `pg_dump` to a timestamped dump file outside the repo if `pg_dump` is available.
- If `pg_dump` is unavailable, do not apply schema changes to the useful local database.

## 15. Rollback Risks

The migration is additive, but rollback is still not automatic:

- Dropping new tables later could remove newly created financial-domain data.
- Dropping new enums requires all dependent tables/columns to be removed first.
- If raw `CHECK` constraints are wrong, inserts in later phases may fail.
- Applying migration SQL manually to a drifted DB without migration metadata can make later Prisma migrations harder.
- Current migration drift should be resolved before production deployment.

## 16. Exact Expected Changed Files

Expected Phase 2 changes:

- `backend/prisma/schema.prisma`
- one new migration under `backend/prisma/migrations/`
- database/schema tests under `backend/src` or `backend/prisma`
- `docs/phases/phase-02/PHASE_2_FINANCIAL_DOMAIN_DESIGN.md`
- `docs/phases/phase-02/PHASE_2_FINANCIAL_DOMAIN_RESULT.md`

No frontend pages, financial services, controllers, or routes should change in Phase 2.
