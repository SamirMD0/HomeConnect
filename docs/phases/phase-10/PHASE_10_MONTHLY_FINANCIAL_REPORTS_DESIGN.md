# Phase 10 Monthly Financial Reports Design

Date: 2026-07-24

## Scope

Phase 10 adds focused financial reporting without changing the financial schema or legacy transaction data.

Implemented report modes:

- Monthly Customer Debt Snapshot
- Monthly Financial Activity

## Monthly Debt Definition

The primary report is a month-end outstanding snapshot.

For `month=YYYY-MM`, the report cutoff is the final business date of that month. For `2026-07`, the cutoff is `2026-07-31`.

The snapshot answers:

> How much did each customer still owe at the end of the selected month?

It does not use current balance alone. Later payments do not rewrite historical months.

## Date Policy

Month input is strict `YYYY-MM`.

The service converts the month into date-only business boundaries:

- `startDate`: first day of selected month
- `endDate`: final calendar day of selected month
- `nextDayAfterEnd`: timestamp boundary used for `createdAt`, `cancelledAt`, and `voidedAt`

The implementation uses the existing business date helpers and the repository's `@db.Date` convention.

## Snapshot Rules

Single debt contributes to snapshot outstanding when:

- it was created before the next day after cutoff
- it was not cancelled on or before cutoff
- original amount minus valid allocations through cutoff is greater than zero

Installment plan contributes its full remaining contract balance when:

- it was created before the next day after cutoff
- it was not cancelled on or before cutoff
- total plan amount minus valid installment allocations through cutoff is greater than zero

The report also exposes `amountDueByCutoff`, which is different from plan contract balance. It includes unpaid debt/installment amounts whose due date is on or before cutoff.

## Payment And Void Policy

Allocations count only when `Payment.paymentDate <= cutoff`.

A payment is valid at the cutoff when:

- `voidedAt` is null, or
- `voidedAt` is after the cutoff date

Because `voidedAt` is a timestamp and cutoff is date-only, the service compares `voidedAt` with the next day after cutoff. A payment voided before that boundary is treated as voided by cutoff.

Payment voiding is not exposed as a mutation yet, but the historical report logic is ready for it.

## Cancellation Policy

An obligation cancelled on or before cutoff does not contribute to active outstanding.

An obligation cancelled after cutoff was still active at the historical cutoff and is included.

The implementation uses `cancelledAt`, not the current stored status alone.

## Overdue Policy

The report follows the existing financial status rule:

- debt is overdue at cutoff when `dueDate < cutoff` and remaining is greater than zero
- installment is overdue at cutoff when installment `dueDate < cutoff` and remaining is greater than zero

Today's date is not used for historical overdue calculations.

## Activity Report

The monthly activity report answers:

> What obligations and payments happened during the selected month?

It returns:

- new single-debt amount
- new installment-plan amount
- valid payments received
- net financial change
- debts created count
- plans created count
- payments count
- affected customer count

Net financial change is:

`new obligations - valid payments during month`

This report is not an outstanding balance report.

## Authorization

Reports expose global financial customer data. Backend authorization is authoritative.

Phase 10 restricts report endpoints to `ADMIN` because no employee financial-report policy has been defined yet.

## Export Strategy

CSV export is implemented on the backend for complete report datasets. The frontend downloads the CSV via authenticated API request.

PDF export is not implemented. Use browser Print -> Save as PDF.

## Tests

Focused tests cover:

- strict route validation
- admin-only access
- zero report state
- historical cutoff payments
- later payment exclusion
- installment contract balance versus due-by-cutoff
- cancellation timing
- void timing
- global summary totals across pagination
- monthly activity net change
- CSV filename, headers, BOM, and escaping
