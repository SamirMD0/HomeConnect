# Phase 10 Monthly Financial Reports Result

Date: 2026-07-24

## Completed

Implemented monthly financial reports with historical month-end debt snapshots as the primary report.

The Reports page now supports:

- Monthly Customer Debt Snapshot
- Monthly Financial Activity
- strict month selector
- customer search
- overdue-only filter
- include cancelled and zero-balance toggles
- backend-authoritative summary totals
- print view
- CSV export
- open customer profile action

No edit/delete financial actions were added to reports.

## Endpoints Added

```http
GET /api/v1/reports/monthly-debts
GET /api/v1/reports/monthly-debts/export.csv
GET /api/v1/reports/monthly-financial-activity
```

All endpoints are authenticated and admin-only.

## Historical Policy

The monthly debt report is a cutoff snapshot, not current balance.

For `2026-07`, the cutoff is `2026-07-31`. Obligations created on or before the cutoff are included, valid payments through the cutoff reduce balances, and later payments do not affect the July snapshot.

Installment plans contribute full remaining contract balance. `amountDueByCutoff` is exposed separately for installments due by month end.

## Files Added

- `backend/src/features/reports/monthly-debts/monthly-debts.types.ts`
- `backend/src/features/reports/monthly-debts/monthly-debts.validator.ts`
- `backend/src/features/reports/monthly-debts/monthly-debts.repository.ts`
- `backend/src/features/reports/monthly-debts/monthly-debts.service.ts`
- `backend/src/features/reports/monthly-debts/monthly-debts.controller.ts`
- `backend/src/features/reports/monthly-debts/monthly-debts.routes.ts`
- `backend/src/features/reports/monthly-debts/monthly-debts.service.test.ts`
- `backend/src/features/reports/monthly-debts/monthly-debts.routes.test.ts`
- `frontend/src/features/reports/api/monthly-reports.api.ts`
- `frontend/src/features/reports/api/monthly-reports.api.test.ts`
- `frontend/src/features/reports/hooks/useMonthlyReports.ts`
- `frontend/src/features/reports/types/monthly-reports.types.ts`
- `frontend/src/features/reports/utils/report-query.ts`
- `frontend/src/features/reports/components/MonthlyDebtReportFilters.tsx`
- `frontend/src/features/reports/components/MonthlyDebtReportTable.tsx`
- `frontend/src/features/reports/components/MonthlyActivityReportTable.tsx`
- `frontend/src/features/reports/components/ReportSummaryCards.tsx`
- `frontend/src/features/reports/components/ReportStates.tsx`
- `frontend/src/features/reports/components/monthly-reports.components.test.tsx`
- `frontend/src/pages/ReportsPage.tsx`
- `docs/phases/phase-10/PHASE_10_MONTHLY_FINANCIAL_REPORTS_DESIGN.md`
- `docs/phases/phase-10/PHASE_10_MONTHLY_FINANCIAL_REPORTS_API.md`
- `docs/phases/phase-10/PHASE_10_MONTHLY_FINANCIAL_REPORTS_RESULT.md`

## Files Modified

- `backend/src/app.ts`
- `frontend/src/App.tsx`

## Verification

Focused verification completed:

```text
npx vitest run backend/src/features/reports/monthly-debts
npx vitest run frontend/src/features/reports frontend/src/pages/ReportsPage.tsx
npm run typecheck
npx eslint backend/src/features/reports frontend/src/features/reports frontend/src/pages/ReportsPage.tsx backend/src/app.ts
```

Final full verification completed:

```text
npm run lint
npm run typecheck
npm run test
npm run build
npm run prisma:validate
```

Result:

```text
lint passed, 0 errors and 56 existing warnings
typecheck passed
test passed, 35 files passed | 4 skipped, 158 tests passed | 4 skipped
build passed with the existing large frontend chunk warning
prisma validation passed
```

## Known Limits

CSV export is implemented. Native Excel export is not implemented because no Excel dependency is currently needed.

PDF export is not implemented. Use browser Print -> Save as PDF.

Automated browser smoke may remain blocked in this local environment by the headless browser/CDP issue observed in prior phases.
