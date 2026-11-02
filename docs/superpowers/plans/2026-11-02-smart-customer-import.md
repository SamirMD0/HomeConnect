# Smart Customer Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-imports notice and apply balance changes, each customer gets their own branch, a due date is required for new debts, and the Customers section is English-only.

**Architecture:** A new `customer-import-balance.ts` loads open obligations in one batch and classifies each row. Payment recording is split so it can join the import's transaction. Row branches live in the draft document, not in commit input, and commit creates one extra import record per extra branch to satisfy the composite foreign keys.

**Tech Stack:** Express, Prisma, PostgreSQL, Zod, React, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-02-smart-customer-import-design.md`

## Global Constraints

- No database migration.
- Blank balance cell or unmapped balance column means no information, never zero.
- Lower balance: payment method `OTHER`, dated the import date, reference names the file.
- Idempotency key `customer-import:<importId>:<rowNumber>:<targetId>` must stay within the 128-character limit.
- Never run tests against `homeconnect`. DB tests use `--no-file-parallelism`. Commit only when the owner asks.

## Review Focus

1. A customer with both a USD and an LBP debt, with a USD file row: flagged, no money change.
2. A file with an empty balance cell for a customer who owes money: no change, no payment.
3. Lower balance reaching across a debt and an installment plan: oldest first, totals exact.
4. All rows moved away from the default branch: draft still commits and child records hold the effects.
5. An existing customer changed row branch after the decision was saved: the old UPDATE target is discarded.

---

### Task 1: Payments that join a transaction

**Files:** Modify `backend/src/features/financial/debts/debts.service.ts`, `backend/src/features/financial/installment-plans/installment-plans.service.ts`. Test: existing payment suites.

**Produces:**
- `DebtsService.recordDebtPaymentInTransaction(tx, debtId, input, user, scope): Promise<DebtView>`
- `InstallmentPlansService.recordPlanPaymentInTransaction(tx, planId, input, user, scope): Promise<InstallmentPlanView>`

- [ ] Move each transaction body into the new method with no behavior change; the public method calls `writeBranch`, then wraps it in `runFinancialTransaction`.
- [ ] Run the debts and installment suites. Expected: PASS.

### Task 2: Balance classification

**Files:** Create `backend/src/features/customers/customer-import-balance.ts`, `customer-import-balance.test.ts`. Modify `customer-import.parser.ts`.

**Produces:**
- Parser row field `hasBalance: boolean`; field `branch` (aliases `branch`, `الفرع`, `فرع`) and row value `branchValue`.
- `loadCustomerObligations(customerIds, tx): Map<customerId, CustomerBalanceState>`, with `obligations: OpenObligation[]` oldest due first and `activitySinceLastImport: boolean`.
- `classifyBalance(row, state | undefined): BalanceChange`, where `kind` is `NEW | NONE | NO_INFO | INCREASE | DECREASE | CURRENCY_MISMATCH` and `current`, `file`, `difference` are money strings.
- `planBalancePayments(obligations, amount): Array<{ kind: 'DEBT' | 'PLAN', id, amount }>`

Rules: `NEW` means no open obligations and file above 0; `current` uses the same calculators as the customer summary, excluding cancelled and prepaid.

- [ ] Write failing unit tests: each kind, blank versus `0`, oldest-first allocation and exact totals, mixed currency.
- [ ] Implement, and run. Expected: PASS.

### Task 3: Service preview, commit and branch per row

**Files:** Modify `customer-import.service.ts`, `customer-import.validator.ts`, `customer-import-db.integration.test.ts`.

**Produces:**
- PATCH input `rowBranches: Array<{ rowNumber, branchId }>`, stored as `document.rowBranches`; changing a row's branch drops its saved decision; a new mapping clears them.
- Commit input `dueDate?: YYYY-MM-DD`.
- Preview row adds `branchId`, `branchName`, `balance`; preview adds `branches`, `planned.dueDateRequired`, and result fields `balanceIncreases`, `balanceIncreaseTotalUsd`, `balancePayments`, `balancePaymentTotalUsd`.
- Conflicts: `BRANCH_AMBIGUOUS` blocking; `BALANCE_CURRENCY`, `BALANCE_ACTIVITY` non-blocking; `OPENING_DEBT` removed.
- `skipOpeningBalance` now means "make no money change on this row". Defaults true when `INCREASE` has activity since last import.

- [ ] Write failing DB tests: each balance table row, stale-file default, summary agrees after payment, `OTHER` payment in cash flow, mixed-branch commit with child records, retried commit, balance changed between preview and commit is stale, required due date, the Review Focus cases.
- [ ] Implement branch resolution, per-branch matching and duplicates, balance apply, child records. Update existing tests that encode the old block.
- [ ] Run `customer-import` suites with `--no-file-parallelism` on the test DB. Expected: PASS.

### Task 4: Import dialog

**Files:** Modify `frontend/.../api/customer-import.api.ts`, `components/CustomerCsvImportDialog.tsx`, `customer-import-dialog.components.test.tsx`.

- [ ] Write failing tests: branch selector per row and "Set all rows to"; "Owes $200 now, file says $100"; changed rows first; due date required at Confirm when `planned.dueDateRequired`; password for any money change.
- [ ] Implement. Changing a branch PATCHes current decisions plus `rowBranches` and replaces the preview.
- [ ] Run the suite and typecheck. Expected: PASS.

### Task 5: English-only Customers section

**Files:** `frontend/src/shared/labels/business-labels.ts` (add `englishLabel`), Customers pages and components in the spec, with their tests.

- [ ] Replace Arabic in those files; use `englishLabel(...)` for shared labels. Keep names, search normalization and parser aliases.
- [ ] Run customer suites. Expected: PASS, with no Arabic in those files other than test data for names.

### Task 6: Verify

- [ ] Run `test:ci`-style targeted suites, frontend typecheck and backend typecheck.
- [ ] `graphify update .`
