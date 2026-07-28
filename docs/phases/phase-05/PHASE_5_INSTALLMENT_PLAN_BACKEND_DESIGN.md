# Phase 5 Installment Plan Backend Design

Date: 2026-07-24

## Phase 5 Flow

Phase 5 adds backend-only installment plan APIs beside the completed single-debt APIs.

Flow:

1. Admin selects an existing active customer.
2. Admin creates an installment plan with total amount, start date, count, and `MONTHLY` frequency.
3. Service generates the exact schedule with the Phase 3 schedule generator.
4. Plan and installments are created in one transaction.
5. Authenticated users can list and view plans.
6. Admin records plan payments.
7. Payments allocate oldest-first by due date and installment number.
8. Installment statuses and plan status update in the same transaction.
9. Admin may cancel an eligible unpaid plan.

The endpoint never creates customers and never accepts client-provided schedules, balances, status, or creator IDs.

## Endpoints

Implemented routes:

- `POST /api/v1/customers/:customerId/installment-plans`
- `GET /api/v1/customers/:customerId/installment-plans`
- `GET /api/v1/installment-plans/:planId`
- `GET /api/v1/installment-plans/:planId/payments`
- `POST /api/v1/installment-plans/:planId/payments`
- `POST /api/v1/installment-plans/:planId/cancel`

No generic update or delete route is added.

## Transaction Boundaries

Plan creation uses `runFinancialTransaction`:

1. Validate customer exists and is active.
2. Generate schedule.
3. Create `InstallmentPlan`.
4. Create all `Installment` rows.
5. Read back the complete plan.

Payment creation uses `runFinancialTransaction`:

1. Load plan, installments, payments, and allocations.
2. Check idempotency.
3. Reject cancelled or completed plan.
4. Calculate remaining balances inside the transaction.
5. Plan oldest-first allocations.
6. Create one `Payment`.
7. Create one or more `PaymentAllocation` rows targeting installments only.
8. Update affected installment statuses and paid dates.
9. Update plan status.
10. Return the complete plan.

Cancellation uses `runFinancialTransaction`:

1. Load plan.
2. Reject missing/cancelled/completed plan.
3. Reject if valid payments exist.
4. Store cancellation metadata.
5. Cancel active unpaid/partially paid installments.
6. Return the complete plan.

## Payment Allocation Behavior

Allocation uses Phase 3 `planInstallmentPaymentAllocations`.

Rules:

- Allocate to oldest due installment first.
- Tie-break by installment number.
- Skip paid installments.
- Skip cancelled installments.
- Support partial allocation.
- Support one payment across multiple installments.
- Reject payment greater than plan remaining balance.
- Allocation sum must equal payment amount.
- Every allocation targets `installmentId`; `debtId` is null.

## Cancellation Policy

Use the conservative Phase 4 policy:

- Allow cancellation only when no valid non-voided payments exist.
- Preserve plan and schedule rows.
- Preserve payment history.
- Set `cancelledAt`, `cancelledById`, and `cancelReason`.
- Set plan status to `CANCELLED`.
- Set unpaid/partially paid active installments to `CANCELLED`.
- Paid installments remain historical `PAID`.
- Reject new payments after cancellation.

## Files Changed

Expected Phase 5 files:

- `backend/src/app.ts`
- `backend/src/features/financial/installment-plans/installment-plans.validator.ts`
- `backend/src/features/financial/installment-plans/installment-plans.repository.ts`
- `backend/src/features/financial/installment-plans/installment-plans.service.ts`
- `backend/src/features/financial/installment-plans/installment-plans.controller.ts`
- `backend/src/features/financial/installment-plans/installment-plans.routes.ts`
- focused Phase 5 tests under `backend/src/features/financial/installment-plans`
- `docs/phases/phase-05/PHASE_5_INSTALLMENT_PLAN_BACKEND_DESIGN.md`
- `docs/phases/phase-05/PHASE_5_INSTALLMENT_PLAN_API.md`
- `docs/phases/phase-05/PHASE_5_INSTALLMENT_PLAN_BACKEND_RESULT.md`

No Prisma schema or migration changes are expected.

## Tests

Focused tests cover:

- valid plan creation and exact schedule
- customer must exist
- invalid money/date/count/frequency rejection
- route auth/admin behavior
- plan list/detail view models
- partial payment
- payment across multiple installments
- oldest-first allocation
- paid/cancelled installment skipping
- overpayment rejection
- completed/cancelled plan payment rejection
- idempotent replay and conflict
- cancellation policy
- opt-in isolated database flow

Phase 4 debt tests should be run as regression coverage because Phase 5 reuses payment and financial helpers.
