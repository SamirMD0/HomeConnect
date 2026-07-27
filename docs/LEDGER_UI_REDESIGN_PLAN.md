# Ledger UI Redesign Plan

Date: 2026-07-27
Scope: frontend Ledger page only. Planning document. No code changes included.

## 1. Ledger UI goal

One global screen where a shop admin can answer, in a few seconds:

- who owes money right now
- how much is left on each debt / installment plan
- what has already been paid against each of them, and when
- what is overdue

Obligations (debts, installment plans) are the primary rows. Payments are **evidence attached to an obligation**, not competing rows. Completed work is hidden until asked for. All money and status values come from the backend.

## 2. Current likely UI problems

Confirmed by reading `LedgerPage.tsx`, `LedgerTable.tsx`, `LedgerFilters.tsx`, `financial-ledger.types.ts`, `ledger-query.ts`.

1. **Payments are sibling rows.** In the default `type=ALL` view, the backend returns `DEBT`, `INSTALLMENT_PLAN` and `PAYMENT` items in one flat list. A single payment therefore appears twice conceptually: once as its own row, and again inside the parent debt's `totalPaid` / `remainingBalance`. This is the biggest readability problem.
2. **12 columns, many of them dashes.** `Date, Customer, Type, Description, Progress, Due date, Total, Paid, Remaining, Payment, Status, Actions`. Payment rows render `—` in five money/progress cells; obligation rows render `—` in the Payment cell. Roughly a third of the grid is placeholder noise.
3. **Payment detail is hidden inside the actions menu.** `PaymentAllocationDetails` is rendered inside the `MoreHorizontal` dropdown. Critical amounts and allocations sit behind a menu that reads as "actions".
4. **`Correct record` is a no-op.** For both debts and plans it calls `onViewDebt` / `onViewPlan`, i.e. it just opens the details modal. No correction component exists under `frontend/src/features/customer-financial/components/`. It looks like an admin capability but does nothing.
5. **Legacy edit path is still wired.** `LedgerPage` imports `EditDebtDialog` and `EditInstallmentPlanDialog` and passes `onEditDebt` / `onEditPlan` into `DebtDetails` / `InstallmentPlanDetails`. This is the mutable-finance behavior that should not exist on an immutable ledger.
6. **Filters are a wall of controls.** Five tabs + search + status select + two date inputs + three stacked checkboxes, all equal weight. `Include completed` is buried as the middle checkbox, so the (correct) default of hiding completed records is invisible to the user. There is no `Clear filters` button.
7. **Type tab and Status select overlap and can contradict.** `type=OVERDUE` force-sets `status=OVERDUE`; picking `status=CANCELLED` force-sets `includeCancelled=true`. Two controls mutate each other with no visible feedback.
8. **Summary basis is not labelled.** `summary.basis` is literally `'filtered'`, but `LedgerSummaryCards` presents the numbers as if global. Users will read filtered totals as business totals.
9. **No responsive strategy.** Single `overflow-x-auto` wrapper. On a laptop or tablet the table is a horizontal scroll with Actions off-screen.
10. **Action menu uses `<details>`.** No outside-click close, no Escape close, no roving focus. Multiple menus can be open at once.
11. **No expansion at all** — the core requested feature is absent.

## 3. Recommended table structure

Desktop column set — 10 columns, down from 12:

| # | Column | Align | Notes |
|---|--------|-------|-------|
| 1 | Expand | center | 40px. Chevron button only. |
| 2 | Due date | left | Debt `dueDate`; plan `nextDueDate` (`—` when plan complete). Secondary line: created date. |
| 3 | Customer | left | Name bold, phone in `text-xs text-slate-500`. |
| 4 | Type | left | `Debt` / `Plan · 3 of 12`. Progress folded in here — the separate Progress column is dropped. |
| 5 | Description | left | Truncate to 2 lines, `title` attribute for full text. Correction chip lives here. |
| 6 | Amount | right | Debt `originalAmount`, plan `totalAmount`. |
| 7 | Paid | right | `totalPaid`. |
| 8 | Remaining | right | `remainingBalance`. Bold — the number that matters. |
| 9 | Status | left | Single badge. |
| 10 | Actions | right | Kebab menu. |

Dropped: standalone `Progress` column (merged into Type), standalone `Payment` column (payments are now child rows), separate `Date` column (merged under Due date).

Payment child row columns — do **not** align to the parent grid, use a nested definition layout inside one `colSpan` cell:

`Payment date · Method · Amount · Allocated to · Reference · Notes`

Rationale: forcing payment fields into obligation columns is what produces the current dash-soup. A `<td colSpan={10}>` containing a small dedicated grid is easier to read and easier to make responsive.

## 4. Parent row design

- Background `bg-white`, hover `hover:bg-slate-50`, row height ~56px, `align-middle` (currently `align-top`, which makes rows look ragged).
- Border between rows `divide-slate-100`. No border-left on parents.
- Expanded parent gets `bg-slate-50` and loses its bottom border so it visually merges with its children.
- Money cells: `tabular-nums font-medium`, right-aligned. Remaining uses `font-semibold text-slate-900`; a zero remaining renders in `text-slate-400`.
- Overdue emphasis: due-date cell text turns `text-red-700 font-medium` when `status` is overdue. No red row background — one signal, not two.
- The whole row is *not* clickable. Expansion is the chevron button; view-details is the menu. Avoids accidental navigation.

## 5. Payment dropdown child row design

- Rendered as one `<tr class="bg-slate-50/70">` containing `<td colSpan={10}>` with `border-l-2 border-slate-200 pl-10`.
- Inside: a header line `Payments (3)` in `text-xs uppercase tracking-wide text-slate-500`, then one card per payment.
- Each payment card: `text-xs`, `py-2`, separated by `divide-y divide-slate-200/70`.
  - Line 1: `formatBusinessDate(paymentDate)` · method label · **amount** (right-aligned, `tabular-nums`).
  - Line 2 (muted): `Ref: …` · `Recorded by {createdBy.name} on {formatDateTime(createdAt)}`.
  - Line 3 (only if present): notes, clamped to 2 lines.
  - Voided payments: `line-through text-slate-400` on the amount + an amber `Voided` badge + void reason. Never hidden.
- Plan children additionally show allocation detail indented one more level: `Installment #3 — 150.00`, one line per allocation, only when `allocations.length > 1` or the target is an installment. One payment = one card, always.
- Empty state inside the expanded area: `No payments recorded yet.` in `text-xs text-slate-500`, ~48px tall so the row does not collapse to nothing.
- Loading state: two shimmer bars at the child row's height, so expanding does not change row height when data arrives.

Data source (no backend change): lazy-load with the existing detail hooks.

- Debt → `useDebtDetail(debtId)` → `DebtDetail.payments: RecentFinancialPayment[]`
- Plan → `useInstallmentPlanDetail(planId)` → `InstallmentPlanDetail.payments: RecentFinancialPayment[]`

`RecentFinancialPayment` already carries `paymentDate`, `totalAmount`, `paymentMethod`, `reference`, `notes`, `createdAt`, `createdBy`, `voidedAt`, `voidReason`, `voidedBy`, `allocations[]` — every field the requirement asks for.

## 6. Filter design

Two visual tiers instead of one flat block.

**Tier 1 (always visible, one row):**
- Segmented type control: `Debts` · `Plans` · `Overdue` · `Payments`. (See §13 for the combined "All" case.)
- Search input, `Name or phone`, debounced 300ms.
- `Include completed` checkbox — promoted to tier 1, right-aligned, with helper text `Paid debts and completed plans are hidden by default.`
- `Clear filters` text button, shown only when `hasActiveFilters(filters)` is true.

**Tier 2 (collapsible `More filters`, closed by default):**
- Status select, Due from / Due to, `Include cancelled`, `Corrected records`.
- When collapsed but active, show a count chip: `More filters (2)`.

Fixes to apply:
- Remove the tab→status coupling. The `Overdue` tab sends `type=OVERDUE` only; it does not overwrite `status`.
- Keep the `status=CANCELLED` → `includeCancelled=true` coupling but surface it (auto-check the visible checkbox so state is not hidden).
- Every filter change resets `page: 1` (already done in `setFilter`, preserve it).

## 7. Include completed behavior

Already correct at the contract level — do not rebuild it:

- Frontend default is `includeCompleted: false` (`LedgerPage.tsx`, `ledger-query.ts`).
- Backend validator defaults it to `false` and the service excludes completed records via `!query.includeCompleted && status !== 'PAID_COMPLETED' && type !== 'PAYMENT'`.

Remaining work is **presentation only**:

1. Move the checkbox to tier 1 with the helper text above.
2. When unchecked and results exist, show a quiet footer line under the table: `Completed debts and plans are hidden. Include completed to show them.`
3. When unchecked and the result set is empty, `LedgerEmptyState` must offer `Include completed` as a one-click action rather than only saying "no records".
4. Keep `Include completed` and `Include cancelled` as two independent checkboxes — never merge, never let one imply the other.

Default view therefore shows: unpaid / partially paid / overdue debts, active and overdue plans. Hidden: paid debts, completed plans, cancelled records.

## 8. Status and badge design

Reuse `FinancialStatusBadge` — do not fork it. One badge per row, in the Status column only.

Palette intent (soft, ring-based, matching current style):
- Active / Unpaid → slate
- Partially paid → blue
- Overdue → red
- Paid / Completed → emerald
- Cancelled → amber, plus muted row text

Secondary chips (`Corrected`, `Voided`) stay small and live next to the description / inside the child row respectively — never in the Status column. Maximum two chips visible per row.

Statuses come from `item.status` (backend-derived). Never recompute overdue on the client from dates. `storedStatus` is not surfaced in the table; it belongs in the details modal.

## 9. Actions design

Replace the `<details>` menu with a controlled dropdown (button + `aria-expanded` + `aria-haspopup="menu"` + outside-click and Escape close + arrow-key navigation). One menu open at a time.

Debt: `View details` · `Record payment` (if `canRecordDebtPayment`) · `Cancel debt` (if `canCancelDebt`) · `Correct…` (admin, see below).
Plan: `View details` · `Record payment` (if `canRecordInstallmentPlanPayment`) · `Cancel plan` (if `canCancelInstallmentPlan`) · `Correct…` (admin).
Payment (only in the Payments tab): `Void payment` (admin, non-voided) · otherwise the `Immutable` hint.

Removals:
- Delete `EditDebtDialog` / `EditInstallmentPlanDialog` usage from `LedgerPage` and stop passing `onEditDebt` / `onEditPlan` into `DebtDetails` / `InstallmentPlanDetails`. No edit/delete anywhere on the Ledger.
- No new edit/delete inside Installment Plan Details.

Correction: since no correction dialog exists yet, **hide the `Correct…` item behind a single feature flag constant** (e.g. `LEDGER_CORRECTION_ENABLED = false`) rather than shipping today's fake action that just opens the details modal. When the Phase 12 correction workflow lands, flip the flag and point the item at that dialog — admin-only, password verification handled inside the correction workflow, never rendered as a plain edit button.

## 10. Payment grouping rules

1. A payment is rendered **once per parent it was allocated to**, inside that parent's expanded area. It is never rendered as a top-level row in an obligation view.
2. A payment with multiple allocations to the *same* plan (split across installments) renders as **one card** with an allocation breakdown. Never one card per installment.
3. A payment split across *different* parents (e.g. a debt and a plan) appears under each parent, but each card shows the amount allocated to *that* parent as the headline figure, with the payment's full total shown as `of {totalAmount} total`. This is attribution, not duplication.
4. Voided payments are shown, struck through, and are excluded from any displayed subtotal.
5. Standalone / unallocated payments are only reachable via the `Payments` tab, where payment rows are flat and non-expandable.
6. The expanded area never computes a total. If a payments subtotal is shown at all, it is the parent's backend `totalPaid`, labelled as such.

## 11. Data contract needed from current API

Available today, sufficient for everything above except one case:

| Need | Source | Status |
|---|---|---|
| Obligation rows + amounts + statuses | `GET /financial-ledger` items | OK |
| Backend totals | `summary.totalOutstanding`, `summary.totalPaid` (`basis: 'filtered'`) | OK — must be labelled "for current filters" |
| Hide completed by default | `includeCompleted` query param, default `false` | OK |
| Hide cancelled by default | `includeCancelled`, default `false` | OK |
| Payments per debt | `getDebtDetail(debtId).payments` | OK |
| Payments per plan | `getInstallmentPlanDetail(planId).payments` | OK |
| Payment fields (date, method, ref, notes, createdBy, voided, allocations) | `RecentFinancialPayment` | OK |
| **Combined debts+plans view without payment rows** | no such `type` value | **Gap — see §13** |

Money handling: all amounts arrive as strings and stay strings. Render through the existing `formatMoney`. No `Number()`, no `+`, no `toFixed` anywhere in Ledger components. No summing of page rows into a total.

## 12. Frontend components likely to change

- `LedgerTable.tsx` — split into `LedgerTable` (shell), `LedgerObligationRow`, `LedgerPaymentChildRows`, `LedgerPaymentRow` (payments tab), `LedgerRowActions`. The current single 358-line file is the main thing to break up.
- `LedgerFilters.tsx` — two-tier layout, promoted checkbox, clear button.
- `LedgerStates.tsx` — skeleton matching the new column count; empty state with an `Include completed` action.
- `LedgerSummaryCards.tsx` — add the "for current filters" caption.
- `LedgerPage.tsx` — remove edit dialogs, own the expansion state, keep modal wiring.
- New: `useLedgerRowPayments.ts` (thin wrapper over the two detail hooks, `enabled` only when expanded), `useExpandedRows.ts` (Set of `${type}-${id}`).
- New: `LedgerMobileCard.tsx` for the responsive path.
- `ledger-labels.ts` — labels for the new type segmentation and payment method display.

## 13. Backend changes only if truly required

**One real gap.** The default combined view (`type=ALL`) returns `PAYMENT` items as top-level rows, mixed into the same pagination and the same page count as obligations. With payments moved into child rows there is no correct way to render `ALL`:

- filtering payment items out on the client breaks `pagination.total` and produces short/empty pages;
- leaving them in reintroduces the duplication this redesign exists to remove.

Minimal additive fix — **one enum value**, no rewrite, no schema change, no migration:

`type=OBLIGATIONS` → debts + plans only, payments excluded from items, pagination and summary computed on that set.

Touches `financial-ledger.validator.ts` (enum), `financial-ledger.service.ts` (the same branch that already handles `type`), plus its tests and the Phase 9 API doc. Equivalent alternative if preferred: a boolean `includePaymentRows` defaulting to `true`.

**Frontend-only fallback if the backend must stay frozen:** drop the combined tab entirely and make `Debts` the default tab, with `Plans`, `Overdue`, `Payments` alongside. Fully correct, no backend work, but the user loses the single mixed worklist. Recommendation: take the one-line backend addition.

No other backend change is needed. Do not touch financial calculation logic.

## 14. Accessibility requirements

- Expand control is a real `<button>` with `aria-expanded`, `aria-controls={childRowId}`, and label `Show payments for {customer name} — {description}` / `Hide payments for …`.
- Chevron is `aria-hidden`; the accessible name comes from an `sr-only` span so it stays correct in both states.
- Child row container gets `id={childRowId}` and `role="region"` with `aria-label="Payments"`.
- Expanded content is removed from the DOM when collapsed (not `display:none`), so screen readers and tab order stay clean.
- Action menu: `aria-haspopup="menu"`, `role="menu"` / `role="menuitem"`, Escape closes and returns focus to the trigger, Up/Down move between items.
- Loading child rows announce via `aria-busy` on the region; errors use `role="alert"`.
- Money cells keep visible text (no icon-only meaning). Status is never conveyed by color alone — the badge always has text.
- Minimum 40×40px hit area on the chevron and kebab. Visible `focus-visible` ring on both (reuse the existing emerald ring classes).
- Table keeps `<caption class="sr-only">Financial ledger</caption>` and `scope="col"` on headers.

## 15. Responsive design plan

- **≥1280px (`xl`)**: full 10-column table as specified.
- **1024–1280px (`lg`)**: hide the `Paid` column (it is derivable from Amount − Remaining and is shown in the expanded area anyway). 9 columns.
- **768–1024px (`md`)**: hide `Type` (fold the plan progress under Description) and `Paid`. 8 columns. Still a table.
- **<768px**: switch to stacked cards, one per obligation — a real component swap, not a squeezed table. Card layout: customer name + status badge on line 1; description line 2; `Remaining` as the large figure with `Amount`/`Paid` small beneath; due date; a full-width `Payments (n)` disclosure that expands the same child content in a single-column stack; actions as a bottom-row kebab.
- Sticky table header on desktop (`sticky top-0 z-10 bg-slate-50`) so column meaning survives long pages.
- The table wrapper keeps `overflow-x-auto` as a safety net; the page body must never scroll horizontally.

## 16. Focused test plan

Extend `financial-ledger.components.test.tsx`; add one new file for the row component if it grows.

1. Default filters send `includeCompleted=false` and `includeCancelled=false` (assert on the built query params).
2. Checking `Include completed` sends `includeCompleted=true` and resets `page` to 1.
3. A completed debt is absent from the default render fixture and present when the flag is on.
4. Clicking the expand button renders the payment child region; `aria-expanded` flips false→true.
5. Collapsing removes the child region from the DOM.
6. Expanded state survives a data refetch (same row ids still expanded after the query resolves again).
7. A plan payment with three installment allocations renders exactly one payment card with three allocation lines.
8. A voided payment renders the `Voided` badge and is not counted anywhere.
9. Empty payments renders the "No payments recorded yet" copy, not a blank row.
10. Obligation rows expose no Edit or Delete action (negative assertion — guards the regression).
11. `Clear filters` restores defaults, including `includeCompleted: false`.
12. Summary cards render backend strings verbatim (no rounding, no recomputation).
13. Escape closes the action menu and returns focus to its trigger.

Run only the Ledger test files during development: `npx vitest run frontend/src/features/financial-ledger`.

## 17. Suggested implementation checkpoints

| CP | Work | Focused check |
|----|------|---------------|
| 1 | Confirm data shape; decide `OBLIGATIONS` vs frontend-only fallback (§13). No code. | — |
| 2 | Filters: two-tier layout, promote `Include completed`, add `Clear filters`, decouple tab↔status. | `npx vitest run frontend/src/features/financial-ledger` |
| 3 | Parent rows: new 10-column structure, split `LedgerTable.tsx`, remove edit dialogs and the fake `Correct record`. | `npm run typecheck:frontend` |
| 4 | Expansion: chevron, `useExpandedRows`, `useLedgerRowPayments` lazy fetch, child row shell + a11y. | ledger tests |
| 5 | Payment grouping rules (§10), allocation rendering, voided handling, no duplication. | ledger tests |
| 6 | Responsive breakpoints, mobile cards, skeletons, empty and error states, sticky header. | manual pass + `npm run typecheck:frontend` |
| 7 | Add the focused Ledger tests from §16. | `npx vitest run frontend/src/features/financial-ledger` |
| 8 | Final verification, once: `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`, `npm run prisma:validate`. | — |

Do not run full verification between checkpoints.

## 18. Exact files likely to change

Frontend:

- `frontend/src/pages/LedgerPage.tsx`
- `frontend/src/features/financial-ledger/components/LedgerTable.tsx`
- `frontend/src/features/financial-ledger/components/LedgerFilters.tsx`
- `frontend/src/features/financial-ledger/components/LedgerStates.tsx`
- `frontend/src/features/financial-ledger/components/LedgerSummaryCards.tsx`
- `frontend/src/features/financial-ledger/components/financial-ledger.components.test.tsx`
- `frontend/src/features/financial-ledger/utils/ledger-labels.ts`
- `frontend/src/features/financial-ledger/types/financial-ledger.types.ts` (only if `OBLIGATIONS` is added)
- `frontend/src/features/financial-ledger/utils/ledger-query.ts` (only if `OBLIGATIONS` is added)

New frontend files:

- `frontend/src/features/financial-ledger/components/LedgerObligationRow.tsx`
- `frontend/src/features/financial-ledger/components/LedgerPaymentChildRows.tsx`
- `frontend/src/features/financial-ledger/components/LedgerRowActions.tsx`
- `frontend/src/features/financial-ledger/components/LedgerMobileCard.tsx`
- `frontend/src/features/financial-ledger/hooks/useExpandedRows.ts`
- `frontend/src/features/financial-ledger/hooks/useLedgerRowPayments.ts`

Backend — only if §13 is approved:

- `backend/src/features/financial/ledger/financial-ledger.validator.ts`
- `backend/src/features/financial/ledger/financial-ledger.service.ts`
- `backend/src/features/financial/ledger/financial-ledger.service.test.ts`
- `docs/PHASE_9_UNIFIED_FINANCIAL_LEDGER_API.md`

Unchanged on purpose: all financial calculation logic, Prisma schema, `customer-financial` detail endpoints and dialogs (reused as-is).
