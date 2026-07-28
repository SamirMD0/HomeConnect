# Phase 3 Financial Foundation Design

Date: 2026-07-24

## 1. Current Backend Architecture Summary

The backend is an Express API under `backend/src` with static controller, service, and repository classes. Routes use middleware for authentication, role checks, request validation, logging, and central error handling.

The API response envelope is:

```json
{
  "success": true,
  "data": {},
  "meta": { "timestamp": "..." }
}
```

Errors flow through `AppError` in `backend/src/lib/errors.ts` and `backend/src/middleware/error.middleware.ts`.

Prisma is initialized in `backend/src/lib/prisma.ts`. Existing repositories use `prisma.$transaction` directly. The project uses strict TypeScript for backend code and Vitest for tests.

Phase 2 added the financial database models beside the legacy `Transaction` model. The original local `homeconnect` database has now been baselined and the Phase 2 migration has been applied.

## 2. Financial Utility Boundaries

Phase 3 will add shared domain logic only. It will not add debt, installment plan, or payment endpoints.

The financial module will live under:

```text
backend/src/features/financial/
  domain/
  infrastructure/
  authorization/
  index.ts
```

Domain files must be pure wherever possible. Infrastructure files may reference Prisma. Authorization files may reference role middleware and Prisma role constants.

## 3. Money Strategy

All financial calculations use Prisma Decimal-compatible arithmetic through `Decimal` from `@prisma/client/runtime/library`.

Rules:

- Accept validated strings or Decimal-like values.
- Reject invalid strings, negatives, zero where positive money is required, and values with more than 2 decimal places.
- Do not use JavaScript floating-point arithmetic for financial calculations.
- Do not use `Number(amount)`, `parseFloat`, or `toFixed` as calculation truth.
- Keep helpers returning Decimal values until API serialization.

Precision policy follows the schema: `DECIMAL(12,2)`, maximum absolute value `9999999999.99`.

## 4. API Money Representation Strategy

Future APIs must return money as strings, for example:

```json
"600.00"
```

They must not return money as JSON numbers. `moneyToApiString` is the only serialization helper for financial API amounts.

## 5. Date-Only Strategy

Financial business dates are strict `YYYY-MM-DD` values.

The date-only module will:

- Parse strict date-only strings.
- Reject impossible dates such as `2026-02-30`.
- Store PostgreSQL `DATE` values through Prisma `DateTime @db.Date`.
- Convert to Prisma dates using UTC midnight as a stable transport representation.
- Convert Prisma date values back using UTC year, month, and day.

The code must not rely on `new Date("YYYY-MM-DD")` without the explicit UTC transport strategy.

## 6. Business Timezone Strategy

The business timezone is configured by `BUSINESS_TIMEZONE`, defaulting to `Asia/Beirut` only when the environment does not set it.

`todayInBusinessTimezone` derives the current business calendar date using `Intl.DateTimeFormat` with the configured timezone. Current-clock behavior must be injectable for tests.

No new timezone dependency is needed in Phase 3 because the required current-date behavior is covered by standard `Intl`, and date-only arithmetic is implemented with explicit calendar math.

## 7. Monthly Schedule-Generation Policy

Initial supported frequency is `MONTHLY`.

The first installment is due on the start date. Each following installment adds one calendar month from the original start date anchor.

For `2026-08-01` with count `6`, generated dates are:

- `2026-08-01`
- `2026-09-01`
- `2026-10-01`
- `2026-11-01`
- `2026-12-01`
- `2027-01-01`

## 8. Month-End Behavior

The original day of month is preserved independently for every generated installment.

If a target month does not contain that day, the final valid day of the target month is used.

Examples:

- `2026-01-31` -> `2026-02-28` -> `2026-03-31` -> `2026-04-30`
- `2028-01-31` -> `2028-02-29`

The implementation must not use naive `Date.setMonth` behavior that loses the original anchor day after February.

## 9. Rounding Policy

Installment amounts are split at cent precision.

Rules:

- Each installment amount must be positive.
- The first `count - 1` installments receive the floor-cent base amount.
- The final installment absorbs the remaining cents.
- The exact sum must equal the total amount.
- If the total has fewer cents than the installment count, reject the schedule because positive cent-level installments are impossible.

Example:

- `100.00 / 3` -> `33.33`, `33.33`, `33.34`

## 10. Debt Status Rules

Primary status priority:

1. `CANCELLED` if cancelled.
2. `PAID` if remaining balance is zero.
3. `OVERDUE` if remaining balance is positive and due date is before the business date.
4. `PARTIALLY_PAID` if paid amount is positive and remaining balance is positive.
5. `UNPAID` otherwise.

Overdue outranks partially paid because it is the most important operational state.

## 11. Installment Status Rules

Primary status priority:

1. `CANCELLED` if cancelled.
2. `PAID` if remaining amount is zero.
3. `OVERDUE` if remaining amount is positive and due date is before the business date.
4. `PARTIALLY_PAID` if paid amount is positive and remaining amount is positive.
5. `PENDING` otherwise.

## 12. Installment-Plan Status Rules

Primary status priority:

1. `CANCELLED` if cancelled.
2. `COMPLETED` if every active installment is fully paid.
3. `OVERDUE` if one or more active installments are overdue.
4. `ACTIVE` otherwise.

Cancelled installments are excluded from completion and overdue calculations.

## 13. Payment Allocation Policy

Installment plan payments allocate to the oldest unpaid or partially paid active installment first.

Ordering:

1. Due date ascending.
2. Installment number ascending.

Rules:

- Skip paid installments.
- Skip cancelled installments.
- Never allocate more than an installment remaining amount.
- Reject zero or negative payments.
- Reject payments greater than plan remaining balance.
- Return allocations whose exact sum equals the payment amount.

Debt allocation is simpler:

- One debt target.
- Payment must be positive.
- Payment cannot exceed remaining debt balance.
- Allocation equals payment amount.

The allocation planner returns instructions only. It does not write database rows.

## 14. Idempotency Policy

Future financial mutations may accept an optional idempotency key.

Rules:

- Keys are trimmed and normalized.
- Empty keys are treated as absent.
- Valid keys are limited to a safe ASCII set and length.
- A repeated key with the same logical request should return the existing result.
- A repeated key with different logical data must be rejected with conflict.

The Phase 2 `Payment.idempotencyKey` column is globally unique when present. Future services must compare a stable normalized request fingerprint before reusing an existing payment result.

## 15. Transaction Isolation Strategy

Future financial persistence operations should use Prisma interactive transactions.

For payment creation and allocation:

- Read target obligation and prior allocations in a transaction.
- Calculate remaining balance.
- Reject overpayment before writing.
- Insert `Payment` and `PaymentAllocation` rows in the same transaction.
- Update statuses in the same transaction.

The recommended isolation level for payment creation is `Serializable`, with limited retry on serialization conflicts. This protects against concurrent overpayment and duplicate-payment races better than default isolation.

Phase 3 may provide a reusable retry helper, but it must not hide Prisma or implement fragile custom locking.

## 16. Financial Immutability Rules

Shared policy:

- Debt records are not generally edited after payments exist.
- Installment schedules are not silently regenerated.
- Payments are never deleted.
- Payment allocations are never edited.
- Corrections use cancellation or voiding.
- Voiding requires reason, user, and timestamp.
- Cancelling requires reason, user, and timestamp.

Phase 3 will expose reusable assertion helpers for future services.

## 17. Error Taxonomy

Financial errors will extend `AppError` and reuse the central error handler.

Planned errors:

- `InvalidMoneyError` -> 400
- `InvalidBusinessDateError` -> 400
- `InvalidInstallmentCountError` -> 400
- `InstallmentScheduleError` -> 400
- `OverpaymentError` -> 409
- `FinancialRecordCancelledError` -> 409
- `FinancialRecordAlreadyPaidError` -> 409
- `PaymentIdempotencyConflictError` -> 409
- `FinancialInvariantError` -> 500

Client-facing messages must not expose database internals.

## 18. Authorization Strategy

The financial mutation flow is admin-managed.

Financial mutation actions require `ADMIN`:

- create debt
- create installment plan
- record payment
- cancel debt
- cancel installment plan
- void payment

Phase 3 will provide a reusable policy helper and middleware export instead of duplicating role checks in future routes.

## 19. Proposed Files

```text
backend/src/features/financial/
  authorization/
    financial-policy.ts
  domain/
    balances.ts
    business-date.ts
    financial-errors.ts
    financial-types.ts
    immutable-policy.ts
    installment-schedule.ts
    money.ts
    payment-allocation.ts
    statuses.ts
  infrastructure/
    idempotency.ts
    transaction.ts
  index.ts

backend/src/features/financial/**/*.test.ts
backend/src/features/financial/infrastructure/*.test.ts
docs/phases/phase-03/PHASE_3_FINANCIAL_FOUNDATION_RESULT.md
```

`backend/.env.example` will be updated with `BUSINESS_TIMEZONE`.

## 20. Test Matrix

Money:

- decimal precision
- string and Decimal input
- invalid input
- negative and zero rejection
- too many decimal places
- comparison
- API formatting

Business dates:

- strict validation
- invalid dates
- leap year
- February
- year rollover
- timezone boundary
- Beirut current-date behavior
- Prisma `DATE` round trip

Schedule generation:

- first due date equals start date
- six monthly installments
- month boundaries
- leap year
- year rollover
- exact sum equality
- final installment absorbs rounding
- impossible positive-cent split rejection

Balances:

- unpaid
- partial
- full
- voided allocation exclusion
- cancelled obligation behavior
- plan summaries

Statuses:

- all debt states
- all installment states
- all plan states
- overdue priority over partially paid

Allocation:

- one installment
- multiple installments
- partial payment
- full payment
- overpayment rejection
- paid and cancelled installments skipped
- same due date tie-breaker
- decimal-sensitive values

Idempotency:

- valid key
- invalid key
- empty key normalization
- request fingerprint stability
- same-key same-request contract
- same-key different-request conflict

Transaction retry:

- serialization retry
- max retry limit
- non-retryable error passthrough

Database integration:

- Decimal round trip through Prisma
- PostgreSQL `DATE` round trip without day shift
- payment allocation XOR constraint
- positive money constraints
