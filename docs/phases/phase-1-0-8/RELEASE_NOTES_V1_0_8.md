# HomeConnect v1.0.8 — Release Notes

**Scope decision:** v1.0.8 ships **Supplier Management + Supplier Ledger** *and*
**Prepaid Purchase delivery** together. The two features share changes in the
same files (schema, app routing, navigation, shared labels), so splitting them
would require hunk-level surgery and a migration rollback on an already-upgraded
machine. They are released as one version.

---

## Read this first — one number changes on screen

Prepaid "admin debt" now means **the cash the business is holding**, not the
unpaid remainder.

| Example | Before v1.0.8 | From v1.0.8 |
|---|---|---|
| 400 item, 200 paid | −200.00 | −200.00 *(unchanged)* |
| 400 item, 100 paid | −300.00 | **−100.00** |
| 400 item, 400 paid | 0.00 | **−400.00** |

The new figure is the **refund amount**: if the customer walks away, that is what
you hand back. The old figure was measuring what the customer still owed and
displaying it with a minus sign, which is a different quantity and not a
liability.

Nothing was recalculated in the database — this value has always been computed at
read time. The old number has not been lost: it is now shown in its own
**Remaining / المتبقي** column, correctly labelled.

Admin debt is non-zero only while an item is awaiting delivery. Once delivered,
the goods have changed hands and the cash is earned, so it drops to `0.00`.

---

## New — Suppliers

- **Suppliers / المورّدين** (`/suppliers`): add, edit, archive, restore, search by
  name, phone, or company. Supplier profile shows contact details, totals, and
  transaction history.
- **Supplier Ledger / دفتر حسابات المورّدين** (`/supplier-ledger`): every supplier
  movement in one filterable table.
- Four transaction types: Supplier Debt, Payment to Supplier, Supplier Credit,
  Adjustment. Amounts are always positive; an explicit direction
  (`INCREASE_OWED` / `DECREASE_OWED`) carries the sign.
- Balances are computed by the backend in SQL over the whole filtered set, never
  from the visible page.
- Admin password + reason required for: transaction edit/remove/restore, supplier
  name or phone change, archive, restore, and delete. Every one writes an audit
  row with before/after values and the balance before and after.
- Suppliers with transactions can only be **archived**. Hard delete is possible
  only for a supplier with zero transactions, and still needs password + reason.
- Supplier transactions are **never hard deleted** — "Remove / إزالة" is a soft
  removal that drops out of the balance and returns under the *Include removed*
  filter.

## New — Prepaid Purchase delivery

- **Prepaid / المدفوع مسبقاً** (`/prepaid`): every prepaid item with customer,
  full price, paid, amount owed, remaining, and status.
- Two states: **Prepaid / مدفوع مسبقاً** (awaiting delivery) and
  **Delivered / تم التسليم**.
- **Mark Delivered** closes the prepaid. If money is still outstanding, it
  creates a normal `STANDARD` debt for the remainder with a real due date — that
  debt then appears in Accounts Receivable and can become overdue.
- **Revert Delivery** (admin, password + reason) undoes a misclick. It cancels
  the remainder debt rather than deleting it, and is blocked once any payment has
  been collected against that debt.

## Changed — the global Ledger

Prepaid purchases no longer appear on the **Ledger** page; they live in their own
section. Consequences:

- The Ledger summary no longer shows the two prepaid cards.
- The Ledger type filter no longer offers "Pre-paid"; requesting
  `type=PREPAID_PURCHASE` now returns 400.
- Debts, installment plans, payments, and Accounts Receivable are **unchanged**.
- Prepaid records remain visible on the customer's own profile.

---

## Upgrading

### Migrations applied by this release

```
20260729090000_add_service_and_product          (v1.0.7 work, first release)
20260729180000_add_prepaid_purchase_kind        (v1.0.7 work, first release)
20260730120000_add_suppliers_and_supplier_ledger
20260731090000_add_prepaid_purchase_delivery
```

Apply with `npx prisma migrate deploy`. `20260731090000` requires **PostgreSQL 12
or newer** (`ALTER TYPE ... ADD VALUE`).

### After upgrading — one manual step

Delivery was never recorded before v1.0.8, so **every existing prepaid record is
backfilled as awaiting delivery**. Any item already handed to a customer must be
marked delivered once from the Prepaid screen. Nothing is lost by leaving them —
they simply overstate what the business owes until corrected.

### If a migration cannot be applied

`release/v1.0.8/` contains two optional, emergency-only repair scripts and a
`README.md` explaining which covers what. Both are additive and idempotent, and
neither drops, truncates, or deletes business data. Prefer `prisma migrate
deploy` whenever migration history is healthy.

---

## Notes

- Supplier dashboard cards were deferred. Supplier liabilities stay in the
  Supplier Ledger rather than being mixed into customer outstanding totals.
- Customer Ledger and Supplier Ledger remain separate screens and separate
  endpoints: one is money owed to you, the other money you owe.
