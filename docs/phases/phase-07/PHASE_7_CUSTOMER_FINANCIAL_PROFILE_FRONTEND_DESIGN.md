# Phase 7 Customer Financial Profile Frontend Design

Date: 2026-07-24

## Page Structure

`CustomerProfilePage` keeps the existing customer header, contact details, customer edit action, and delete action.

The new primary financial area is rendered by `CustomerFinancialProfile` and consumes:

```http
GET /api/v1/customers/:customerId/financial-summary
```

Profile sections:

- summary cards
- Overview
- Debts
- Installment Plans
- Payments
- Overdue
- Legacy Ledger

The profile does not add debt, installment, payment, or cancellation mutation forms.

## Component Structure

Added feature folder:

```text
frontend/src/features/customer-financial/
  api/
  hooks/
  types/
  components/
  utils/
```

Main components:

- `CustomerFinancialProfile`
- `FinancialSummaryCards`
- `NextDueCard`
- `OverdueItemsList`
- `CustomerDebtsList`
- `InstallmentPlansList`
- `RecentPaymentsList`
- `DebtDetails`
- `InstallmentPlanDetails`
- `FinancialStatusBadge`
- `FinancialEmptyState`
- `FinancialErrorState`
- `FinancialLoadingState`

## Query Strategy

`useCustomerFinancialSummary(customerId, options)` uses TanStack Query with:

- stable query key
- customer ID in the key
- `includeCancelled` in the key
- default `includePayments=true`
- disabled query when customer ID is missing
- no browser-side financial aggregation

Debt and installment-plan details are fetched only when a read-only detail modal is opened.

## Status Display Strategy

Status labels and badge styles are centralized in:

```text
frontend/src/features/customer-financial/utils/financial-labels.ts
```

Money strings are displayed through `formatMoney`, which preserves API cents and uses the existing project convention of `$` display. This phase does not introduce a currency setting.

Business dates are displayed from `YYYY-MM-DD` strings without recalculating financial status.

## Legacy Coexistence

The legacy transaction ledger remains available in a clearly labeled `Legacy Ledger` tab.

Legacy transaction values are not merged into the new financial summary totals. Existing legacy routes and data are not removed.

## Test Matrix

Focused tests cover:

- financial-summary endpoint path and options
- API error propagation
- stable query key and missing-ID disable helper
- summary card values from API
- next-due items and empty state
- overdue debt/installment rendering in API order
- debt statuses, cancellation display, and empty state
- plan counts, status, next due, and empty state
- recent payment uniqueness with multiple allocations
- voided payment display
- read-only debt detail and installment schedule rendering
- profile loading, success, and 404 error states
