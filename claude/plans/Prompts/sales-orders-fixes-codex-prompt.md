# Codex Fix Prompt — Sales Orders Review Findings

Copy everything below the line into Codex.

---

You are fixing review findings in the **HomeConnect** repository. The Sales Orders feature is already built and working — this is a targeted correction pass, not a redesign.

## Context

Read `claude/plans/sales-orders-plan.md` §7.2 (the ledger connection) before starting. The build prompt `claude/plans/Prompts/sales-orders-codex-prompt.md` still applies in full: Decimal money, API strings, backend-authoritative totals, audit inside the transaction, no stock writes, UI primitives, relative imports, no new dependencies.

**Three deviations from the plan are approved by the owner. Do not revert them:**

- A fully-paid order may be saved without a customer when the actor is an admin.
- Payment is the first wizard step, not the customer.
- The discount field is removed from the UI while remaining live in the schema and API.

Five findings, in priority order. **F1 is the blocker** — it breaks the invariant the whole feature rests on.

---

## F1 — Item and delivery-fee edits create unpaid money that never reaches the ledger

`backend/src/features/sales/sales-orders/sales-orders.service.ts:581`

`recalculateOrder` recomputes totals and `paymentStatus` but never requires `debtDueDate`, never calls `createAndLinkDebt`, and never calls `validateCustomerRequirement`. `create` (line 94) and `changePayment` (line 328) do all three. So `addItem`, `updateItem`, `removeItem`, and `update`'s `deliveryFee` path can all leave an order owing money with no debt on the ledger — and, for a customerless order, with nobody attached to the balance.

Reproduce it before you fix it, as a failing test:

1. Admin saves a $450 shop-direct order, paid in full, no customer. → `PAID`, `settlement NONE`, no debt.
2. `POST /sales-orders/:id/items` adds a $200 line.
3. Order becomes `PARTIALLY_PAID`, `remainingAmount 200.00`, still no debt, still no customer.

### Required fix

Extend `recalculateOrder` into the shared post-mutation path that every total-changing endpoint uses. After recomputing totals it must, in the same transaction and in this order:

1. `validateCustomerRequirement(order.customerId, totals.remainingAmount)` — a remainder always needs a customer, regardless of who is acting. Admins may omit a customer only while the order is fully paid.
2. If `remainingAmount > 0` **and** `fulfillmentStatus !== DRAFT` **and** the order has no financial link yet: require `debtDueDate` on the request and call `createAndLinkDebt` with it. Same validation as `changePayment` — required when a balance remains, rejected when the order is paid in full, never before `orderDate`.
3. Persist, then audit as today.

`debtDueDate` therefore becomes an accepted field on the add-item, update-item, remove-item, and order-update payloads. It is required only in the case above; reject it otherwise, do not ignore it.

Two consequences to expect rather than "fix":

- Once an item edit creates a debt, `assertNoFinancialLink` freezes further item edits on that order. That is existing, correct behaviour — the ledger owns the balance from that point.
- Adding an item to a fully-paid customerless order now fails until a customer is supplied. That is the point: money owed needs someone who owes it.

Tests to add: one per entry point (`addItem`, `updateItem`, `removeItem`, `update`-with-`deliveryFee`) asserting that a recalc producing a remainder creates exactly one `Debt` for the new remaining amount, and asserting a 400 when `debtDueDate` is missing. Plus one asserting a customerless order rejects the edit.

---

## F2 — The ledger row contradicts itself

`backend/src/features/financial/ledger/financial-ledger.service.ts:203`, `frontend/src/features/financial-ledger/components/LedgerObligationRow.tsx:220`

A debt created from a partly-paid sale shows: original $270, paid **$0.00**, remaining **$270**, badge **Partially Paid**, progress **Partial**. Every number says untouched, the badge says partly paid. The badge is reporting the *order's* state on the *debt's* row.

`displayStatus` itself is the right mechanism — keep it. Make the row explicable instead:

- Add the sale's counter deposit to the ledger debt item (select `salesOrder.paidAmount` alongside `paymentStatus`) and expose it as a money **string**, e.g. `saleDepositAmount: string | null`.
- Render it on the row and the mobile card as context — "Deposit at sale: $180.00" — so "Partially Paid" has a visible cause.

**Hard constraint:** the deposit is not a payment against this debt. It must not be added to `totalPaid`, subtracted from `remainingBalance`, included in any collections or outstanding aggregate, or turned into a `Payment` or `PaymentAllocation` row. It is display context only. Add a test asserting `totalPaid` and `remainingBalance` are unchanged when a deposit is present.

---

## F3 — The repair SQL only exists in a gitignored directory

`release/1.1.4/1.1.4-repair.sql` is ignored by `.gitignore:4`. A clean clone loses the shop's upgrade script.

Copy it byte-identically to `backend/prisma/repair/1.1.4-repair.sql` and keep the release-folder copy for the USB hand-off. Do not modify the SQL — it is correct as written (idempotent guards, `_prisma_migrations` bookkeeping, closing verification query).

Do not bump the version and do not build an installer.

---

## F4 — `createDebt` reads the customer outside the caller's transaction

`backend/src/features/financial/debts/debts.service.ts:194`

`DebtsRepository.findActiveCustomerById(customerId)` does not receive `tx`, so inside a sales transaction the existence check runs on a different connection: it cannot see uncommitted state and races a concurrent soft-delete. Thread `tx` through, matching the pattern already used two lines below for `DebtsRepository.createDebt`. Behaviour with `tx` omitted must not change, and the existing financial tests must pass untouched.

---

## F5 — Order-time debt links produce no `LINK_DEBT` audit row

`backend/src/features/sales/sales-orders/sales-orders.service.ts:102`

Creating an order with a balance writes only a `CREATE` audit. The standalone endpoint writes `LINK_DEBT`. No data is lost — `orderSnapshot` carries `debtId` — but a history query filtered on `LINK_DEBT` misses every debt created at order time.

When `create` links a debt, write the `LINK_DEBT` row too, in the same transaction, with the same reason format as line 422. Same for any debt F1 causes to be created. Test: an order created with a balance produces both audit actions.

---

## F6 — Mark the discount field as reserved

The discount input is gone from the UI but the field is still live in the schema, validator, API types, and the wizard's preview calculation, permanently receiving `'0.00'`. This is approved. Add a one-line comment at the schema field and at `SalesOrderItem.discountAmount` in the API types saying it is retained for a future per-line discount and is currently always zero from the UI. No behaviour change.

---

## Do not

- Do not revert the three approved deviations listed at the top.
- Do not create a `Payment` or `PaymentAllocation` for counter cash, and do not let the deposit touch any balance or aggregate.
- Do not modify existing tests to make them pass — extend them.
- Do not change the repair SQL, bump the version, or generate an installer.
- Do not widen the scope: no new endpoints, no schema changes beyond a comment, nothing from the plan's §18 out-of-scope list.

## Verification

Run the focused tests as you go. At the end, run the full suite once:

```
npm run lint
npm run typecheck
npm test
npm run build
npm run prisma:validate
```

All five must pass. Report the real output. If something fails, fix the cause — do not skip or weaken a test.

Manual check a human must still run, listed as outstanding in your report: add an item to a fully-paid order and confirm the resulting debt appears on the ledger exactly once, for the added amount only.

## Reporting

For each finding: what you changed, which tests now cover it, and whether the fix behaved as the finding predicted. If a finding turns out to be wrong or already handled elsewhere, say so with evidence rather than making a change to be safe.
