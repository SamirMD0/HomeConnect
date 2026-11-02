# Smart customer import: design

Date: 2026-11-02. Status: awaiting owner approval.

## Why

The shop re-imports customer balances from its accounting export. Today a second import blocks any row whose customer already has an imported debt, so a balance moving from $200 to $100 goes unnoticed and has to be entered by hand. The owner wants the import to notice balance changes and apply them, send each customer to the right branch, ask for a due date instead of silently using today, and stop showing Arabic in the Customers section.

## Goals

1. On import, compare each matched customer's file balance with what they owe in HomeConnect now, show the difference, and apply it on confirmation.
2. Choose a branch per customer, not per file.
3. Require a due date whenever the import creates a debt and the file gives none.
4. English-only labels in the Customers section.

## Non-goals

- Credit balances from the trial balance stay invalid rows, as today.
- A customer missing from the file is left unchanged. Absence does not prove payment.
- Moving an existing customer between branches. A row targets the customer in its chosen branch; the existing admin transfer feature moves customers.
- Automatic currency conversion between a file balance and debts in another currency.

## Must not happen

- Money changes without the owner seeing them first in the preview.
- A file with no balance information wiping debts. An unmapped balance column or a blank balance cell means "no information", never zero. Only an explicit `0` means paid in full.
- An older file undoing payments taken in HomeConnect. See "Stale files".
- A customer's debt in the preview disagreeing with the customer profile for the same customer.

## Owner decisions

- A confirmed balance change is applied, not just reported.
- A lower balance is a real payment and counts in cash flow on the import date.
- Branch is chosen per customer.

## Balance changes

**Compared amount:** the customer's outstanding standard debts plus installment plan balances in the row's currency, in the row's chosen branch. Cancelled debts and prepaid purchases are excluded. Use the same domain calculators as the customer financial summary, and test that the two agree. Load balances in one batched query, since a file can have 2,000 rows.

| File vs HomeConnect | On confirm |
|---|---|
| New customer, balance above 0 | Create customer and debt (as today) |
| Equal | No money change; other selected fields may still update |
| Higher | New debt for the difference only |
| Lower | Payments for the difference, oldest due first; `0` pays everything |
| Customer has open debt in another currency | Flagged; no money change on this row |
| Balance column unmapped or cell blank | No money change |

**Payments:** method `OTHER`, payment date is the import date, reference names the import file, one payment per debt or installment reached, using the existing recording paths so statuses, allocations and activity logs stay correct. Idempotency key `customer-import:<importId>:<rowNumber>:<targetId>`, which also makes each payment traceable to its import. Voidable like any payment.

**Debts:** kept as today: description `Opening balance — import <file>` for a first debt, `Balance increase — import <file>` for a difference, with `sourceCustomerImportId` set. This replaces the `OPENING_DEBT` blocking conflict and the check in commit that rejects a second imported debt.

**Stale files:** a file older than a payment taken in HomeConnect looks like an increase and would re-add money already collected. So:
- A row with a higher balance, where the customer has a payment or new debt recorded since their last import, defaults to no money change and shows "Activity since last import; check that this file is newer". The owner can still apply it.
- A file already imported into that branch keeps its existing default of SKIP.

**Review:** changed rows sort first in the Resolve step and show "Owes $200 now, file says $100, change −$100". Each has a checkbox for applying the change (default on, except the stale case). The confirm step shows counts and USD totals for new debts, increases and payments. Result and downloadable report include the same. The existing account password prompt now covers any money change, not only opening debts.

## Branch per customer

- Step 1 becomes "Default branch". A new optional mapped column, Branch, accepts a branch code or name. An unrecognized value makes the row invalid.
- Each row has a branch selector in the preview, plus "Set all rows to" for bulk changes.
- Initial branch for a row, first match wins: the Branch column; the single branch where its account number or phone already exists; the default branch. If it exists in several branches and the default is not one of them, the row is a conflict until a branch is chosen.
- Matching, conflicts and balance comparison all use the row's chosen branch and recompute when it changes. Other branches remain non-blocking hints.
- Duplicate checks are per branch: the same phone or account in two different branches is allowed, because branches keep separate customers.
- Each row's branch must be active and accessible, rechecked at commit. Admin only, as today.

**Storage:** `customer_import_accounts` has a composite foreign key to `customer_imports(id, branchId)`, so an import record can only own accounts in its own branch. At commit, the draft keeps the rows for its own branch, and one extra committed `customer_imports` record is created for each other branch used, with the same file name and hash and only that branch's rows. Debts and account links point at their branch's record. The draft's `result` holds the combined summary and child ids. This needs no database migration, and the "file already imported" check keeps working per branch. A retried commit still returns the stored result.

The commit must set branch context per row. Check whether `DebtsRepository.createDebt`, `recordDebtPayment` and the installment payment path take branch from the customer or from an ambient scope.

## Due date

- A date field appears at the Confirm step when at least one row with no file due date will create a debt. Continue stays disabled until it is filled.
- A valid date in the file wins for that row. Past dates are allowed, and those debts show as overdue.
- The today default is removed from commit; a missing date there is a validation error.
- Payments don't use it.

## Arabic

Remove Arabic text from `CustomersListPage`, `CustomerProfilePage`, `CustomerForm`, `CustomerPicker` and `CustomerBranchTransferDialog`. `business-labels.ts` is shared across the app, so labels used outside customers stay as they are, and the customer pages get English-only values. Keep: customers' Arabic names, `arabic-normalize.ts` search, and Arabic header and yes/no aliases in the import parser, since real files use them. The import dialog itself has no Arabic text today, only `dir="auto"` for names, which stays.

## Release impact

No database migration. Unrelated to this work: `feature/admin-password-only-settings` is unmerged and would need its import prompt reconsidered, since money changes now go through that prompt.

## Tests

Targeted suites per checkpoint, run with `--no-file-parallelism` against the test database; full `test:ci` only before merge. Must cover: each row of the balance table; blank versus `0`; stale-file default; payments oldest first across debts and installments; cash flow includes the `OTHER` payments; preview agreeing with the financial summary; mixed-branch commit creating child records with valid foreign keys; retried commit; stale fingerprint when a balance changes between preview and commit; required due date.

## Left to the builder

Wizard layout details, label wording, report column order, and how the branch selector is laid out in the table.
