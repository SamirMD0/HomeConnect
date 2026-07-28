# Phase 12 Financial Corrections Design (v1.0.4)

Date: 2026-07-27

Release title: **Financial Precision, Admin Correction Controls, and Dashboard Accuracy**

Status: planning only. No code, schema, or migration written yet.

## 1. Summary Of What v1.0.4 Should Become

v1.0.4 turns the financial module from "correct on the happy path" into "correct and repairable in real business use". Three pillars:

1. **Precision and consistency** — one authoritative calculation contract used identically by customer summary, ledger, reports, and dashboard. No frontend-derived money math anywhere.
2. **Admin correction controls** — a single, auditable, password-verified correction pipeline covering debts, plans, installments, payments, allocations, and customer billing details, without physical deletes and without ad-hoc edit/delete buttons.
3. **Dashboard accuracy** — the dashboard stops reading the legacy `transactions` table and reads a new authoritative financial summary endpoint.

Ground truth found in the repository, which drives everything below:

- The backend financial domain (`domain/money.ts`, `balances.ts`, `statuses.ts`, `payment-allocation.ts`) is already Decimal-based and clean. Precision risk is not in the domain layer, it is at the edges.
- `backend/src/services/dashboard.service.ts` still computes totals with raw SQL over the legacy `transactions` table and returns JS `number`. The dashboard is showing numbers unrelated to `debts` / `payments` / `payment_allocations`. This is the largest correctness defect in the product today.
- `debts.service.ts:332` and `installment-plans.service.ts:412` pass `hasPayments: false` hardcoded into `assertCanCancelDebt` / `assertCanCancelInstallmentPlan`. The immutability guard is effectively disabled; only the frontend (`utils/financial-auth.ts`) blocks cancelling an obligation that has payments.
- There is no void-payment endpoint, although `Payment.voidedAt/voidedById/voidReason` exist in the schema and every read path already renders void state. The entire "wrong payment amount" and "wrong payment date" correction path is missing.
- `updateDebt` can change description, dueDate, and notes only. `updatePlan` can change description and notes only. Amount corrections are impossible.
- `totalPaid` in both the ledger and the customer summary comes from `prisma.payment.aggregate(totalAmount)` (payment headers), while per-obligation `totalPaid` comes from allocations. These can disagree, and the cancel bug above guarantees they will.
- The ledger `totalPaid` aggregate (`financial-ledger.repository.ts:141-145`) ignores the active date filters, so the summary card does not describe the rows on screen.
- An `accountPassword` verification pattern already exists (`authorization/account-password.ts`, used by update and cancel). v1.0.4 generalizes it rather than inventing a new one.
- No financial correction audit exists. `ActivityLog` exists but is used only by the legacy transactions repository.

## 2. Postponed Work

The previously planned v1.0.4 **production config guardrails** (validating `production.env` before backend startup, malformed `DATABASE_URL` detection) moves to **v1.0.5**.

Rationale: that work improves startup diagnostics on top of an already-working 1.0.3 startup monitor, while wrong money on screen is a live business risk. No part of the idea is discarded.

Action: update the "Current Important Version Context" block in `claude/PROJECT_BRIEF.md` so `1.0.4` is this financial release and `Planned 1.0.5` is config guardrails.

## 3. Correction Semantics Decision: Retroactive

Decided 2026-07-27. **Corrections are retroactive.**

An admin correction is a statement that the source record was entered incorrectly. It is not a forward-only adjustment.

- All authoritative backend calculations, customer summaries, ledger totals, reports, and dashboard totals recalculate from the corrected source records.
- Closed monthly reports are allowed to change after a correction.
- Effective-dated accounting adjustments are explicitly **out of scope** for v1.0.4 and deferred to a later advanced accounting version. Do not implement reversing-entry or period-freeze models in this release.
- Because history can change, corrected records and affected reports must expose a clear corrected/audited state wherever practical (see section 7).

Every correction requires, without exception:

- admin password verification (server-side)
- correction reason
- before/after audit snapshot
- `correctedById`
- `correctedAt`
- source screen / action metadata where available

## 4. Current Financial Calculation Risks

| # | Risk | Location | Impact |
|---|---|---|---|
| R1 | Dashboard totals computed from legacy `transactions` with `parentId IS NULL`, returned as JS `number` | `services/dashboard.service.ts` | Dashboard numbers are wrong and unrelated to real debts/payments |
| R2 | Dashboard frontend does float math (`salesToday - paymentsToday`, `.toFixed(2)`) | `features/dashboard/pages/DashboardPage.tsx:25,45,78,84,92` | Float display errors plus a total the backend never computed |
| R3 | Cancel guard bypassed (`hasPayments: false`) | `debts.service.ts:332`, `installment-plans.service.ts:412` | An obligation with payments can be cancelled: outstanding drops, paid stays, totals diverge permanently |
| R4 | `totalPaid` from payment headers vs obligation `totalPaid` from allocations | `financial-ledger.repository.ts:169`, `customer-financial-summary.repository.ts:159` | Customer profile, ledger, and reports can show three different "total paid" values |
| R5 | Ledger `totalPaid` aggregate ignores `paymentFrom`/`paymentTo`/`includeCancelled` filters | `financial-ledger.repository.ts:141` | Summary card contradicts the filtered rows below it |
| R6 | No payment void or reversal path | missing endpoint | A mistyped payment amount is permanent; users will "fix" it by cancelling the debt, hitting R3 |
| R7 | Allocation is auto oldest-first only | `domain/payment-allocation.ts` | A payment allocated to the wrong installment cannot be moved |
| R8 | Stored vs calculated status drift (`status` vs `storedStatus`); `OVERDUE` is time-dependent and stored rows refresh only on write | debts/plans services and repositories | Filtering or reporting by stored status yields stale results; `updatePlan` never recalculates plan/installment status |
| R9 | Legacy `/api/v1/transactions` routes and `features/transactions/*` still mounted and mutable | `app.ts:85`, `routes/transactions.routes.ts` | A second, float-based, editable ledger can still write rows nothing else counts |
| R10 | Ledger loads all debts/plans/payments into memory and paginates in JS | `financial-ledger.service.ts:56-89` | Correct today, degrades as data grows; couples summary and rows fragilely |
| R11 | Retroactive corrections change closed monthly reports | `reports/monthly-debts/monthly-debts.service.ts` | Accepted by decision in section 3, but requires visible corrected state |

Not a risk: `money.ts`, `balances.ts`, `business-date.ts`, and the monthly report cutoff logic (`sumValidAllocationsAtCutoff`, `paymentValidAtCutoff`) are sound and are the model everything else should copy.

## 5. Admin Correction Design

One correction pipeline, one entry point per surface, no scattered buttons.

- A single backend module `backend/src/features/financial/corrections/` owns every correction. Feature services expose correction operations through it and do not grow their own edit endpoints.
- Every correction is a typed **CorrectionRequest**: `{ recordType, recordId, changes, reason, sourceScreen, accountPassword }`.
- Correction categories:
  - **Detail correction** — non-monetary fields (description, notes, due date, payment date, customer bill details). Applied in place, audited.
  - **Amount correction** — monetary fields (debt `originalAmount`, plan `totalAmount`, installment `amountDue`, payment `totalAmount`). Applied in place only when the new value stays consistent with existing allocations (new amount >= already-allocated amount); otherwise rejected with a message directing the admin to reverse payments first.
  - **Reversal correction** — payments: `void`, and optionally `void + reissue` (reverse and record a replacement payment in the same transaction). Allocation rows are never edited; they are voided and superseded.
  - **Reallocation correction** — plan payments: void the payment's existing allocations and write new ones; totals must equal the payment amount.

UI shape, satisfying the "no new buttons in Installment Plan Details" rule:

- Admin-only global toggle **Correction mode** in the top bar, visible only to `ADMIN`, off by default, reset on reload.
- When on, records in **Ledger**, **Customer financial profile**, and **Installment Plan Details** gain a single overflow (`...`) menu item **Correct record**. No Edit/Delete buttons are added to Installment Plan Details; its existing Edit and Delete plan buttons are replaced by this menu entry.
- Correct record opens one shared **Correction Drawer**: the record-type form, then a mandatory reason field, then the password step, then a before/after diff preview the admin must confirm.
- Non-admins never see the toggle and never receive correction endpoints (403 via `requireFinancialAdmin`).

## 6. Password Verification Design

- Reuse and extend `backend/src/features/financial/authorization/account-password.ts`. Add `verifyAdminPasswordForCorrection(userId, password, context)`: load user, assert `role === ADMIN`, assert active and not deleted, `bcrypt.compare`, and on failure write an `AdminVerificationLog` row (outcome only, never the password) and throw `AuthenticationError`.
- Verification is always server-side, always inside the correction service, and always before the write transaction opens. bcrypt is slow; do not hold a database transaction across it.
- Rate limiting: after 5 failed verifications for one user within 15 minutes, reject corrections for 15 minutes. Track correction attempts in `AdminVerificationLog`, not in `User.failedLoginAttempts`, so a fat-fingered correction never locks the user out of login.
- The password is accepted only as body field `accountPassword`, stripped from every validation error, never logged, and never stored in the audit record. Add an explicit redaction assertion in the error middleware test.
- The frontend never compares passwords. The drawer's password step only submits.

## 7. Audit Trail And Corrected-State Disclosure

### 7.1 Audit record

New table `FinancialCorrectionAudit`, one row per applied correction, written inside the same transaction as the change:

- `recordType` (`DEBT | INSTALLMENT_PLAN | INSTALLMENT | PAYMENT | PAYMENT_ALLOCATION | CUSTOMER_BILLING`), `recordId`, `customerId` (denormalized for fast profile queries)
- `action` (`CORRECT_DETAILS | CORRECT_AMOUNT | CORRECT_DATE | VOID_PAYMENT | REISSUE_PAYMENT | REALLOCATE_PAYMENT | CANCEL_RECORD`)
- `correctedById`, plus `correctedByName` and `correctedByUsername` snapshotted at write time so the record survives user rename or deactivation
- `correctedAt`, `reason` (required, trimmed, min 5 characters)
- `beforeValues` / `afterValues` — JSON snapshots of only the fields in scope; money as `"0.00"` strings via `moneyToApiString`, dates as `YYYY-MM-DD` business dates
- `affectedTotals` — JSON `{ customerOutstandingBefore/After, obligationRemainingBefore/After }`, computed with the same domain helpers
- `sourceScreen` (`LEDGER | CUSTOMER_PROFILE | PLAN_DETAILS | REPORTS`), plus `requestId` / `ipAddress` when the request provides them

Never stored: password, password hash, full record dumps.

The audit is append-only. No update or delete endpoints, no UI to modify it.

`AdminVerificationLog`: `userId`, `attemptedAt`, `outcome (SUCCESS | FAILURE | LOCKED)`, `action`, `ipAddress`. No password material.

Validation is blocking, not best-effort: a correction request is rejected before any write unless it carries a verified admin password, a reason of at least 5 trimmed characters, `correctedById` with snapshotted identity, `correctedAt`, `sourceScreen`, and a computed before/after snapshot. No correction can exist without its audit row.

### 7.2 Corrected-state disclosure

Because corrections are retroactive, four surfaces expose corrected state, all sourced from `FinancialCorrectionAudit`:

1. **Record level** — `GET /debts/:id`, `/installment-plans/:id`, payment views, and ledger rows gain `correction: { count, lastCorrectedAt, lastCorrectedBy } | null`. The frontend renders a "Corrected" chip that opens that record's correction history. One grouped query on `(recordType, recordId)`.
2. **Report level** — the monthly report response gains `corrections: { affectedRecordCount, lastCorrectedAt }` for the period, computed from audit rows whose target record participates in that month. The Reports UI shows a banner: "N records in this period were corrected after the month closed. Totals reflect the corrected data." This is what makes a changed closed month explainable.
3. **Customer level** — a Correction history panel on the customer profile listing reason, before/after, who, when, and source screen.
4. **Dashboard level** — no per-card flag, since the dashboard is always live. The monthly snapshot tile carries the report-level indicator when the current month contains corrections.

Practical exclusion: individual installment rows inside a schedule table do not get their own chip. The plan-level chip covers them, keeping `InstallmentPlanDetails.tsx` uncluttered.

## 8. Debt Correction Plan

Endpoint: `POST /api/v1/debts/:debtId/corrections`. It replaces the correction role of the current `PATCH /debts/:debtId`; keep `PATCH` as a thin alias that delegates to the pipeline so the existing `EditDebtDialog` keeps working during migration.

Correctable: `description`, `notes`, `dueDate`, `originalAmount`, and `cancelReason` on already-cancelled debts.

Rules:

- The new `originalAmount` must be `> 0` and `>= totalPaid` from non-voided allocations. Equal means the debt becomes `PAID`; greater means status is recomputed by `determineDebtStatus`.
- A `dueDate` correction re-runs `determineDebtStatus`, fixing an `OVERDUE` state caused by a typo.
- Cancelling a debt that has payments is a correction action, not an edit: the payments must be voided or reallocated first. Fix `hasPayments` so it is computed from non-voided allocations instead of hardcoded `false`.
- The whole operation runs in `runFinancialTransaction`: verify, load, validate, update, recompute status, write audit.

## 9. Payment Correction Plan

This is the largest functional gap.

- `POST /api/v1/payments/:paymentId/void` — reason and password required. Sets `voidedAt` / `voidedById` / `voidReason`, marks all its allocations voided, recomputes every affected debt, installment, and plan status, and writes the audit row. Guarded by `assertCanVoidPayment`.
- `POST /api/v1/payments/:paymentId/corrections` — corrects `paymentDate`, `paymentMethod`, `reference`, `notes` in place. These never change balances but do change report bucketing, so monthly report cutoffs must be re-verified in tests.
- Amount corrections use **void + reissue** in a single transaction: void the old payment, create a new `Payment` with fresh allocations at the corrected amount and date, and link them through `FinancialCorrectionAudit` (`beforeValues.paymentId` to `afterValues.paymentId`). Payment amounts are never mutated in place. This preserves the existing immutability model and the monthly report's `voidedAt >= cutoff` reconstruction.
- The overpayment guard runs again on reissue through `planDebtPaymentAllocation` / `planInstallmentPaymentAllocations`.
- No physical delete, ever.

## 10. Installment Plan Correction Plan

Endpoint: `POST /api/v1/installment-plans/:planId/corrections`.

Correctable: `description`, `notes`, `startDate`, `totalAmount`, `installmentCount`, `cancelReason`.

Rules:

- Schedule-affecting corrections (`totalAmount`, `startDate`, `installmentCount`) are allowed only when the plan has no non-voided allocations. With payments present the API returns a precise error directing the admin to correct the payments first. This keeps "installment schedules are not regenerated" meaningful instead of silently violated. The restriction protects the allocation invariant, not history — retroactive semantics do not require it to be relaxed.
- When allowed, the schedule is regenerated with `domain/installment-schedule.ts` (first installment on `startDate`, last installment absorbs the rounding remainder). Old installment rows are superseded rather than deleted: mark them `CANCELLED` and insert the new numbered set. Because `(installmentPlanId, installmentNumber)` is unique, either renumber old rows out of the way inside the same transaction, or, preferred and simpler, keep the same installment IDs and update only `amountDue` / `dueDate` when the count is unchanged, requiring count changes to go through the no-payments path.
- Per-installment corrections (`amountDue`, `dueDate` of one row) use their own record type. After any such correction the sum of installment `amountDue` must equal plan `totalAmount`; enforce this invariant before commit.
- After every correction: recompute installment statuses, then plan status through `determineInstallmentPlanStatus`.
- UI: no new buttons in `InstallmentPlanDetails.tsx`. Its Edit and Delete plan buttons are consolidated into the admin `...` menu.

## 11. Installment Payment And Allocation Correction Plan

Endpoint: `POST /api/v1/payments/:paymentId/reallocate`.

- Body: `{ allocations: [{ installmentId, amount }], reason, accountPassword }`.
- Validation: every target installment belongs to the same plan and customer as the payment; every amount `> 0`; `sum(amounts)` equals the payment `totalAmount` exactly; no installment ends over-allocated (`allocated <= amountDue`); cancelled installments are rejected.
- Execution in one transaction: mark existing allocations voided using the new nullable columns (section 17), insert new allocation rows, recompute each touched installment status, recompute plan status, write the audit row with before/after allocation maps.
- `domain/balances.ts` already filters on `allocation.isVoided`. Repositories must populate it from `allocation.voidedAt || payment.voidedAt` instead of only `payment.voidedAt`. That is a one-line change per mapping site and makes every existing total correct automatically.
- Automatic oldest-first allocation remains the default on payment entry. Reallocation is the escape hatch.

## 12. Customer Bill And Details Correction Plan

- Financial-facing customer fields (`name`, `phone`, `address`, `notes`) currently use `PUT /customers/:id`, which is authenticated but not admin-gated and not audited. For v1.0.4, keep the endpoint, but when the customer has any financial records require `ADMIN` plus reason plus password and route the write through the correction pipeline with `recordType: CUSTOMER_BILLING`. Customers with no financial history keep the current lightweight flow.
- "Customer bill" as a document is a rendering of the summary; there is no stored bill entity. Correcting a bill therefore means correcting the underlying debt, plan, or payment records. The correction drawer launched from the customer profile must target the specific underlying record, not a bill object, and the UI copy must say so.
- Customer soft-delete stays blocked while financial history exists.

## 13. Ledger Correction Integration

- The ledger is the primary correction surface. `LedgerTable` rows gain the admin `...` menu entry, opening the shared drawer with `sourceScreen: LEDGER`.
- Fix R5: move `totalPaid` off the unfiltered aggregate. Compute the ledger summary from the same filtered result set used for rows (non-voided allocations for the filtered obligations plus filtered payments) so the cards always describe what is on screen. Document the definition in the response as `summary.basis: "filtered"`.
- Add an admin-only ledger filter **Corrected records** backed by `FinancialCorrectionAudit`, plus the per-row corrected marker from section 7.2.
- Deprecate the legacy transaction path in the same release: remove `PUT` and `DELETE` from `routes/transactions.routes.ts` and unmount `/api/v1/transactions` write access. Keep read access only if a screen still needs it. Legacy rows are never deleted.

## 14. Dashboard Update Plan

Replace `DashboardService.getSummary` entirely with an authoritative summary built on `debts` / `installments` / `payments` / `payment_allocations` using the same domain helpers as the ledger.

`GET /api/v1/dashboard/financial-summary` returns money as `"0.00"` strings, computed backend-side:

- `totalOutstanding`, `totalPaidAllTime`, `totalPaidThisMonth`, `totalPaidToday`
- `overdueTotal`, `overdueCustomerCount`, `overdueDebtCount`, `overdueInstallmentCount`
- `activeDebtCount`, `activeInstallmentPlanCount`, `customersWithDebtCount`, `totalCustomers`
- `recentPayments[]` — latest N non-voided payments with customer, amount, date
- `upcomingDue[]` — next N debts/installments due within a configurable window, default 30 days, business-local
- `overdueCustomers[]` — top N by overdue amount
- `monthlySnapshot` — reuse the monthly-debts point-in-time engine for the current month so the dashboard and Reports agree by construction, including the corrections indicator
- Links are frontend-side: cards deep-link to `/ledger` pre-filtered, `/reports`, and `/customers/:id`

Rules: business-local day and month boundaries through `domain/business-date.ts`, never `setUTCHours`. One endpoint, one round trip. The dashboard never sums paginated data and never subtracts numbers. The "Net change" tile either arrives from the backend as a precomputed string or is removed.

## 15. Backend API Endpoints Needed

New:

- `GET  /api/v1/dashboard/financial-summary`
- `POST /api/v1/debts/:debtId/corrections`
- `POST /api/v1/installment-plans/:planId/corrections`
- `POST /api/v1/installment-plans/:planId/installments/:installmentId/corrections`
- `POST /api/v1/payments/:paymentId/void`
- `POST /api/v1/payments/:paymentId/corrections`
- `POST /api/v1/payments/:paymentId/reallocate`
- `POST /api/v1/customers/:customerId/billing-corrections`
- `GET  /api/v1/corrections?recordType&recordId&customerId&from&to` (admin-only audit read)
- `GET  /api/v1/customers/:customerId/corrections`

Changed:

- `PATCH /api/v1/debts/:debtId` and `PATCH /api/v1/installment-plans/:planId` delegate to the correction pipeline; reason becomes required
- `POST /api/v1/debts/:debtId/cancel` and `.../installment-plans/:planId/cancel` compute `hasPayments` for real
- `GET /api/v1/financial-ledger` gains the filtered-consistent summary and per-row correction flag
- `PUT` and `DELETE /api/v1/transactions/:id` removed

All correction endpoints use `requireAuth` plus `requireFinancialAdmin` plus zod validation with `reason` (min 5) and `accountPassword` (min 1).

## 16. Frontend UI Changes Needed

New shared feature `frontend/src/features/financial-corrections/`: `CorrectionModeContext` (admin-only toggle), `CorrectionDrawer` (record-type router), `CorrectionReasonField`, `AdminPasswordStep`, `BeforeAfterDiff`, `RecordCorrectionMenu`, `useCorrections` hooks, `corrections.api.ts`, and zod schemas mirroring the backend.

- **Ledger** (`pages/LedgerPage.tsx`, `features/financial-ledger/components/LedgerTable.tsx`): `...` admin menu, drawer wiring, Corrected marker, summary cards stay display-only.
- **Installment Plan Details** (`InstallmentPlanDetails.tsx`): remove the standalone Edit and Delete plan buttons and route both through the `...` menu. No new buttons.
- **Customer profile** (`CustomerProfilePage.tsx`, `CustomerFinancialProfile.tsx`, `DebtDetails.tsx`): same `...` pattern plus the Correction history panel.
- **Dashboard** (`features/dashboard/*`): new `financialSummary` types with all money as `string`, new `useFinancialSummary` hook, `StatCard` accepting preformatted strings, removal of every `.toFixed()` and arithmetic in `DashboardPage.tsx`, plus Upcoming Due, Overdue Customers, and Recent Payments panels with links to Ledger, Reports, and Customer profile.
- **Reports** (`pages/ReportsPage.tsx`, `features/reports/components/*`): corrections banner for periods containing corrected records.
- **Existing edit dialogs** (`EditDebtDialog`, `EditInstallmentPlanDialog`) become drawer-hosted correction forms with the added reason field; the existing password field pattern is preserved.
- **Legacy** `features/transactions/*` (float math at `TransactionList.tsx:74-75,101`) is removed from routing and usage. It is the last frontend money-math site.
- After any correction, invalidate: customer summary, debt/plan detail, ledger, reports, and dashboard summary query keys.

## 17. Schema Changes (Required, Additive Only)

Two new tables plus three nullable columns. No destructive change, no reset, no altered existing column.

1. **`FinancialCorrectionAudit`** — required because there is nowhere today to store before/after snapshots, reason, or corrector identity. `ActivityLog` is unsuitable: `entityId` is `@db.Uuid`-typed, `details Json` is unstructured, and it is written only by the legacy transaction repository. Fields per section 7.1. Indexes: `(recordType, recordId)`, `(customerId, correctedAt)`, `(correctedAt)`.
2. **`AdminVerificationLog`** — required to rate-limit and evidence password checks without touching `User.failedLoginAttempts`, which governs login lockout. Fields per section 7.1.
3. **`PaymentAllocation.voidedAt`, `.voidedById`, `.correctionId`** (all nullable) — required because reallocation and payment void must supersede allocations without deleting rows, and `domain/balances.ts` already has the `isVoided` hook waiting for them. Without these, allocation-level correction is impossible without destructive edits.

Optional, only if reissue linkage is wanted in-schema rather than in audit JSON: `Payment.replacedByPaymentId`, a nullable self-relation. Prefer the audit table first.

Migration: one additive migration applied with `prisma migrate deploy`. No changes to existing enums; new enums are new types. No backfill needed since all new columns are nullable and all new tables start empty. Do not create the migration before Checkpoint 3.

## 18. Calculation Precision Rules

Codify these as the calculation contract and enforce them in review:

1. All money crosses the API boundary as a fixed two-decimal string. `moneyToApiString` is the only serializer.
2. All money arithmetic uses `domain/money.ts` (`addMoney`, `subtractMoney`, `sumMoney`, `minMoney`, `compareMoney`). `Number()`, `parseFloat`, `+`, `-`, and `toFixed` on money are banned outside `money.ts`. Enforce with a lint rule or a focused test that scans the financial and dashboard directories.
3. **Paid** equals the sum of non-voided allocations (`allocation.voidedAt === null && payment.voidedAt === null`). Payment-header aggregates are valid only for cash-received style metrics and must be labelled as such, never as an obligation `totalPaid`.
4. **Remaining** equals `originalAmount - paid`, clamped at zero only in reporting (`nonNegative`), never in the write path. A negative remaining is a bug that must surface.
5. **Overdue** means remaining `> 0` and `dueDate < businessToday`, comparing business dates as `YYYY-MM-DD` strings through `compareBusinessDates`. Never `Date` objects, never UTC boundaries.
6. Rounding: split through `installment-schedule.ts`; the final installment absorbs the remainder; the sum of installments must equal the plan total. Assert this invariant on every schedule write and correction.
7. Status: the calculated status is authoritative in every read path. The stored column is a cache refreshed inside the same transaction as any write or correction. Reports and filters use the calculated status; `storedStatus` is exposed only for diagnostics.
8. Historical reports reconstruct state at the cutoff (allocations with `paymentDate <= cutoff` and `voidedAt >= cutoff + 1d`, cancellations `cancelledAt < cutoff + 1d`) using the **current, corrected** values of `originalAmount`, `dueDate`, `amountDue`, and `paymentDate`. The existing `monthly-debts.service.ts` engine already behaves this way and needs no math change under the retroactive decision. The only addition is the corrections indicator from section 7.2.
9. The frontend formats and never computes. One helper (`financial-format.ts`) formats strings; no arithmetic on money in React.
10. Ledger, dashboard, summary, and report totals must be derivable from the same four primitives: obligation amount, allocation amount, void state, business date. If a screen needs a total, the backend computes it.

## 19. Recalculation Strategy

Hybrid, with dynamic as the source of truth, matching what the code already does well. Retroactive corrections make this strategy simpler, not harder: a corrected source record propagates everywhere with no recomputation jobs.

- **Dynamic and authoritative**: balances, remaining amounts, overdue detection, calculated debt/installment/plan status, and all customer, ledger, report, and dashboard totals. Computed from `Debt`, `Installment`, `PaymentAllocation`, and `Payment` on every read through the domain helpers.
- **Stored as cache, never trusted for money**: `Debt.status`, `Installment.status`, `InstallmentPlan.status`, `Installment.paidDate`. Kept consistent by writing them inside the same `runFinancialTransaction` as any payment, void, reallocation, or correction. Fix the current gap where `updatePlan` mutates the plan without recomputing installment and plan status.
- **Fan-out after any correction**, single transaction, in order: affected installments, parent plan, affected debt, customer aggregate (recomputed on read, nothing stored), audit row. Ledger, reports, and dashboard need no recalculation because they are dynamic; they need only frontend cache invalidation.
- Because `OVERDUE` is time-dependent, stored status inevitably drifts overnight. Do not add a nightly job in v1.0.4. Instead ensure no read path or report depends on stored status (rule 7) and add a diagnostics-only status drift count so drift is visible without being load-bearing.

## 20. Testing Strategy (Focused Only)

Per checkpoint, run only the named files with `npx vitest run <path>`.

| CP | Test type | Folder / files |
|---|---|---|
| 1 | Unit (domain and guards) | `backend/src/features/financial/domain/*.test.ts`, new `calculation-contract.test.ts` |
| 2 | Unit plus route auth | `backend/src/features/financial/authorization/*.test.ts`, new `admin-password-verification.test.ts` |
| 3 | Unit (audit builder), no DB | new `backend/src/features/financial/corrections/correction-audit.test.ts` |
| 4 | Service plus routes plus retroactive case | `debts.service.test.ts`, `debts.routes.test.ts` |
| 5 | Service plus routes | new `payments-corrections.service.test.ts`, `payments-corrections.routes.test.ts` |
| 6 | Service plus routes | `installment-plans.service.test.ts`, `installment-plans.routes.test.ts` |
| 7 | Service | new allocation reallocation tests under `backend/src/features/financial/payments/` |
| 8 | Service | `financial-ledger.service.test.ts` (summary-matches-filters cases) |
| 9 | Service plus routes | new `backend/src/features/dashboard/*.test.ts` |
| 10 | Component | `frontend/src/features/dashboard/**`, new correction-drawer tests under `frontend/src/features/financial-corrections/` |
| 10 | Cross-surface consistency | new `backend/src/features/financial/consistency.test.ts` |

The **retroactive correction case** lands at Checkpoint 4, the first point where the semantics are observable: correct a debt amount dated two months back, then assert that the customer summary, ledger, that month's report, and the dashboard all move to the same new number, and that the report exposes its corrections indicator. Checkpoint 10 repeats it as part of the cross-surface fixture.

Database integration tests (`*-db.integration.test.ts`) run only at Checkpoints 4, 5, 6, and 10, against the test database, never against the business database.

Full verification exactly once, at Checkpoint 10:

```powershell
npm run lint
npm run typecheck
npm run test
npm run build
npm run prisma:validate
```

## 21. Implementation Checkpoints

Ordered so the live bugs (R3, R4, R5) are fixed before new surface area is added. Each checkpoint is independently shippable and leaves the app working.

- **CP1 — Precision audit and calculation contract.** Write the contract; fix the `hasPayments` hardcoding in both cancel paths; make `isVoided` derive from allocation and payment; align ledger and customer-summary `totalPaid` to allocation-based math; fix the ledger filtered-summary mismatch. No new endpoints. This alone fixes the worst existing defects.
- **CP2 — Admin password verification backend flow.** Generalize `account-password.ts`, add the admin assertion, rate limiting, and redaction guarantees.
- **CP3 — Correction audit schema and backend module.** Schema plus migration, `corrections/` module skeleton, audit writer, `GET /corrections` read endpoints.
- **CP4 — Debt correction backend and frontend.** Includes `originalAmount` correction, the shared Correction Drawer's first record type, and the retroactive correction test.
- **CP5 — Payment correction backend and frontend.** Void, void plus reissue, and date/method/reference correction. Highest business value after CP1.
- **CP6 — Installment plan and installment correction backend and frontend.** Includes consolidating the Plan Details buttons into the `...` menu.
- **CP7 — Allocation reallocation backend and frontend.**
- **CP8 — Ledger correction integration.** `...` menu everywhere, corrected-record marker and filter, legacy transaction write routes removed.
- **CP9 — Dashboard authoritative summary endpoint.** New service on the financial domain, business-local boundaries, string money.
- **CP10 — Dashboard frontend rewrite, corrections disclosure on Reports, focused tests, full verification, version bump to 1.0.4.**

## 22. Risks And Blockers

1. **Schema and migration drift** noted in `docs/project/FINANCIAL_FLOW_AUDIT.md` section 14, between `20260723094305_init_ledger` and the current schema. Inspect `_prisma_migrations` state on the business machine before applying the additive migration. Do not resolve drift by resetting.
2. **Schedule regeneration versus unique `(installmentPlanId, installmentNumber)`** — count changes need careful in-transaction renumbering. Mitigated by restricting count changes to plans with no payments (section 10).
3. **Existing data may already be inconsistent** because of the cancel bug (R3): a debt with payments may already be cancelled. CP1 should include a read-only consistency report, no writes, so the scale of any repair is visible.
4. **Ledger in-memory pagination (R10)** will get slower once the dashboard adds another full scan. Not blocking at current data volume; revisit if the summary endpoint is slow.
5. **Correction mode is powerful** — an admin can rewrite money and history. The audit trail is the only control. Do not ship CP4 or later before CP3 is complete.
6. **Retroactive report changes are now expected behavior.** The residual risk is user confusion, not correctness. The section 7.2 disclosure surfaces are therefore not optional polish; ship the report banner in the same release as the first amount correction.
7. Uncommitted desktop and Electron changes are currently in the worktree. Keep v1.0.4 financial work on separate commits so a release can be cut cleanly.

## 23. Exact Files Likely To Change

### Backend, new

```text
backend/src/features/financial/corrections/corrections.controller.ts
backend/src/features/financial/corrections/corrections.routes.ts
backend/src/features/financial/corrections/corrections.service.ts
backend/src/features/financial/corrections/corrections.validator.ts
backend/src/features/financial/corrections/correction-audit.repository.ts
backend/src/features/financial/corrections/correction-audit.ts
backend/src/features/financial/payments/payments.controller.ts
backend/src/features/financial/payments/payments.routes.ts
backend/src/features/financial/payments/payments.service.ts
backend/src/features/financial/payments/payments.repository.ts
backend/src/features/financial/payments/payments.validator.ts
backend/src/features/dashboard/dashboard-financial.controller.ts
backend/src/features/dashboard/dashboard-financial.routes.ts
backend/src/features/dashboard/dashboard-financial.service.ts
backend/src/features/dashboard/dashboard-financial.repository.ts
backend/src/features/dashboard/dashboard-financial.types.ts
```

### Backend, modified

```text
backend/prisma/schema.prisma                (additive only)
backend/prisma/migrations/<new>/            (additive only)
backend/src/app.ts
backend/src/features/financial/index.ts
backend/src/features/financial/authorization/account-password.ts
backend/src/features/financial/authorization/financial-policy.ts
backend/src/features/financial/domain/balances.ts
backend/src/features/financial/domain/financial-types.ts
backend/src/features/financial/domain/immutable-policy.ts
backend/src/features/financial/debts/debts.service.ts
backend/src/features/financial/debts/debts.repository.ts
backend/src/features/financial/debts/debts.validator.ts
backend/src/features/financial/installment-plans/installment-plans.service.ts
backend/src/features/financial/installment-plans/installment-plans.repository.ts
backend/src/features/financial/installment-plans/installment-plans.validator.ts
backend/src/features/financial/customer-summary/customer-financial-summary.service.ts
backend/src/features/financial/customer-summary/customer-financial-summary.repository.ts
backend/src/features/financial/ledger/financial-ledger.service.ts
backend/src/features/financial/ledger/financial-ledger.repository.ts
backend/src/features/financial/ledger/financial-ledger.types.ts
backend/src/features/reports/monthly-debts/monthly-debts.service.ts   (corrections indicator only)
backend/src/features/reports/monthly-debts/monthly-debts.types.ts
backend/src/routes/dashboard.routes.ts
backend/src/routes/transactions.routes.ts   (remove PUT and DELETE)
backend/src/services/dashboard.service.ts   (retired)
backend/src/routes/customers.routes.ts
backend/src/services/customers.service.ts
```

### Frontend, new

```text
frontend/src/features/financial-corrections/api/corrections.api.ts
frontend/src/features/financial-corrections/components/CorrectionDrawer.tsx
frontend/src/features/financial-corrections/components/CorrectionReasonField.tsx
frontend/src/features/financial-corrections/components/AdminPasswordStep.tsx
frontend/src/features/financial-corrections/components/BeforeAfterDiff.tsx
frontend/src/features/financial-corrections/components/RecordCorrectionMenu.tsx
frontend/src/features/financial-corrections/components/CorrectionHistoryPanel.tsx
frontend/src/features/financial-corrections/context/CorrectionModeContext.tsx
frontend/src/features/financial-corrections/hooks/useCorrections.ts
frontend/src/features/financial-corrections/schemas/correction.schemas.ts
frontend/src/features/financial-corrections/types/correction.types.ts
frontend/src/features/dashboard/api/financial-summary.api.ts
frontend/src/features/dashboard/hooks/useFinancialSummary.ts
frontend/src/features/dashboard/components/UpcomingDueList.tsx
frontend/src/features/dashboard/components/OverdueCustomersList.tsx
frontend/src/features/dashboard/components/RecentPaymentsPanel.tsx
```

### Frontend, modified

```text
frontend/src/features/dashboard/pages/DashboardPage.tsx
frontend/src/features/dashboard/types.ts
frontend/src/features/dashboard/components/StatCard.tsx
frontend/src/pages/LedgerPage.tsx
frontend/src/features/financial-ledger/components/LedgerTable.tsx
frontend/src/features/financial-ledger/components/LedgerSummaryCards.tsx
frontend/src/features/financial-ledger/types/financial-ledger.types.ts
frontend/src/features/customer-financial/components/InstallmentPlanDetails.tsx
frontend/src/features/customer-financial/components/DebtDetails.tsx
frontend/src/features/customer-financial/components/CustomerFinancialProfile.tsx
frontend/src/features/customer-financial/components/EditDebtDialog.tsx
frontend/src/features/customer-financial/components/EditInstallmentPlanDialog.tsx
frontend/src/features/customer-financial/api/financial-mutations.api.ts
frontend/src/features/customer-financial/hooks/useFinancialMutations.ts
frontend/src/features/customer-financial/utils/financial-auth.ts
frontend/src/pages/customers/CustomerProfilePage.tsx
frontend/src/pages/ReportsPage.tsx
frontend/src/features/reports/components/ReportSummaryCards.tsx
frontend/src/layouts/DashboardLayout.tsx     (correction mode toggle)
frontend/src/features/transactions/*         (retire legacy float math)
```

### Meta

```text
package.json                 (version 1.0.3 -> 1.0.4)
claude/PROJECT_BRIEF.md      (version context: 1.0.4 financial, 1.0.5 config guardrails)
docs/project/PROJECT_ROADMAP.md      (checkpoint tracking)
docs/phases/phase-12/PHASE_12_FINANCIAL_CORRECTIONS_DESIGN.md  (this document)
```
