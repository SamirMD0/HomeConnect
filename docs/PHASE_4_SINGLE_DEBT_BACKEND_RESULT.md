# Phase 4 Single Debt Backend Result

Date: 2026-07-24

## 1. Summary

Phase 4 implemented the backend-only single customer debt flow.

Implemented:

- Debt validators
- Debt repository
- Debt service
- Debt controller
- Debt routes
- Debt creation for existing customers only
- Debt details and customer debt listing
- Debt payment recording
- Payment allocation targeting debt only
- Overpayment prevention
- Idempotency handling for debt payments
- Debt cancellation without deletion
- Immutable payment history responses
- Admin-only mutation policy
- Tests and API documentation

Not implemented:

- No installment APIs
- No frontend debt UI
- No dashboard/report rewrite
- No legacy `Transaction` migration or route removal
- No generic debt update/delete endpoints

No Git commit was created.

## 2. Architecture Implemented

Phase 4 uses a feature-based backend folder:

```text
backend/src/features/financial/debts/
```

Controllers handle request/response only. Services own business rules. Repositories own Prisma access. Validation uses the existing Zod middleware.

## 3. Endpoints Added

- `POST /api/v1/customers/:customerId/debts`
- `GET /api/v1/customers/:customerId/debts`
- `GET /api/v1/debts/:debtId`
- `GET /api/v1/debts/:debtId/payments`
- `POST /api/v1/debts/:debtId/payments`
- `POST /api/v1/debts/:debtId/cancel`

No `PUT /api/v1/debts/:id` or `DELETE /api/v1/debts/:id` route was added.

## 4. Validators Added

Added `debts.validator.ts` for:

- customer/debt params
- create debt body
- list debts query
- create payment body
- cancel debt body

Validators are strict and reject unknown financial fields.

## 5. Repository Added

Added `DebtsRepository`.

Responsibilities:

- load active customers
- create and fetch debts
- list customer debts
- create payments
- create debt allocations
- update debt status
- cancel debt
- find payment by idempotency key

## 6. Service Added

Added `DebtsService`.

Responsibilities:

- customer existence enforcement
- money/date parsing
- view model serialization
- balance/status calculation
- transaction-safe payment recording
- overpayment prevention
- idempotency replay/conflict handling
- cancellation policy

## 7. Controller Added

Added `DebtsController`.

Controllers do not perform financial calculations.

## 8. Routes Added

Added `debts.routes.ts` and registered it in `backend/src/app.ts`.

Read routes require auth. Mutation routes use Phase 3 `requireFinancialAdmin`.

## 9. Payment Transaction Flow

Payment creation uses `runFinancialTransaction`:

1. Load debt and allocations inside the transaction.
2. Check idempotency.
3. Reject cancelled or paid debts.
4. Calculate remaining balance.
5. Use Phase 3 debt allocation planner.
6. Create `Payment`.
7. Create `PaymentAllocation`.
8. Recalculate and store status.
9. Return complete debt view.

## 10. Overpayment Protection

Overpayment is rejected with `OverpaymentError` and HTTP `409`.

The remaining balance is calculated inside the serializable transaction, not only before entering it.

## 11. Idempotency Behavior

Same key and same logical payment returns existing debt result without creating another payment.

Same key with different logical request returns `409`.

Because there is no fingerprint column, Phase 4 compares persisted logical fields from the existing payment and allocation.

## 12. Status Behavior

Debt status uses Phase 3 `determineDebtStatus`.

Read responses return calculated `status` and stored `storedStatus`. Reads do not write stale status updates. Payment/cancel mutations reconcile stored status.

## 13. Cancellation Policy

Cancellation is allowed only when no valid non-voided payments exist.

Debt rows are preserved. Existing payment/allocation history is preserved. Cancelled debts reject new payments.

## 14. Authorization Behavior

Admin required:

- create debt
- record payment
- cancel debt

Authenticated read allowed:

- list customer debts
- get debt
- list payments

## 15. Tests Added

Added:

- `debts.validator.test.ts`
- `debts.service.test.ts`
- `debts.routes.test.ts`
- `debts-db.integration.test.ts`

Focused debt suite:

- 3 passed, 1 skipped by default
- 16 passed, 1 skipped by default

Opt-in isolated DB suite:

- 1 passed against `homeconnect_phase4_test`

## 16. Commands Run

Baseline:

- `git status --short`
- `npm run typecheck`
- `npm run test`
- `npm run prisma:validate`

Focused:

- `npx vitest run backend/src/features/financial/debts`
- `npx prisma migrate deploy --schema backend/prisma/schema.prisma` against `homeconnect_phase4_test`
- `RUN_PHASE4_DEBT_DB_TESTS=1` debt DB integration test against `homeconnect_phase4_test`

Final verification commands are recorded after final verification completes.

## 17. Verification Results

Intermediate verified:

- backend typecheck passed
- focused debt tests passed
- isolated DB debt integration passed

Final full verification is recorded in the final assistant response.

## 18. Files Changed

Phase 4 added:

- `backend/src/features/financial/debts/debts.controller.ts`
- `backend/src/features/financial/debts/debts.repository.ts`
- `backend/src/features/financial/debts/debts.routes.ts`
- `backend/src/features/financial/debts/debts.service.ts`
- `backend/src/features/financial/debts/debts.validator.ts`
- `backend/src/features/financial/debts/debts.validator.test.ts`
- `backend/src/features/financial/debts/debts.service.test.ts`
- `backend/src/features/financial/debts/debts.routes.test.ts`
- `backend/src/features/financial/debts/debts-db.integration.test.ts`
- `docs/PHASE_4_SINGLE_DEBT_BACKEND_DESIGN.md`
- `docs/PHASE_4_SINGLE_DEBT_API.md`
- `docs/PHASE_4_SINGLE_DEBT_BACKEND_RESULT.md`

Phase 4 modified:

- `backend/src/app.ts`
- `backend/src/middleware/validate.middleware.ts`

## 19. Pre-Existing Dirty-Worktree Caveat

The worktree was dirty before Phase 4. Existing modified/untracked files from earlier phases and user work are not Phase 4 changes.

## 20. Remaining Risks

- Existing lint warnings remain outside the new debt module.
- Legacy `Transaction` routes remain mutable by design until a later phase.
- No idempotency fingerprint column exists, so Phase 4 uses persisted logical field comparison.
- Full concurrent overpayment protection depends on PostgreSQL serializable isolation and retry behavior.

## 21. Phase 5 Entry Requirements

Phase 5 installment APIs should:

1. Reuse Phase 3 schedule, money, date, balance, status, allocation, transaction, and idempotency helpers.
2. Follow the Phase 4 controller/service/repository route pattern.
3. Keep installment payment creation transactional.
4. Preserve immutable payment/allocation history.
5. Avoid frontend implementation until the backend contract is verified.
