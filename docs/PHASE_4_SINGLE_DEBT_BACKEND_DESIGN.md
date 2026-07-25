# Phase 4 Single Debt Backend Design

Date: 2026-07-24

## 1. Current Backend Architecture

The backend is an Express API with static controllers, services, and repositories. Validation uses Zod through `validate.middleware.ts`. Authentication uses `requireAuth`, role authorization uses `requireRole`, and errors flow through `AppError` into the central error handler.

Phase 3 added the financial foundation under `backend/src/features/financial`. Phase 4 will add single-debt backend APIs in that feature area while keeping legacy `Transaction` routes unchanged.

Baseline before edits:

- `git status --short`: dirty worktree with pre-existing Phase 1/2/3 and user changes.
- `npm run typecheck`: passed.
- `npm run test`: passed, 51 tests passed and 1 opt-in DB integration skipped.
- `npm run prisma:validate`: passed.

## 2. Debt Creation Flow

`POST /api/v1/customers/:customerId/debts`

Flow:

1. Auth middleware requires a valid token.
2. Financial admin middleware requires `ADMIN`.
3. Validator accepts only `amount`, `description`, `dueDate`, and optional `notes`.
4. Service verifies the customer exists and is active/not deleted.
5. Service parses money and business date through Phase 3 helpers.
6. Repository creates one `Debt` row.
7. Service returns a debt view model with string money amounts and calculated status.

The endpoint never creates customers and never accepts `status`, `createdById`, balances, customer name, or customer phone from the body.

## 3. Debt Read Flow

Read routes require authentication. Authenticated employees may read under the current business policy; mutation routes require admin.

`GET /api/v1/debts/:debtId` returns:

- debt details
- customer summary
- original amount
- valid total paid
- remaining balance
- calculated status
- stored status
- due date
- cancellation metadata
- payment history
- created-by information

Reads calculate status from current date and payments. If stored status differs from calculated status, reads return both and do not write during read. Payment and cancellation mutations reconcile stored status.

## 4. Debt Payment Flow

`POST /api/v1/debts/:debtId/payments`

Flow inside a serializable transaction:

1. Load debt with customer, creator, and payment allocations.
2. Reject missing, cancelled, or fully paid debt.
3. Calculate valid paid total and remaining balance.
4. Check idempotency key if provided.
5. Use Phase 3 debt allocation planner.
6. Create one `Payment`.
7. Create one `PaymentAllocation` targeting the debt only.
8. Recalculate status.
9. Update stored debt status.
10. Return the complete debt view with immutable payment history.

## 5. Payment-Allocation Flow

Debt payments always create exactly one allocation:

- `debtId` set
- `installmentId` null
- allocation amount equals `Payment.totalAmount`

The service uses `planDebtPaymentAllocation` before persistence. Database XOR and positive amount constraints remain the final integrity backstop.

## 6. Status-Calculation Flow

Phase 4 uses `determineDebtStatus`.

Priority:

1. `CANCELLED`
2. `PAID`
3. `OVERDUE`
4. `PARTIALLY_PAID`
5. `UNPAID`

Overdue outranks partial payment.

## 7. Cancellation Flow

`POST /api/v1/debts/:debtId/cancel`

Policy:

- Cancellation is allowed only when the debt has no valid non-voided payments.
- Debts with payments require a later reversal/refund/void workflow.
- Fully paid debts cannot be cancelled.
- Cancelled debts remain in the database.
- Payment history remains visible.
- Future payments against cancelled debts are rejected.

Service uses Phase 3 immutability assertions.

## 8. Idempotency Flow

`Payment.idempotencyKey` is globally unique when present.

Behavior:

- No key: request proceeds with normal transaction and overpayment checks.
- Same key, same logical request: return the existing payment/debt result.
- Same key, different logical request: return 409.

Because Phase 2 did not add a fingerprint column, Phase 4 computes fingerprints from persisted payment fields:

- debt ID
- amount
- payment date
- payment method
- idempotency key
- createdById

Reference and notes are not part of conflict detection because they are non-financial annotations and are not represented in Phase 3's required conflict list.

## 9. Authorization Policy

Mutation routes require `ADMIN` through `requireFinancialAdmin`:

- create debt
- record debt payment
- cancel debt

Read routes require authentication only:

- list customer debts
- get debt details
- list debt payments

## 10. Database Transaction Boundaries

Debt creation uses a normal repository write because it creates a single obligation after service validation.

Payment creation uses `runFinancialTransaction`, which applies Prisma interactive transactions with serializable isolation and retry on serialization conflicts.

Cancellation uses `runFinancialTransaction` to atomically verify no valid payments and update cancellation metadata/status.

## 11. Error Mapping

- Customer not found: 404
- Debt not found: 404
- Invalid money/date/body: 400
- Debt cancelled: 409
- Debt already paid: 409
- Overpayment: 409
- Idempotency conflict: 409
- Unauthenticated: 401
- Forbidden: 403
- Invariant failure: 500

Errors use existing `AppError` infrastructure and financial domain errors.

## 12. API Contracts

Create debt:

```http
POST /api/v1/customers/:customerId/debts
```

```json
{
  "amount": "600.00",
  "description": "Refrigerator",
  "dueDate": "2026-08-10",
  "notes": "Optional"
}
```

List customer debts:

```http
GET /api/v1/customers/:customerId/debts?page=1&limit=10&status=UNPAID&sortBy=dueDate&sortOrder=asc
```

Get debt:

```http
GET /api/v1/debts/:debtId
```

Record payment:

```http
POST /api/v1/debts/:debtId/payments
```

```json
{
  "amount": "200.00",
  "paymentDate": "2026-07-24",
  "paymentMethod": "CASH",
  "reference": "optional",
  "notes": "optional",
  "idempotencyKey": "optional-key-123"
}
```

Cancel debt:

```http
POST /api/v1/debts/:debtId/cancel
```

```json
{
  "reason": "Customer returned the product"
}
```

Optional payments list:

```http
GET /api/v1/debts/:debtId/payments
```

## 13. Validation Contracts

Dedicated validators will cover:

- customer/debt UUID params
- create debt body
- debt list query
- payment body
- cancel body

Objects will be strict to reject unknown financial fields such as `status`, `createdById`, or balances.

## 14. Repository Responsibilities

Debt repository owns Prisma access only:

- find active customer
- create debt
- find debt by ID
- list debts by customer
- count debts by customer
- load debt allocations/payments
- find payment by idempotency key
- create payment
- create payment allocation
- update debt status
- cancel debt

No business decisions live in the repository.

## 15. Service Responsibilities

Debt service owns:

- business validation
- customer existence enforcement
- view-model construction
- money/date parsing and serialization
- balance calculation
- status calculation
- payment transaction orchestration
- overpayment prevention
- idempotency comparison
- cancellation policy

## 16. Controller Responsibilities

Controllers:

- read validated params/body/query
- call service
- return existing API envelope
- pass errors to central middleware

Controllers do not calculate money, balances, statuses, or allocations.

## 17. Test Matrix

Create debt:

- admin creates debt
- customer must exist
- inactive/deleted customer rejected
- invalid amount/date/description rejected
- unknown fields rejected
- employee forbidden
- unauthenticated rejected

Read:

- list customer debts
- pagination
- status filter
- debt detail totals
- payment history included
- amounts are strings
- dates are `YYYY-MM-DD`
- missing customer/debt returns 404

Payment:

- partial payment
- full payment
- allocation targets debt only
- remaining balance/status correct
- overpayment rejected
- zero/negative/invalid payment rejected
- cancelled/paid debt rejected
- same-key same-request idempotency returns existing result
- same-key different-request returns 409
- concurrent payment simulation does not overpay

Overdue:

- future unpaid -> `UNPAID`
- future partial -> `PARTIALLY_PAID`
- overdue unpaid -> `OVERDUE`
- overdue partial -> `OVERDUE`
- fully paid -> `PAID`
- cancelled -> `CANCELLED`

Cancellation:

- eligible debt cancelled
- reason required
- actor/time/reason stored
- payment after cancellation rejected
- paid/partially paid cancellation rejected
- employee forbidden

## 18. Files Expected To Change

Expected Phase 4 files:

- `backend/src/app.ts`
- `backend/src/features/financial/debts/debts.controller.ts`
- `backend/src/features/financial/debts/debts.repository.ts`
- `backend/src/features/financial/debts/debts.routes.ts`
- `backend/src/features/financial/debts/debts.service.ts`
- `backend/src/features/financial/debts/debts.validator.ts`
- `backend/src/features/financial/debts/*.test.ts`
- `docs/PHASE_4_SINGLE_DEBT_BACKEND_DESIGN.md`
- `docs/PHASE_4_SINGLE_DEBT_API.md`
- `docs/PHASE_4_SINGLE_DEBT_BACKEND_RESULT.md`

No Prisma migration is expected.

## 19. Known Risks

- `Payment` has no idempotency fingerprint column, so Phase 4 compares persisted logical fields instead.
- Serializable isolation depends on PostgreSQL behavior and Prisma retry handling.
- Existing lint warnings remain outside the financial feature.
- Legacy `Transaction` routes still expose mutable financial-like records.
- Manual verification must avoid real business data.

## 20. Explicit Non-Goals

- No installment APIs.
- No frontend debt forms.
- No reports.
- No dashboard rewrite.
- No legacy transaction migration.
- No generic update/delete debt routes.
- No customer creation inside debt flow.
- No POS or inventory features.
