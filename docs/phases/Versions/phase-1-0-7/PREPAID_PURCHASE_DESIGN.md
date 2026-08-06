# Prepaid Purchase Design

> **Updated 2026-07-30.** The admin-debt formula changed and prepaid moved out of
> the Ledger into its own section. See `claude/plans/prepaid-purchases-section-plan.md`.

## Business Meaning

A prepaid purchase records an item reserved for a customer before delivery. The customer pays an initial amount and pays the remaining balance later.

Example:

- Item: Air conditioner
- Full amount: `400.00`
- Initial payment: `100.00`
- Admin debt: `-100.00` (the cash being held)
- Remaining to collect: `300.00`

## Accounting Model

Prepaid purchases reuse the existing immutable debt, payment, and payment-allocation foundation. `Debt.kind` distinguishes `PREPAID_PURCHASE` from `STANDARD` debt. A companion `PrepaidPurchase` row carries delivery state; the debt, payment, and allocation rows are never rewritten.

Creation is atomic: the obligation, cash payment, allocation, and companion row either all succeed or all roll back. The remaining balance is always calculated from valid, non-voided allocations.

Prepaid purchases are not customer receivables. **Admin debt is the money the business is holding on the customer's behalf — the amount PAID, not the amount still outstanding.** It is the refund owed if the customer walks away. For a `400.00` item with a `100.00` payment, the admin debt is `-100.00`.

Admin debt is non-zero only while the item is awaiting delivery. Once delivered the goods have changed hands and the cash is earned, so it drops to `0.00`; a cancelled record owes nothing.

Delivering an item that is not fully paid closes the prepaid and creates a `STANDARD` debt for the unpaid remainder, with a real due date. That debt is a genuine receivable: it ages and can become overdue.

Prepaid purchases do not contribute to customer outstanding totals, Accounts Receivable standing, dashboard outstanding totals, or standard debt counts. They are **excluded from the global Ledger** and live in the Prepaid Purchases section, while remaining visible on the customer profile. They never become overdue and do not appear as upcoming due items.

## Safety Rules

- Item name, full amount, and initial payment are required.
- Initial payment must be positive and cannot exceed the full amount.
- Money uses decimal/cents helpers, never floating-point arithmetic.
- Later payments use the existing debt payment workflow.
- Corrections, voids, cancellation restrictions, and audit history remain unchanged.
- Existing debt rows default to `STANDARD` during migration.
- Delivery requires a due date for the remainder whenever money is still outstanding.
- Reverting a delivery is ADMIN-only, needs account password and reason, and is blocked once any payment has been collected against the remainder debt.
- Reverting cancels the remainder debt rather than deleting it, preserving history.

## User Interface

The Add Financial Obligation flow includes `Prepaid Purchase / شراء بالدفع المسبق`.

The form contains:

- Item name
- Full amount
- Payment
- Calculated read-only admin debt shown as a negative amount

The Prepaid Purchases page (`/prepaid`) lists every record with customer, item, full price, paid, admin debt (negative), remaining, and status (`Prepaid / مدفوع مسبقاً`, `Delivered / تم التسليم`, `Cancelled / ملغى`). Default view is awaiting-delivery, newest first. Summary totals are backend-authoritative and cover the whole filtered set, never the current page.
- Notes

Customer and ledger views label the record as prepaid/reserved and show its admin debt as a negative amount instead of showing it as customer debt.
