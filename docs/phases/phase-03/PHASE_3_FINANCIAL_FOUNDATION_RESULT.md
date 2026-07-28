# Phase 3 Financial Foundation Result

Date: 2026-07-24

## 1. Summary

Phase 3 added a tested shared backend financial foundation under `backend/src/features/financial`.

Implemented:

- Decimal-safe money helpers
- Strict business date-only helpers
- Configurable business timezone support
- Monthly installment schedule generation
- Installment rounding rules
- Debt, installment, and plan balance helpers
- Debt, installment, and plan status helpers
- Debt and installment payment allocation planners
- Idempotency key and fingerprint helpers
- Prisma transaction retry conventions
- Financial immutability assertions
- Admin-only financial mutation policy
- Financial domain errors integrated with the existing `AppError` envelope

Not implemented:

- No debt controller or route
- No installment plan controller or route
- No final payment endpoint
- No frontend changes for Phase 3
- No legacy `Transaction` route changes
- No legacy data migration

No Git commit was created.

## 2. Files Added

- `docs/phases/phase-03/PHASE_3_FINANCIAL_FOUNDATION_DESIGN.md`
- `docs/phases/phase-03/PHASE_3_FINANCIAL_FOUNDATION_RESULT.md`
- `backend/src/features/financial/index.ts`
- `backend/src/features/financial/authorization/financial-policy.ts`
- `backend/src/features/financial/authorization/financial-policy.test.ts`
- `backend/src/features/financial/domain/balances.ts`
- `backend/src/features/financial/domain/balances-statuses-allocation.test.ts`
- `backend/src/features/financial/domain/business-date.ts`
- `backend/src/features/financial/domain/business-date.test.ts`
- `backend/src/features/financial/domain/financial-errors.ts`
- `backend/src/features/financial/domain/financial-types.ts`
- `backend/src/features/financial/domain/immutable-policy.ts`
- `backend/src/features/financial/domain/immutable-policy.test.ts`
- `backend/src/features/financial/domain/installment-schedule.ts`
- `backend/src/features/financial/domain/installment-schedule.test.ts`
- `backend/src/features/financial/domain/money.ts`
- `backend/src/features/financial/domain/money.test.ts`
- `backend/src/features/financial/domain/payment-allocation.ts`
- `backend/src/features/financial/domain/statuses.ts`
- `backend/src/features/financial/infrastructure/financial-db.integration.test.ts`
- `backend/src/features/financial/infrastructure/idempotency.ts`
- `backend/src/features/financial/infrastructure/idempotency-transaction.test.ts`
- `backend/src/features/financial/infrastructure/transaction.ts`

## 3. Files Modified

Phase 3 modified:

- `backend/.env.example`

The worktree already contained many pre-existing modified and untracked files from prior phases and user work. Phase 3 did not intentionally modify frontend files, legacy transaction routes, legacy services, or Prisma schema.

## 4. Money Implementation

`money.ts` uses `Decimal` from `@prisma/client/runtime/library`.

Rules enforced:

- API/user money input must be a decimal string with at most 2 decimal places.
- Decimal input is accepted.
- Negative values are rejected where positive money is required.
- Zero is rejected where positive money is required.
- Values over `DECIMAL(12,2)` precision are rejected.
- Calculations use Decimal arithmetic.
- API output is serialized as strings such as `600.00`.

No financial helper uses JavaScript floating-point arithmetic as calculation truth.

## 5. Date Implementation

`business-date.ts` centralizes strict `YYYY-MM-DD` business dates.

Rules enforced:

- Strict format validation.
- Invalid calendar dates are rejected.
- Leap years are handled.
- PostgreSQL `DATE` transport uses UTC midnight.
- Prisma `Date` values are converted back using UTC date parts.
- Date comparison uses normalized date-only strings.

## 6. Business Timezone Implementation

`BUSINESS_TIMEZONE` was added to `backend/.env.example`.

Default fallback is `Asia/Beirut`. `todayInBusinessTimezone` accepts an injected clock for deterministic tests and uses `Intl.DateTimeFormat` with the configured timezone.

No new dependency was added.

## 7. Schedule-Generation Policy

`generateMonthlyInstallmentSchedule` creates pure schedule rows for `MONTHLY` installment plans.

Rules:

- First installment is due on `startDate`.
- Later installments add calendar months from the original anchor date.
- Only `MONTHLY` is supported in Phase 3.
- The function returns instructions only and writes no database rows.

## 8. Rounding Policy

Schedule generation splits by cents:

- First `count - 1` installments receive the floor-cent base amount.
- Final installment absorbs the remainder.
- Every installment must be positive.
- The exact sum must equal the total.
- Totals smaller than the installment count in cents are rejected.

Example verified:

- `100.00 / 3` -> `33.33`, `33.33`, `33.34`

## 9. Balance Rules

Implemented:

- `calculateDebtBalance`
- `calculateInstallmentBalance`
- `calculateInstallmentPlanSummary`

Voided allocations are excluded. No calculated totals are stored as new database source-of-truth columns.

Plan summary returns:

- total paid
- remaining balance
- completed installment count
- overdue installment count
- next due date

Cancelled installments are excluded from operational plan completion and overdue calculations.

## 10. Status Rules

Implemented deterministic status helpers:

- `determineDebtStatus`
- `determineInstallmentStatus`
- `determineInstallmentPlanStatus`

Debt priority:

1. `CANCELLED`
2. `PAID`
3. `OVERDUE`
4. `PARTIALLY_PAID`
5. `UNPAID`

Installment priority:

1. `CANCELLED`
2. `PAID`
3. `OVERDUE`
4. `PARTIALLY_PAID`
5. `PENDING`

Plan priority:

1. `CANCELLED`
2. `COMPLETED`
3. `OVERDUE`
4. `ACTIVE`

Overdue outranks partial payment.

## 11. Allocation Rules

Implemented:

- `planInstallmentPaymentAllocations`
- `planDebtPaymentAllocation`

Installment allocation:

- Allocates oldest due date first.
- Tie-breaks by installment number.
- Skips paid installments.
- Skips cancelled installments.
- Supports partial allocation.
- Rejects zero, negative, and overpayment amounts.
- Exact allocation sum must equal payment amount.

Debt allocation:

- One target debt.
- Payment cannot exceed remaining debt balance.
- Cancelled debt allocation is rejected.

## 12. Idempotency Strategy

Implemented:

- `normalizeIdempotencyKey`
- `createIdempotencyFingerprint`
- `assertIdempotentReplay`
- `IdempotencyRepositoryContract`

Rules:

- Blank keys normalize to absent.
- Valid keys are 8 to 128 safe ASCII characters.
- Request fingerprints are stable across object key ordering.
- Same key and same logical request is allowed.
- Same key and different logical request is rejected with conflict.

Future services should store and compare the fingerprint alongside the unique `Payment.idempotencyKey`.

## 13. Transaction Strategy

Implemented:

- `FinancialTransactionClient`
- `retrySerializableTransaction`
- `runFinancialTransaction`
- `isRetryableTransactionError`

Future financial writes should use Prisma interactive transactions with serializable isolation for payment creation/allocation flows. Serialization conflicts use Prisma error code `P2034` and are retried by the helper.

No custom row-locking abstraction was added.

## 14. Authorization Policy

Implemented:

- `requireFinancialAdmin`
- `assertCanPerformFinancialMutation`
- `ADMIN_FINANCIAL_MUTATION_ACTIONS`

Admin-required actions:

- create debt
- create installment plan
- record payment
- cancel debt
- cancel installment plan
- void payment

This reuses the existing `requireRole` middleware and `Role.ADMIN`.

## 15. Error Taxonomy

Financial errors extend `AppError` and therefore flow through the existing central error handler and response envelope.

Added:

- `InvalidMoneyError` -> 400
- `InvalidBusinessDateError` -> 400
- `InvalidInstallmentCountError` -> 400
- `InstallmentScheduleError` -> 400
- `OverpaymentError` -> 409
- `FinancialRecordCancelledError` -> 409
- `FinancialRecordAlreadyPaidError` -> 409
- `PaymentIdempotencyConflictError` -> 409
- `FinancialInvariantError` -> 500

## 16. Unit Tests Added

Unit tests cover:

- money precision, invalid input, comparison, equality, API formatting
- strict business date parsing and timezone behavior
- monthly schedule generation, month-end behavior, leap years, exact sums
- debt/installment/plan balances
- all debt/installment/plan status transitions
- payment allocation ordering and overpayment rejection
- idempotency validation and replay conflict behavior
- transaction retry behavior
- immutable financial policy assertions
- admin financial mutation policy

Normal suite result:

- 10 test files passed
- 51 tests passed
- 1 integration test skipped by default

## 17. Integration Tests Added

Added `financial-db.integration.test.ts`.

It is guarded by:

```text
RUN_FINANCIAL_DB_TESTS=1
```

Verified against the local migrated `homeconnect` database:

- Decimal values round-trip through Prisma.
- PostgreSQL `DATE` values round-trip without day shifting.
- Payment allocation XOR constraint remains active.
- Positive debt amount constraint remains active.
- Temporary rows are cleaned up.

Post-timeout cleanup audit confirmed:

- `phase3_` users: 0
- `phase3_` customers: 0

## 18. Commands Run

Baseline before edits:

- `git status --short`
- `npm run prisma:validate`
- `npm run typecheck`
- `npm run test`

Final verification:

- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`
- `npm run prisma:validate`
- `npx prisma generate --schema backend/prisma/schema.prisma`
- `npx prisma validate --schema backend/prisma/schema.prisma`
- focused DB integration test with `RUN_FINANCIAL_DB_TESTS=1`

Additional cleanup/audit:

- audited no leftover `phase3_` temp users/customers
- collected `git status --short`
- collected `git diff --stat`

## 19. Verification Results

Passed:

- `npm run lint`
  - 0 errors
  - 69 warnings, all pre-existing outside the Phase 3 module
- `npm run typecheck`
- `npm run test`
  - 10 passed, 1 skipped
  - 51 passed tests, 1 skipped integration test
- focused DB integration test
  - 1 passed
- `npm run build`
  - passed
  - frontend chunk-size warning remains
- `npm run prisma:validate`
- `npx prisma validate --schema backend/prisma/schema.prisma`
- `npx prisma generate --schema backend/prisma/schema.prisma`

Prisma generation note:

- An initial `npx prisma generate` failed with a Windows `EPERM` rename because the query engine DLL was locked by a Node process.
- A temporary `--no-engine` generation was rejected because it does not support the local PostgreSQL URL.
- A binary-engine attempt was used only as a diagnostic and was not left as the final state.
- After stopping only recent Node processes created by the failed verification probe, normal Prisma generation passed and the DB integration test passed again.

## 20. Remaining Risks

- Existing lint warnings remain in older backend/frontend files.
- The frontend production build still reports a chunk-size warning.
- Legacy `Transaction` logic still uses JavaScript numbers and mutable transaction routes; Phase 3 intentionally did not change legacy behavior.
- Future service phases must persist status updates and allocations inside transactions.
- Future payment services should store idempotency request fingerprints; Phase 2 only added the unique key column.
- Phase 3 does not add row locking beyond serializable transaction retry conventions.

## 21. Phase 4 Entry Requirements

Before Phase 4 debt services:

1. Reuse `parseMoney`, `businessDateToPrisma`, and `moneyToApiString` for all financial API input/output.
2. Use `assertCanPerformFinancialMutation` or `requireFinancialAdmin` on mutation paths.
3. Use `runFinancialTransaction` for debt creation, payment creation, cancellation, voiding, and status updates.
4. Use balance/status helpers instead of duplicating calculations in services.
5. Use allocation planners before inserting `PaymentAllocation` rows.
6. Add service-level tests for DB persistence and overpayment races.
7. Keep legacy `Transaction` routes untouched until a dedicated migration/read-only phase.

## Git Diff Stat

Raw tracked diff stat at the end of Phase 3:

```text
29 files changed, 1555 insertions(+), 655 deletions(-)
```

Important caveat:

- This raw stat includes pre-existing Phase 1/2 and user changes.
- Newly added Phase 3 files are currently untracked, so they are not represented in that tracked-only stat.
