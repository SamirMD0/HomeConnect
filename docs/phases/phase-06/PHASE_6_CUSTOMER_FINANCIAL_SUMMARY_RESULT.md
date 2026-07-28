# Phase 6 Customer Financial Summary Result

Date: 2026-07-24

## Completed

Implemented the unified backend financial summary endpoint:

```http
GET /api/v1/customers/:customerId/financial-summary
```

Added:

- customer financial-summary validator
- repository/query layer
- service aggregation layer
- controller
- route registration
- focused unit and route tests
- opt-in isolated DB integration test
- API, design, and result documentation

## Behavior

The endpoint returns one authoritative customer financial profile containing:

- customer details
- debt outstanding total
- installment-plan outstanding total
- combined outstanding total
- unique non-voided payment total
- active debt and plan counters
- overdue debt and installment counters
- compact debt items
- compact installment-plan items
- normalized overdue items
- normalized next due item with same-date aggregation
- unique recent payments with allocations

Cancelled obligations are excluded by default and can be included in returned lists with `includeCancelled=true`. They are still excluded from outstanding totals, overdue items, and next due.

Inactive customers remain readable when they are not soft-deleted. Soft-deleted or missing customers return `404`.

## Files Added

- `backend/src/features/financial/customer-summary/customer-financial-summary.validator.ts`
- `backend/src/features/financial/customer-summary/customer-financial-summary.repository.ts`
- `backend/src/features/financial/customer-summary/customer-financial-summary.service.ts`
- `backend/src/features/financial/customer-summary/customer-financial-summary.controller.ts`
- `backend/src/features/financial/customer-summary/customer-financial-summary.routes.ts`
- `backend/src/features/financial/customer-summary/customer-financial-summary.validator.test.ts`
- `backend/src/features/financial/customer-summary/customer-financial-summary.service.test.ts`
- `backend/src/features/financial/customer-summary/customer-financial-summary.routes.test.ts`
- `backend/src/features/financial/customer-summary/customer-financial-summary-db.integration.test.ts`
- `docs/phases/phase-06/PHASE_6_CUSTOMER_FINANCIAL_SUMMARY_DESIGN.md`
- `docs/phases/phase-06/PHASE_6_CUSTOMER_FINANCIAL_SUMMARY_API.md`
- `docs/phases/phase-06/PHASE_6_CUSTOMER_FINANCIAL_SUMMARY_RESULT.md`

## Files Modified

- `backend/src/app.ts`

## Verification

Focused verification:

```text
npx vitest run backend/src/features/financial/customer-summary
```

Result:

```text
3 passed | 1 skipped
12 passed | 1 skipped
```

The skipped test is the opt-in isolated database integration test. It requires `RUN_PHASE6_CUSTOMER_SUMMARY_DB_TESTS=1` and a database name containing `phase6`.

Isolated DB verification:

```text
npx vitest run backend/src/features/financial/customer-summary/customer-financial-summary-db.integration.test.ts
```

Result:

```text
1 passed
```

Manual API smoke on isolated database:

```text
GET /api/v1/customers/:customerId/financial-summary
```

Verified:

```text
singleDebtOutstanding=400.00
installmentPlanOutstanding=450.00
totalOutstanding=850.00
totalPaid=350.00
recentPayments=2
nextDueDate=2026-08-10
nextDueAmount=400.00
```

Final full verification:

```text
npm run lint              passed, 0 errors, 69 existing warnings
npm run typecheck         passed
npm run test              passed, 19 passed | 4 skipped, 94 passed | 4 skipped
npm run build             passed, existing frontend chunk-size warning
npm run prisma:validate   passed
```

## Notes

No Prisma schema change, migration, frontend work, payment voiding, or legacy `Transaction` change was introduced in this phase.
