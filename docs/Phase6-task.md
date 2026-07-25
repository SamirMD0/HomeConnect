# Phase 6 — Reports & Export

## Objective
Implement all reporting features (debt summary, customer statements, monthly reports, highest debt ranking) with PDF/Excel export and print functionality.

## 1. Backend Types & Validators
- [ ] Create `backend/src/types/reports.types.ts`
  - Define interfaces: `DebtSummaryRow`, `MonthlyDebtRow`, `MonthlyPaymentRow`, `CustomerStatementRow`, `MonthlySummaryRow`, `HighestDebtRow`
- [ ] Create `backend/src/validators/reports.validator.ts`
  - Zod schemas for query params: date range (`from`, `to`), `year`, `month`, `limit`, `customerId`

## 2. Backend Repository & Service
- [ ] Create `backend/src/repositories/reports.repository.ts`
  - `getCustomersWithDebt()` — all customers with positive balance (join transactions, GROUP BY, HAVING balance > 0)
  - `getCustomerStatement(customerId, from, to)` — transactions in date range with running balance
  - `getMonthlyDebt(year, month)` — SALE transactions aggregated by month
  - `getMonthlyPayments(year, month)` — PAYMENT transactions aggregated by month
  - `getHighestDebt(limit)` — top N customers ordered by balance DESC
  - `getMonthlySummary(year, month)` — customers with debt including name, phone, balance + footer totals
- [ ] Create `backend/src/services/reports.service.ts`
  - Orchestrate repository calls, format response data
  - Compute running balances for customer statements
  - Compute footer totals (total customers with debt, total outstanding)

## 3. Backend Export Service
- [ ] Create `backend/src/services/export.service.ts`
  - `generateExcel(reportType, data)` — use `xlsx` (SheetJS) to build `.xlsx` buffers
  - `generatePdf(reportType, data)` — use `jspdf` to build PDF buffers
  - Handle report-specific column layouts and formatting (currency, dates)
  - Professional header with business name and report title
  - Customer statement PDF: branded layout with header, transaction table, running balance, totals

## 4. Backend Routes & Controller
- [ ] Create `backend/src/controllers/reports.controller.ts`
  - Handler for each report endpoint + export endpoints
- [ ] Create `backend/src/routes/reports.routes.ts`
  - `GET /api/v1/reports/debt-summary`
  - `GET /api/v1/reports/monthly-debt?year=&month=`
  - `GET /api/v1/reports/monthly-payments?year=&month=`
  - `GET /api/v1/reports/highest-debt?limit=`
  - `GET /api/v1/reports/customer-statement/:id?from=&to=`
  - `GET /api/v1/reports/monthly-summary?year=&month=`
  - `GET /api/v1/export/excel?report=&...params`
  - `GET /api/v1/export/pdf?report=&...params`
- [ ] Mount routes in `app.ts` with `requireAuth` middleware

## 5. Frontend API & Hooks
- [ ] Create `frontend/src/features/reports/types.ts`
  - TypeScript interfaces mirroring backend report types
- [ ] Create `frontend/src/features/reports/api/reports.api.ts`
  - Axios calls for all report endpoints
  - Export download functions that trigger file download from `/export/excel` and `/export/pdf`
- [ ] Create `frontend/src/features/reports/hooks/useReports.ts`
  - `useDebtSummary()`, `useMonthlyDebt(year, month)`, `useMonthlyPayments(year, month)`
  - `useHighestDebt(limit)`, `useCustomerStatement(id, from, to)`, `useMonthlySummary(year, month)`
  - TanStack Query hooks with appropriate cache keys

## 6. Frontend Components
- [ ] `ReportFilters.tsx` — date range picker, month/year selector, limit input
- [ ] `ReportTable.tsx` — sortable data table for report data with column definitions
- [ ] `ExportButtons.tsx` — Excel, PDF, Print action buttons (triggers download / `window.print()`)
- [ ] `ReportSummaryFooter.tsx` — totals row displayed at the bottom of report tables
- [ ] `StatementHeader.tsx` — branded header for customer statement (business name, date range, customer info)

## 7. Frontend Pages
- [ ] `ReportsHubPage.tsx` — index page with cards/links to each report (`/reports`)
- [ ] `DebtReportPage.tsx` — customers with debt table (`/reports/debt`)
- [ ] `MonthlyDebtPage.tsx` — monthly debt report with month/year selector (`/reports/monthly-debt`)
- [ ] `MonthlyPaymentsPage.tsx` — monthly payment report (`/reports/monthly-payments`)
- [ ] `HighestDebtPage.tsx` — top debtors ranking (`/reports/highest-debt`)
- [ ] `CustomerStatementPage.tsx` — individual customer statement with date range filter (`/reports/statement/:id`)
- [ ] `MonthlySummaryPage.tsx` — monthly summary (name, phone, debt) with footer totals (`/reports/monthly-summary`)

## 8. Integration & Routing
- [ ] Update `App.tsx` to add report routes under the protected layout
  - `/reports` → `ReportsHubPage`
  - `/reports/debt` → `DebtReportPage`
  - `/reports/monthly-debt` → `MonthlyDebtPage`
  - `/reports/monthly-payments` → `MonthlyPaymentsPage`
  - `/reports/highest-debt` → `HighestDebtPage`
  - `/reports/statement/:id` → `CustomerStatementPage`
  - `/reports/monthly-summary` → `MonthlySummaryPage`
- [ ] Add "Reports" link to sidebar navigation
- [ ] Add "View Statement" button on `CustomerProfilePage` linking to `/reports/statement/:id`

## 9. Verification
- [ ] Debt summary report shows all customers with positive balance and correct amounts
- [ ] Customer statement shows correct running balance across SALE/PAYMENT/ADJUSTMENT
- [ ] Monthly debt and payment reports aggregate correctly by month
- [ ] Highest debt report orders correctly (descending)
- [ ] Monthly summary footer totals match (total customers with debt, total outstanding)
- [ ] Excel export generates a valid `.xlsx` file that opens in Excel
- [ ] PDF export generates a valid `.pdf` file
- [ ] Print button opens system print dialog
- [ ] Date range filters work on all applicable reports
- [ ] Reports handle empty data gracefully (empty state, not errors)
