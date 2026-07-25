# Phase 2 Financial Domain Result

Date: 2026-07-24

## 1. Summary

Phase 2 added an explicit financial-domain database foundation beside the existing legacy `Transaction` model.

Added domain models:

- `Debt`
- `InstallmentPlan`
- `Installment`
- `Payment`
- `PaymentAllocation`

No debt API, installment API, payment allocation service, reports, dashboard rewrite, or frontend financial flow was implemented in this phase.

No Git commit was created.

## 2. Initial Database State

The configured local development database was reachable at `localhost:5433`.

Initial local tables:

- `users`
- `customers`
- `transactions`
- `activity_logs`

Initial local row counts:

- users: 1
- customers: 1
- transactions: 2
- activity_logs: 2

The local database did not have `_prisma_migrations`.

## 3. Migration Status Before Changes

Before Phase 2 migration application:

- Repository had 4 migrations.
- `npx prisma migrate status` against the local database reported all 4 as not applied.
- The local database contained the application tables anyway, so it was manually drifted from Prisma migration history.

After adding Phase 2 migration:

- Repository has 5 migrations.
- Local development database still reports all 5 migrations as not applied because `_prisma_migrations` is missing.
- No migration was applied to the drifted local development database.

## 4. Models Added

### Debt

Added `Debt` mapped to `debts`.

Important fields:

- `originalAmount Decimal @db.Decimal(12, 2)`
- `dueDate DateTime @db.Date`
- `status DebtStatus`
- required customer relation
- required creator relation
- nullable cancellation fields

### InstallmentPlan

Added `InstallmentPlan` mapped to `installment_plans`.

Important fields:

- `totalAmount Decimal @db.Decimal(12, 2)`
- `startDate DateTime @db.Date`
- `installmentCount Int`
- `frequency InstallmentPlanFrequency`
- `status InstallmentPlanStatus`
- required customer relation
- required creator relation
- nullable cancellation fields

### Installment

Added `Installment` mapped to `installments`.

Important fields:

- `installmentPlanId`
- `installmentNumber`
- `dueDate DateTime @db.Date`
- `amountDue Decimal @db.Decimal(12, 2)`
- `status InstallmentStatus`
- `paidDate DateTime? @db.Date`

### Payment

Added `Payment` mapped to `payments`.

Important fields:

- `customerId`
- `totalAmount Decimal @db.Decimal(12, 2)`
- `paymentDate DateTime @db.Date`
- `paymentMethod PaymentMethod`
- `idempotencyKey String? @unique`
- required creator relation
- nullable voiding fields

Idempotency decision:

- `idempotencyKey` is globally unique when present.
- PostgreSQL allows multiple null values in a unique index, so only submitted keys are deduplicated.
- This is simple and safe for future client-generated UUID-style keys.

### PaymentAllocation

Added `PaymentAllocation` mapped to `payment_allocations`.

Important fields:

- required payment relation
- nullable debt target
- nullable installment target
- `amount Decimal @db.Decimal(12, 2)`
- raw SQL XOR check constraint for target validity

## 5. Enums Added

- `DebtStatus`: `UNPAID | PARTIALLY_PAID | PAID | OVERDUE | CANCELLED`
- `InstallmentPlanFrequency`: `MONTHLY`
- `InstallmentPlanStatus`: `ACTIVE | COMPLETED | OVERDUE | CANCELLED`
- `InstallmentStatus`: `PENDING | PARTIALLY_PAID | PAID | OVERDUE | CANCELLED`
- `PaymentMethod`: `CASH | CARD | BANK_TRANSFER | OTHER`

## 6. Relations Added

Customer relations:

- `debts`
- `installmentPlans`
- `payments`

User relations:

- `debtsCreated`
- `debtsCancelled`
- `installmentPlansCreated`
- `installmentPlansCancelled`
- `paymentsCreated`
- `paymentsVoided`

Financial relations:

- `InstallmentPlan.installments`
- `Payment.allocations`
- `Debt.paymentAllocations`
- `Installment.paymentAllocations`

All financial foreign keys use `ON DELETE RESTRICT`.

## 7. Indexes Added

Debt:

- `customerId`
- `dueDate`
- `status`
- `customerId, status`

InstallmentPlan:

- `customerId`
- `status`
- `startDate`

Installment:

- unique `installmentPlanId, installmentNumber`
- `installmentPlanId`
- `dueDate`
- `status`
- `installmentPlanId, status`

Payment:

- unique `idempotencyKey`
- `customerId`
- `paymentDate`
- `createdById`

PaymentAllocation:

- `paymentId`
- `debtId`
- `installmentId`

## 8. Check Constraints Added

Manual PostgreSQL check constraints in migration SQL:

- `debts_originalAmount_positive_check`
- `installment_plans_totalAmount_positive_check`
- `installment_plans_installmentCount_positive_check`
- `installments_amountDue_positive_check`
- `installments_installmentNumber_positive_check`
- `payments_totalAmount_positive_check`
- `payment_allocations_amount_positive_check`
- `payment_allocations_target_xor_check`

## 9. Manual SQL Added To Migration

The migration was manually authored because Prisma schema cannot express check constraints.

Manual SQL includes:

- positive money/count checks
- payment allocation XOR target check
- explicit `ON DELETE RESTRICT` foreign keys

The migration does not alter `transactions` or `TransactionType`.

## 10. Money Strategy

All financial amount columns use PostgreSQL `DECIMAL(12,2)` through Prisma `Decimal @db.Decimal(12, 2)`.

No mutable `remainingBalance` or `totalPaid` columns were added.

Future APIs should pass money values as strings to avoid JavaScript floating-point errors.

## 11. Date Strategy

Business dates use PostgreSQL `DATE`:

- debt due date
- installment plan start date
- installment due date
- installment paid date
- payment date

Audit events remain timestamps:

- created at
- updated at
- cancelled at
- voided at

## 12. Delete Behavior

Financial records use restricted delete behavior.

Verified in the isolated migration test database:

- deleting a customer referenced by a debt is rejected
- deleting a payment referenced by an allocation is rejected

Normal business reversal should happen through cancellation/voiding metadata, not deletion.

## 13. Legacy Transaction Preservation

The legacy `Transaction` model remains present.

Phase 2 did not:

- rename `Transaction`
- remove `Transaction`
- remove transaction routes
- migrate legacy transaction records
- alter the legacy transaction table in migration SQL
- alter `TransactionType` in migration SQL

## 14. Migration Commands Run

Safe inspection/format/generation:

- `npm run prisma:validate`
- `npx prisma format --schema backend/prisma/schema.prisma`
- `npx prisma validate --schema backend/prisma/schema.prisma`
- `npx prisma generate --schema backend/prisma/schema.prisma`

Migration status:

- `npx prisma migrate status --schema backend/prisma/schema.prisma` against local development database
- `npx prisma migrate status --schema backend/prisma/schema.prisma` against isolated `homeconnect_phase2_test`

Migration application:

- Created isolated database `homeconnect_phase2_test` through Prisma.
- Ran `npx prisma migrate deploy --schema backend/prisma/schema.prisma` against `homeconnect_phase2_test`.
- Did not apply migrations to the drifted local development database.
- Did not run `migrate reset`.

## 15. Verification Results

Passed:

- `npm run lint`
  - passed with existing warnings
- `npm run typecheck`
- `npm run test`
  - 3 test files passed
  - 11 tests passed
- `npm run build`
- `npm run prisma:validate`
- `npx prisma format --schema backend/prisma/schema.prisma`
- `npx prisma validate --schema backend/prisma/schema.prisma`
- `npx prisma generate --schema backend/prisma/schema.prisma`
- `npx prisma migrate deploy --schema backend/prisma/schema.prisma` against `homeconnect_phase2_test`
- `npx prisma migrate status --schema backend/prisma/schema.prisma` against `homeconnect_phase2_test`
  - reported database schema is up to date

Constraint verification against `homeconnect_phase2_test` passed:

- new tables exist
- legacy tables remain present
- positive debt amount constraint rejects zero
- positive installment count constraint rejects zero
- positive payment amount constraint rejects zero
- installment plan sequence uniqueness rejects duplicates
- allocation target required/XOR constraints reject invalid rows
- positive allocation amount rejects zero
- customer delete restriction rejects deleting referenced customer
- payment delete restriction rejects deleting allocated payment
- date/decimal columns exist with expected database types

Blocked for original local development database:

- `npx prisma migrate status` remains unhealthy because the local DB has useful tables/data but no `_prisma_migrations` table.
- Applying Prisma migrations to that database would require a separate non-destructive baseline reconciliation decision.

## 16. Existing-Data Verification

Original local development database was not migrated.

Post-Phase 2 local counts remained:

- users: 1
- customers: 1
- transactions: 2
- activity_logs: 2

New Phase 2 financial tables are not present in the original local development database because no migration was applied there.

## 17. Files Changed

Phase 2 files:

- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/20260724090000_add_financial_domain_models/migration.sql`
- `backend/prisma/financial-domain-schema.test.ts`
- `docs/PHASE_2_FINANCIAL_DOMAIN_DESIGN.md`
- `docs/PHASE_2_FINANCIAL_DOMAIN_RESULT.md`
- `vitest.config.ts`

Note:

- `vitest.config.ts` was added because build output under `dist/server` caused Vitest to discover compiled CommonJS copies of test files after a production build.

## 18. Pre-Existing Dirty-Worktree Caveat

The repository already had uncommitted changes before Phase 2.

Current `git diff --stat` includes Phase 1 and earlier user-owned changes, not only Phase 2. No commit was created.

## 19. Remaining Risks

- Original local development DB migration history is not reconciled.
- Existing checked migrations still drift from current legacy `Transaction` schema.
- The isolated test DB is healthy for migration history, but because older migrations are drifted from current schema, it is not a full substitute for production drift reconciliation.
- `pg_dump`/`psql`/`createdb` were not available on PATH, so no PostgreSQL CLI backup was created.
- Lint still reports existing warnings, mostly `any` usage and a React hooks dependency warning.
- Frontend build still reports chunk-size warnings.

## 20. Exact Starting Point For Phase 3

Start Phase 3 with backend services and APIs for the new domain:

1. Decide how to reconcile local/prod Prisma migration history without data loss.
2. Add validators and services for `Debt` creation/cancellation.
3. Add validators and services for `InstallmentPlan` creation with schedule generation.
4. Add payment creation/allocation services using `Payment` and `PaymentAllocation`.
5. Keep all status updates inside database transactions.
6. Keep legacy `Transaction` routes untouched until a dedicated migration/read-only strategy is chosen.
