# Inventory v1.9.1 — Supplier Receiving

**Status:** CP-1913 database foundation implemented; awaiting review. No backend workflow, frontend, build, version bump, or commit.
**Created:** 2026-08-13
**Design finalised:** 2026-08-14
**Predecessors:**
`claude/plans/inventory-management-plan.md` (v1.8.0 — manual stock movement ledger)
`claude/plans/inventory-v1.9.0-document-linked-movements-plan.md` (v1.9.0 — sales deduction and restoration)
**Baseline:** repository at v1.9.0
**Companion build prompt:** `claude/prompts/codex-inventory-v1.9.1-build.md`

---

## 0. One-paragraph summary

v1.8.0 made the stock number trustworthy. v1.9.0 connected it to the document that takes goods
**out** — the sales order. v1.9.1 connects the document that puts goods **in**. A user records what
physically arrived from a supplier, presses **Receive Stock / إدخال إلى المخزون**, and the ledger
gains one `PURCHASE_RECEIPT` movement per line. The receiving document may name a supplier, but it
does not touch the supplier ledger: no payable, no balance change, no transaction row. Receiving
goods and owing money for them are two separate facts, recorded on two separate screens, by two
separate deliberate acts.

---

## 1. Why `SupplierTransaction` is not the hook

This is the decision that shapes the release, and it was settled during v1.9.0 planning.

`SupplierTransaction` carries `type`, `direction`, `amount`, `transactionDate`, `description`,
`reference`, `notes`, `status`. It carries **no product and no quantity**. Three consequences:

1. **Deriving stock from it would re-trust the client.** The whole point of a document-linked
   movement is that the server owns the product and the quantity. A supplier transaction cannot
   supply either, so the browser would have to — which is exactly the property v1.9.0 removed.
2. **It is mutable and soft-removable.** `SupplierTransactionStatus` has `REMOVED`, and update /
   remove / restore endpoints exist. Coupling stock to it implies stock reversal on a financial
   edit — precisely the "ERP magic" both prior releases refuse.
3. **It is a financial ledger.** Every write is ADMIN-gated. Creation currently has no account
   password; update, remove, and restore do. Inventory work is not, and should not be, held to
   the ledger's authorisation model.

**Therefore: supplier receiving is its own inventory document. It may reference a supplier. It
never writes to the supplier ledger.**

---

## 2. Scope

### In scope

- `SupplierReceiving` and `SupplierReceivingItem` tables (additive migration)
- Explicit **Receive Stock** action creating one `PURCHASE_RECEIPT` movement per line
- Multi-product receiving document, created whole or not at all
- Optional supplier reference, optional invoice/reference number, optional note
- Receiving list and document view **under Inventory**
- Movement-history links from a `PURCHASE_RECEIPT` back to its receiving document
- Tests, report-only SQL, release notes

### Explicitly out of scope

Automatic receiving from any supplier transaction; supplier payable or debt creation; any change
to supplier balances, customer ledger, debts, payments, installments, or sales orders; COGS, FIFO,
weighted average, stock valuation, margin, profit; editing or deleting a posted receiving
document (see §8); partial receipts against an expected order; purchase orders; multi-location
stock; barcode-driven bulk receiving; WhatsApp; Financial Truth Foundation.

---

## 3. Data model

```prisma
model SupplierReceiving {
  id              String    @id @default(uuid()) @db.Uuid
  supplierId      String?   @db.Uuid
  supplier        Supplier? @relation(fields: [supplierId], references: [id], onDelete: Restrict)
  referenceNumber String?
  receivedOn      DateTime  @db.Date
  note            String?   @db.Text
  receivedById    String    @db.Uuid
  receivedBy      User      @relation("SupplierReceivingReceivedBy", fields: [receivedById], references: [id], onDelete: Restrict)
  createdAt       DateTime  @default(now())

  items SupplierReceivingItem[]

  @@index([supplierId, receivedOn])
  @@index([receivedOn])
  @@map("supplier_receivings")
}

model SupplierReceivingItem {
  id              String            @id @default(uuid()) @db.Uuid
  receivingId     String            @db.Uuid
  receiving       SupplierReceiving @relation(fields: [receivingId], references: [id], onDelete: Restrict)
  productId       String            @db.Uuid
  product         Product           @relation(fields: [productId], references: [id], onDelete: Restrict)
  quantity        Int
  stockMovementId String            @unique @db.Uuid
  stockMovement   StockMovement     @relation("ReceivingMovement", fields: [stockMovementId], references: [id], onDelete: Restrict)
  createdAt       DateTime          @default(now())

  @@unique([receivingId, productId])
  @@index([productId, createdAt])
  @@map("supplier_receiving_items")
}
```

`receivedOn` is deliberately a date-only business fact (`@db.Date`), not a timestamp named
`receivedAt`. The document is immutable after posting, so it has no `updatedAt`. Generate each
item UUID before its writes: create the movement with that UUID as `referenceId`, then create the
item using the pre-generated UUID and movement id. This avoids a nullable link while keeping
`SupplierReceivingItem.stockMovementId` authoritative.

Raw SQL beyond what Prisma expresses:

```sql
ALTER TABLE "supplier_receiving_items"
  ADD CONSTRAINT "supplier_receiving_items_positive_quantity_check" CHECK ("quantity" > 0);

ALTER TABLE "supplier_receivings"
  ADD CONSTRAINT "supplier_receivings_reference_nonempty_check"
    CHECK ("referenceNumber" IS NULL OR btrim("referenceNumber") <> '');
```

**Every foreign key is `ON DELETE RESTRICT`**, matching v1.9.0. `stockMovementId @unique` makes a
movement structurally un-reusable by a second receiving line. `@@unique([receivingId, productId])`
collapses "same product twice on one receipt" at the database level rather than leaving it to be
summed in application code.

**`referenceNumber` is deliberately NOT unique.** Suppliers reuse and omit invoice numbers, and a
unique constraint would block a legitimate second delivery. Duplicate detection is a UI warning
(§7), not a database rule.

---

## 4. Movement contract

Per receiving line, inside one transaction:

| Field | Value |
| --- | --- |
| `movementType` | `PURCHASE_RECEIPT` |
| `quantityChange` | `+quantity` |
| `quantityBefore` / `quantityAfter` | read and computed server-side |
| `reason` | **server-generated**, e.g. `Stock received from Al-Noor Trading — INV-4471 / إدخال مخزون من المورد` |
| `note` | optional, from the document |
| `referenceType` | `'SUPPLIER_RECEIVING_ITEM'` |
| `referenceId` | receiving item id |
| `createdById` | acting user |

The reason is generated from the supplier name and reference number, never accepted from the
client — the same rule v1.8.1 established for product/service audit reasons and v1.9.0 applied to
deduction. Omitted values must produce a clean fallback (`Stock received / إدخال مخزون`), never
the strings `undefined` or `null`; append the supplier and reference only when present.

---

## 5. Transaction shape

`SupplierReceivingService.create({ supplierId?, referenceNumber?, receivedOn, note?, items[] }, user, context)`

One `runFinancialTransaction`, items sorted by `productId` for deterministic lock ordering:

1. Validate the header. If `supplierId` is present, the supplier must exist **and be active** —
   reject an archived supplier. Normalize blank optional text to null.
2. Validate `receivedOn`: a real business date, not in the future (compare with
   `todayInBusinessTimezone`). Backdating is allowed only on or after every selected product's
   opening-count business date.
3. Validate items: at least one; positive integer quantity within `INVENTORY_QUANTITY_LIMIT`; no
   duplicate `productId` (surface it as a clean validation error, with the `@@unique` as backstop).
4. Per item: the product must exist, have `trackStock = true`, and have a **verified opening
   count**. Receiving does not onboard a product — onboarding stays an admin-verified physical
   count. This mirrors v1.8.0's `ONBOARDING_REQUIRED` guard exactly. Convert the opening
   movement's `createdAt` with `timestampToBusinessDate`; reject `receivedOn` before that date so
   stock already captured by the opening count is never added twice.
5. Before writing, prove every line is an integer from 1 through `INVENTORY_QUANTITY_LIMIT`
   (100,000), and prove each projected result fits the PostgreSQL integer ceiling 2,147,483,647.
6. Per item: read `before` **inside the write loop from the same `tx`**, compute `after`, repeat
   the ceiling guard, `compareAndSetQuantity` asserting `count === 1`, insert the
   `StockMovement`, then insert the pre-ID'd `SupplierReceivingItem`.
7. Commit whole or not at all.

**Reuse, do not rebuild:** `runFinancialTransaction`, `InventoryRepository.compareAndSetQuantity`,
`findOpeningBalance`, `createMovement`, `normalizeRequiredReason` / `normalizeOptionalText`,
`databaseUuidSchema` (v1.9.0 — legacy product IDs are not RFC-conformant, see §11).

### Idempotency

A receiving document is created in one request and is then immutable, so there is no second click
on the *same* document to defend against. What remains:

- `stockMovementId @unique` — a movement backs at most one line.
- `@@unique([receivingId, productId])` — one line per product per document.
- Whole-or-nothing transaction — a failed request leaves no partial receipt.
- **UI-level double-submit guard** — disable submit while in flight, and navigate to the created
  document on success rather than leaving a live form on screen.

A resubmitted form legitimately creates a *new* document: that is a second delivery, which is
correct. §7 covers the duplicate-reference warning that helps a human notice the mistake.

---

## 6. Permissions

| Action | Role | Account password |
| --- | --- | --- |
| Create a receiving document | ADMIN **or** EMPLOYEE | **no** |
| View receiving list/document | ADMIN or EMPLOYEE | no |

Consistent with `MANUAL_ADD` in v1.8.0 and with v1.9.0 deduction: receiving is ordinary work, it
increases stock, and the audit trail plus the append-only ledger are the controls. Use an explicit
`requireRole([Role.ADMIN, Role.EMPLOYEE])` rather than bare `requireAuth`, so a future third role
fails closed.

**Note the deliberate asymmetry, carried over from v1.9.0 §7.4:** every supplier *transaction*
write is ADMIN-only, so an EMPLOYEE who can receive goods cannot record what the shop owes for
them. That is correct — one is inventory, the other is finance — but it will look like a bug from
the counter unless the UI says so plainly (§7).

### API and named conflicts

- `GET /api/v1/inventory/receivings` — paginated list; ADMIN or EMPLOYEE.
- `GET /api/v1/inventory/receivings/duplicate-check` — accepts `supplierId` and
  `referenceNumber`; returns a warning candidate and never blocks. Run it only when both values
  are present. Register it before the id route.
- `GET /api/v1/inventory/receivings/:receivingId` — immutable document detail.
- `POST /api/v1/inventory/receivings` — whole-document creation.
- There is no PATCH, DELETE, reverse, or supplier-ledger endpoint for a receiving document.

All ids in these validators use `databaseUuidSchema`. Reuse `ONBOARDING_REQUIRED` verbatim.
The date boundary error is:
`This receiving date is before the verified opening count for this product; its stock is already
included in that count. / تاريخ الاستلام يسبق الجرد الافتتاحي المؤكد لهذا المنتج، ومخزونه محتسب
ضمن ذلك الجرد.` Supplier hard deletion with receiving history returns HTTP 409 with code
`SUPPLIER_HAS_RECEIVINGS` and tells the user that the supplier can only be archived.

---

## 7. Frontend

**Location: under Inventory, not under Suppliers.** Receiving stock is inventory work. Putting an
unrestricted action inside the ADMIN-only supplier ledger screens would both misfile it and invite
the assumption that a payable was booked.

- `/inventory/receiving` — list of receiving documents (date, supplier, reference, line count).
- `/inventory/receiving/new` — the form: optional supplier picker, optional reference number,
  received-on date, optional note, and a product-line editor reusing the existing product picker.
- `/inventory/receiving/:id` — read-only document view with its lines and links to each movement.
- The form must state, in the house `English / عربي` format, that **no supplier payable is
  recorded** and that the supplier ledger is updated separately.
- If a receiving document already exists with the same supplier and reference number, warn on
  submit — do not block.
- Movement history gains a link from `PURCHASE_RECEIPT` rows back to the receiving document,
  resolved through the `SupplierReceivingItem` relation, not by parsing `referenceType`.

---

## 8. Immutability and correction

A posted receiving document has **no edit and no delete endpoint** in v1.9.1.

A mistake is corrected the way v1.8.0 already prescribes: a compensating manual movement with a
typed reason — `DAMAGE_LOSS` for goods that arrived unsellable, `MANUAL_REMOVE` or `STOCK_COUNT`
for a miscounted receipt. Both keep their ADMIN + password guard, which is the right level of
scrutiny for undoing a recorded fact.

**Reversal is deferred beyond v1.9.1 (§10 item 9).** Unlike a sales deduction — where refusing
reversal creates the uncancellable-order deadlock that forced restoration into v1.9.0 — a receipt
has no such trap. Nothing downstream is blocked by an incorrect receipt, and the manual correction
path already exists. If reversal is later wanted, the v1.9.0 fulfillment design is the template: a
`status ACTIVE | REVERSED` column, a partial unique index, and an explicit admin-only reversal
action.

---

## 9. Ledger isolation — the non-negotiable

No code path in this release may create, update, or delete a row in `supplier_transactions`,
`debts`, `payments`, `payment_allocations`, `installment_plans`, `installments`, or
`transactions`; nor change any supplier balance, customer receivable, sales order, or dashboard
financial figure.

Tests must snapshot all of these before and after every receiving write and assert them
**unchanged** — the same assertion set v1.9.0 used, extended with supplier balance.

`Product.costPrice` exists and a receiving line is exactly where someone will want to multiply it
by a quantity. **Forbidden.** No valuation, COGS, FIFO, weighted average, margin, or profit.

---

## 10. Final decisions (CP-1912)

| # | Question | Final decision |
| --- | --- | --- |
| 1 | Is the supplier required or optional? | **Optional.** Cash purchases and walk-in restocks are real; forcing a supplier would push staff back to `MANUAL_ADD` and lose the document entirely. |
| 2 | Is the reference/invoice number required? | **Optional but prominent.** Normalize blank to null. Duplicate supplier/reference matches produce a warning, never a uniqueness rejection. |
| 3 | Multiple products per document? | **Yes.** One delivery is one document; duplicate product ids within that document are rejected before any write. |
| 4 | Employees, or admin only? | **ADMIN or EMPLOYEE, with no account password.** Use explicit role middleware so future roles fail closed. |
| 5 | Editable / backdated receiving date? | **The immutable `receivedOn` date defaults to today.** Backdating is allowed only on or after every line's opening-count business date; future dates are rejected. |
| 6 | Immediate `Product.stockQuantity` increase? | **Yes**, in the same transaction as the movement and item. There is no pending receipt state. |
| 7 | Supplier profile shows receiving history? | **Yes.** CP-1917 adds a read-only inventory-labelled section, visible to ADMIN and EMPLOYEE and separate from the financial ledger. |
| 8 | Dashboard shows recent receipts? | **Yes.** CP-1918 uses the inventory movement surface only, with no valuation or money totals. |
| 9 | Is receiving reversible? | **No in v1.9.1; defer to v1.9.2 or later** (§8). Manual compensating movements remain the correction path. |
| 10 | Receiving allowed with no supplier ledger entry? | **Yes, always.** Receiving never creates or requires a supplier transaction. |
| 11 | What happens when the supplier is archived? | **History remains readable; new receiving is rejected.** Restoring the supplier makes it selectable again. |
| 12 | What happens without a verified opening count? | **Reject with the existing bilingual onboarding error.** Receiving never onboards a product. |
| 13 | What if `receivedOn` predates the opening count? | **Reject before any write.** Otherwise stock already included in the physical opening count would be added twice. |
| 14 | What if a supplier with receiving documents is deleted? | **Return a friendly 409 conflict and recommend archive.** Check receiving references inside `SuppliersService.remove`; `ON DELETE RESTRICT` remains the database backstop. |

All fourteen decisions are settled. CP-1913 must not reopen them unless implementation evidence
shows a contradiction. The date field is `receivedOn`; `receivedAt` is not used, and immutable
receiving documents do not have `updatedAt`.

---

## 11. Migration and rehearsal safety

- **Additive only:** `CREATE TABLE`, `CREATE INDEX`, `ALTER TABLE … ADD CONSTRAINT`. No enum
  addition is needed — `PURCHASE_RECEIPT` already exists, reserved since v1.8.0.
- No `DROP`, `TRUNCATE`, `DELETE`, `UPDATE` of existing rows; no `prisma migrate reset`.
- **No backfill.** No historical supplier transaction becomes a receipt. Every pre-v1.9.1 stock
  arrival stays whatever manual movement recorded it.
- The **pending-migration compatibility probe** added in v1.9.0 (`to_regclass` guard in
  `InventoryRepository.summary`) applies to every ordinary pre-migration query that adds a
  receiving relation: summary/recent movements, global movement history, product movement
  history, and dashboard activity. The packaged app must still start on the old schema so
  Maintenance can take a backup before migrating. Receiving-only endpoints may report that the
  migration is pending, but must not break ordinary startup.
- **Legacy UUIDs:** v1.9.0 established `databaseUuidSchema` because real product IDs are canonical
  but not RFC-version-conformant (1 of 90 products in the restored backup). Every new v1.9.1
  validator must use it, never `z.string().uuid()`.
- Report-only SQL under `backend/prisma/repair/inventory-v1.9.1/`: a receiving reconciliation
  check asserting every `SupplierReceivingItem` has exactly one `PURCHASE_RECEIPT` movement and
  that `SUM(quantityChange) = Product.stockQuantity` still holds. Nothing writes. No
  `manifest.json` entry unless the rehearsal proves a repair is needed.
- Scratch rehearsal, then **restored business-PC backup rehearsal (CP-1919)** as the release gate.

---

## 12. Test plan

**Backend**
- N-line document creates N `PURCHASE_RECEIPT` movements and N items; stock rises per line.
- Supplier omitted → succeeds. Supplier archived or nonexistent → rejected.
- Duplicate `productId` in one document → rejected before any write.
- Zero, negative, non-integer, or over-limit quantity → rejected.
- Un-onboarded product, or `trackStock = false` → rejected.
- One bad line → the whole document fails; no movements, no partial receipt.
- Future `receivedOn` → rejected; backdated on/after opening date → accepted; before opening date
  → rejected before any write.
- Overflow beyond the integer ceiling → rejected.
- A supplier with receiving history cannot be hard-deleted; the service returns a named 409
  rather than a raw Prisma/foreign-key error. Archiving and history reads still work.
- Concurrent receiving and manual add on the same product → both applied, ledger sum matches
  `stockQuantity` (compare-and-set forces one to retry, not overwrite).
- Reason is server-generated; a client-supplied reason is not what lands in the movement.
- Legacy non-RFC product UUID is accepted by the validator.
- **Ledger isolation:** snapshot and assert unchanged across `supplier_transactions`, supplier
  balances, `debts`, `payments`, `payment_allocations`, `installment_plans`, `installments`,
  `transactions`, and sales orders.

**Frontend**
- Form validates quantities and rejects duplicate products client-side.
- Submit is disabled while in flight; success navigates to the document.
- Duplicate supplier+reference warns without blocking.
- The "no payable recorded" statement is present.
- EMPLOYEE can reach and submit the form.
- All v1.8.0 manual inventory actions remain visible and unchanged.

**Manual walkthrough**
Onboard a product → receive 5 units from a supplier → verify stock, movement, and document →
open the supplier ledger and confirm the balance is unchanged → open the dashboard and confirm
inventory figures moved and financial figures did not.

---

## 13. Checkpoints

| CP | Content | Gate |
| --- | --- | --- |
| **CP-1911** | Repo review after the v1.9.0 commit. Verify the §1/§11 baseline against actual code. **No code.** | User approval before CP-1912 |
| **CP-1912** | Supplier receiving design finalisation. Resolve every §10 decision. **No code.** | User approval before CP-1913 |
| **CP-1913** | Prisma schema + additive migration for both tables. No backfill. Scratch rehearsal. | **Implemented 2026-08-14; awaiting review.** |
| **CP-1914** | Backend service, routes, validators, tests. | Tests green |
| **CP-1915** | Frontend receiving list, form, and document view under Inventory, plus tests. | Tests green |
| **CP-1916** | Movement-history document links plus old-schema `to_regclass` compatibility for every affected movement query. | Tests green on old and new schema shapes |
| **CP-1917** | Approved supplier-profile read-only receiving history, clearly separated from the financial ledger. | Tests green |
| **CP-1918** | Approved dashboard recent receipts through inventory data only; no money or valuation. Reversal remains deferred. | Tests green |
| **CP-1919** | Rehearsal on a restored business-PC backup. Row-count comparison, timing, reconciliation. | **Release gate** |
| **CP-1920** | Final v1.9.1 review. No bump, build, installer, or commit without explicit approval. | User approval |

---

## 14. Risks

| Risk | Severity | Mitigation |
| --- | --- | --- |
| **A payable is implied but never recorded.** Staff assume receiving booked the supplier debt and the ledger silently drifts from reality. | **High** | Explicit "no payable recorded" statement on the form and the document (§7); receiving lives under Inventory, not Suppliers; the asymmetry is documented for training. |
| Someone couples receiving to `SupplierTransaction` in a later release "for convenience". | High | §1 records why this is refused; ledger-isolation tests fail loudly if it is attempted. |
| Duplicate receipts from a resubmitted form. | Medium | Whole-or-nothing transaction, in-flight submit guard, navigate-on-success, duplicate-reference warning (§5, §7). |
| Receiving used to onboard a product, bypassing the verified physical count. | Medium | Un-onboarded products rejected, same guard as every other movement (§5 step 4). |
| Lost update between a receipt and a concurrent manual add. | Medium | Compare-and-set with `count === 1` inside a serializable transaction (§5 step 6). |
| `costPrice` is on the product and tempting on a receiving line. | Medium | Explicitly forbidden; tests assert no valuation output (§9). |
| A new validator uses `z.string().uuid()` and rejects a legacy product ID. | Medium | `databaseUuidSchema` is mandatory for all new validators (§11). |
| Dashboard surface breaks the app on a business PC before migration. | Medium | Follow the v1.9.0 `to_regclass` compatibility pattern (§11). |
| A backdated receipt predates the verified opening count and double-counts stock. | High | Reject before the first write by comparing `receivedOn` with the opening movement's business date (§5). |
| A supplier with receiving history leaks a raw FK error on hard delete. | Medium | Count receiving references in the supplier deletion transaction, return a friendly 409, and retain `ON DELETE RESTRICT` (§10). |
| Scope creep into purchase orders, partial receipts, or valuation. | Low | Named out of scope (§2); checkpoint gates. |
