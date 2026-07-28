# Phase 8 Financial Mutations Frontend Design

Date: 2026-07-24

## Scope

Phase 8 adds admin-only financial mutation workflows to the existing Phase 7 customer financial profile. It consumes the existing Phase 4 and Phase 5 backend APIs and does not add backend schema, migration, or financial-domain behavior.

## Mutation Flows

All mutation entry points are owned by `CustomerFinancialProfile`.

- `Add financial obligation` opens one dialog with a type selector.
- `Single debt` submits `POST /api/v1/customers/:customerId/debts`.
- `Installment plan` submits `POST /api/v1/customers/:customerId/installment-plans`.
- Debt row/detail actions submit debt payment or cancellation endpoints.
- Plan row/detail actions submit plan payment or cancellation endpoints.
- Successful mutations close the active dialog and invalidate the current customer financial-summary query prefix.
- Payment/cancellation mutations also invalidate the open debt or plan detail query.

## Component Structure

New Phase 8 components live inside `frontend/src/features/customer-financial/components`.

- `AddFinancialObligationDialog`
- `FinancialObligationTypeStep`
- `CreateDebtForm`
- `CreateInstallmentPlanForm`
- `InstallmentSchedulePreview`
- `RecordDebtPaymentDialog`
- `CancelDebtDialog`
- `RecordPlanPaymentDialog`
- `CancelInstallmentPlanDialog`

Existing Phase 7 list/detail components remain read-capable and receive optional mutation props.

## Authorization

The UI uses `isFinancialAdmin()` from `utils/financial-auth.ts` so role checks are centralized. Non-admin users do not see mutation actions and keep read-only access to the financial profile. Backend authorization remains authoritative; unexpected `403` mutation responses are normalized to an admin-permission message.

## Validation

Forms use React Hook Form and Zod, matching existing app conventions.

- Money inputs remain strings.
- Money validation uses BigInt cents helpers, not floating point.
- Dates use strict `YYYY-MM-DD`.
- Customer name and phone are display-only context and are never included in mutation payloads.
- Optional text fields are trimmed and submitted as `null` when empty.
- Server validation and conflict messages stay visible without clearing form state.

## Idempotency

Payment dialogs generate a client idempotency key when the dialog mounts. The key is reused across failed retry attempts and regenerated only after a successful payment.

## Schedule Preview

Installment schedule preview is a frontend port of the Phase 3 pure scheduling policy:

- first installment due on the start date
- monthly due dates
- original anchor day preserved
- month-end clamped to the valid final day
- final installment absorbs rounding difference
- preview total equals the requested plan total

The preview is not submitted to the backend. Backend creation remains authoritative.

## Test Matrix

Focused tests cover:

- money input validation and cent comparison
- schedule preview rounding, January 31 clamping, leap-year behavior, and invalid inputs
- mutation API request body shape
- no customer name or phone in create requests
- one plan-payment request for backend allocation
- scoped summary invalidation query key
- admin-only action rendering
- paid/completed/cancelled action hiding
- Phase 7 read-only component regressions
