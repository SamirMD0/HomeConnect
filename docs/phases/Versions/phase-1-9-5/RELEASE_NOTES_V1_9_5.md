# HomeConnect v1.9.5 — Paid, Part-Paid, and Unpaid Supplier Bills

## What this release adds

A supplier bill can now be recorded as unpaid, partially paid, or paid in full in one step. It
also fixes the session ending far sooner than intended, which signed operators out mid-shift.

## Payment on a supplier purchase

Recording a purchase and then recording its payment were two separate actions through two entry
points that overlapped. The purchase form now carries the payment.

- Three states, defaulting to **Unpaid — on account / غير مدفوعة — على الحساب**, so a payment is
  never recorded by accident.
- **Partially paid / مدفوعة جزئيًا** takes the amount settled now.
- **Paid in full / مدفوعة بالكامل** follows the bill total, including an adjusted total.
- An optional payment reference records how it was paid.
- A live summary shows the bill total, what was paid, and what is still owed.

### The debt always records what was billed

Anything settled is posted as a **separate supplier payment**, not as a smaller debt. A 630.00 bill
paid 200.00 writes two rows:

| Type | Direction | Amount |
|---|---|---|
| `SUPPLIER_DEBT` | `INCREASE_OWED` | 630.00 |
| `SUPPLIER_PAYMENT` | `DECREASE_OWED` | 200.00 |

Reducing the debt instead would erase what the invoice actually said. The balance is still
`sum(increases) − sum(decreases)`, so no ledger rule changed: this writes an ordinary payment the
existing engine already understands, and it needs no migration because both rows carry the same
receipt number.

Guards: the paid amount may not exceed the total, it is measured against an overridden total rather
than the line sum, and the payment row never carries the receiving link — the database permits that
link only on a debt.

**Add Transaction** keeps its own purpose: a standalone payment against an earlier bill, a credit,
or an adjustment. The supplier profile now says which to use for what.

## Session length

The app returned to the login screen far too often. Two independent clocks were both set to fifteen
minutes, and the shorter of them ended the session:

- Access tokens expired after 15 minutes by default.
- The frontend signed the operator out after 15 minutes of inactivity.

Both are now one hour. The refresh window is unchanged at seven days.

The token default matters more than it appears: `backend/.env` is excluded from the installer, so
the value compiled into the server is what every installed copy actually runs on, whatever a
developer machine has configured.

### Scrolling now counts as activity

Inactivity was also detected incorrectly. Scroll events raised inside a table or dialog never reach
the window, so reading a long ledger by mouse wheel looked identical to being away from the counter,
and the timer ran down while the screen was in active use.

Activity listeners now include `wheel` and run in the capture phase, so scrolling anywhere counts.
They are registered passively, so nothing about scrolling is slowed.

## Database migration

None. This release changes no schema.
