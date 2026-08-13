# Inventory v1.9.0 — Document-Linked Stock Movements

**Status:** CP-1904 through CP-1907 complete. CP-1908 review remediation implemented; awaiting
re-review and explicit release authorization.
**Created:** 2026-08-13
**Predecessor:** `claude/plans/inventory-management-plan.md` (v1.8.0 — manual stock movement ledger)
**Companion build prompt:** `claude/prompts/codex-inventory-v1.9.0-build.md`
**Baseline:** repository at v1.8.1 (`package.json` version `1.8.1`, commit `9c46f712bec2fb2e13cfbff65e565ab974f251d8`)
**Revised:** 2026-08-13 after CP-1908 review remediation. Decisions in §14 are settled and must not be reopened
without explicit user direction.

---

## 0. One-paragraph summary

v1.8.0 gave the shop a trustworthy stock number and an append-only ledger explaining every
change — but every change is still typed by hand. **v1.9.0 connects that ledger only to sales
orders**: goods leave when a person explicitly presses the deduction action, and return only when
an administrator explicitly records a restoration. Product and quantity come from the stored
`SalesOrderItem`, never the client, and each line can have at most one active fulfillment,
enforced by a database partial unique index. Supplier receiving is a separate v1.9.1 release and
has no schema, backend, frontend, test, or navigation implementation in v1.9.0.

---

## 1. Verified baseline — what is actually in the repo today

Confirmed by inspection and CP-1901 on 2026-08-13, not assumed.

### Schema (`backend/prisma/schema.prisma`)

| Fact | Detail |
| --- | --- |
| `StockMovementType` enum | Already contains `PURCHASE_RECEIPT`, `SALE_FULFILLMENT`, `SALE_CANCEL_RESTORE`, `SERVICE_PART_USED` as **reserved, unwired** values (lines 241–252) |
| `StockMovement` | `productId`, `movementType`, `quantityChange`, `quantityBefore`, `quantityAfter`, `reason`, `note`, `referenceType String?`, `referenceId String? @db.Uuid`, `createdById`, `createdAt`. Append-only. |
| `stock_movements` constraints | Balance equation, non-negative balances, non-zero change (except `OPENING_BALANCE`), opening-starts-zero, non-empty reason, **partial unique index** `stock_movements_one_opening_balance_per_product` |
| `Product` | `trackStock`, `stockQuantity`, `lowStockThreshold`, `costPrice`, `sku` unique, `barcode` unique nullable |
| `SalesOrderItem` | `id` (uuid, stable), `salesOrderId` (cascade from order), `productId String?`, `quantity Int`, snapshots, `lineTotal` |
| `SalesOrder` | `fulfillmentStatus` (`DRAFT`→`RETURNED`), `debtId?`, `installmentPlanId?`, `cancelledAt/By/Reason`, `orderDate @db.Date` |
| `SupplierTransaction` | Financial only: `type`, `direction`, `amount`, `description`, `reference`. **No product, no quantity.** |
| `SalesAuditAction` | `CREATE … CANCEL, RESTORE, RETURN` — additive enum, safe to extend |
| `SupplierAuditRecordType` | `SUPPLIER`, `SUPPLIER_TRANSACTION` — financial-ledger audit |

### Backend behaviour

- `InventoryService` (`backend/src/features/inventory/inventory.service.ts`) — five manual
  mutations plus `verifyOpeningCount`, all through one private `mutate()` helper.
- `mutate()` already does exactly what v1.9.0 needs internally: read product → assert
  `trackStock` → assert `hasOpeningBalance` → compute before/after → reject negative →
  **compare-and-set** `compareAndSetQuantity(productId, before, after)` asserting `count === 1`
  → insert `StockMovement`. All inside `runFinancialTransaction`.
- `runFinancialTransaction` (`backend/src/features/financial/infrastructure/transaction.ts`)
  runs at **Serializable** isolation and retries **only** `P2034` (serialization failure), up to
  2 retries, by re-running the whole operation.
- `ONBOARDING_REQUIRED` guard: no stock movement of any manual type is allowed before a verified
  opening count exists.
- Permission policy today: `MANUAL_ADD` / `RETURN_TO_STOCK` = any authenticated user, no
  password. `MANUAL_REMOVE` / `STOCK_COUNT` / `DAMAGE_LOSS` = ADMIN + `accountPassword` via
  `verifyAdminPassword`. `verifyOpeningCount` = ADMIN + password, once per product.
- `SalesOrdersService` (`backend/src/features/sales/sales-orders/sales-orders.service.ts`, 794
  lines) — `addItem` / `updateItem` / `removeItem` all guarded by `assertEditable` +
  `assertNoFinancialLink`, all re-run `recalculateOrder`, all write a `SalesAudit` row.
  `cancel` / `returnOrder` funnel through `terminalMutation`, which already refuses when a debt
  or installment plan is linked and requires admin verification.
- **[CP-1901 — corrected]** Sales **reads** stock but never **writes** it. `salesOrderInclude` in
  `sales-orders.repository.ts:12` selects `trackStock`, `stockQuantity`, `lowStockThreshold` and
  `costPrice` on every order item's product. There are no `StockMovement` references and no stock
  writes anywhere under `backend/src/features/sales`. `ProductLinePicker.tsx:21` displays stock
  and states outright that *"selling above stock is allowed"*. The `costPrice` already reaching
  the client is a standing temptation — see §10.
- **No supplier code path touches stock** — confirmed across backend and frontend supplier
  domains. Supplier transaction writes are additionally **ADMIN-gated**
  (`supplier-transactions.routes.ts:7`), which matters for the receiving permission decision
  (§7.4, §14).
- **[CP-1901]** `SalesOrdersRepository.removeItem` is a **hard delete**
  (`sales-orders.repository.ts:88`), which makes the `onDelete: Restrict` backstop in §4.1 load-
  bearing rather than decorative.
- **[CP-1901, implemented CP-1903]** `InventoryRepository.hasOpeningBalance` remains the lean
  `{ id: true }` check used by manual movements. `findOpeningBalance` now supplies `{ id,
  createdAt }` for the §5.3 business-date guard.
- **[CP-1901]** There is **no global Prisma-error mapping**. `error.middleware.ts:25` only
  understands `AppError`, so an unhandled `P2002` surfaces as HTTP 500. Existing `P2002` handling
  is local and narrow (order-number collision, `sales-orders.service.ts:710`).

### Frontend

- `frontend/src/features/inventory/` — `InventoryProductDrawer`, `ProductInventoryPanel`,
  `MovementHistory`, `StockMovementDialog`, `VerifyOpeningCountDialog`,
  `InventoryDashboardCards`.
- `frontend/src/pages/sales-orders/SalesOrderDetailsPage.tsx` + `SalesOrderItemsEditor.tsx`.
- Dashboard module registry already has inventory at `'LIVE'` → `/inventory`.

### Release tooling

- Migrations are plain SQL under `backend/prisma/migrations/<timestamp>_<name>/migration.sql`.
- `scripts/rehearse-migrations.ts` — scratch-database rehearsal, requires `--confirm-scratch`.
- `backend/prisma/repair/` + `manifest.json` — business-PC-safe repair SQL, one entry per repair
  actually applied on a shop PC.
- Release notes live at `docs/phases/Versions/phase-1-8-0/RELEASE_NOTES_V1_8_0.md`.

---

## 2. Release scope — **settled in CP-1902**

| Release | Migration | Feature wired |
| --- | --- | --- |
| **v1.9.0** | `sales_order_stock_fulfillments` plus `DEDUCT_STOCK` / `RESTORE_STOCK` audit enum values | Sales-order deduction and restoration only |
| **v1.9.1** | Supplier-receiving schema, designed and rehearsed in that release | Supplier receiving only |

The earlier shared-migration recommendation is rejected. CP-1903 creates **one fulfillment
table only**. It does not create `supplier_receivings` or `supplier_receiving_items`. This keeps
the v1.9.0 schema identical to its live feature scope and prevents unused receiving structures
from becoming an accidental implementation invitation.

`PURCHASE_RECEIPT` remains reserved and unwired. Existing `MANUAL_ADD` remains the operational
fallback until v1.9.1. No v1.9.0 endpoint, component, test, dashboard card, helper SQL, or release
note may present supplier receiving as available.

---

## 3. Design principle — no automatic ERP magic

Restated as testable rules, because this is the property most easily lost during implementation.

| Event | Stock effect |
| --- | --- |
| Sales order created | **none** |
| Sales order confirmed | **none** |
| Sales order status → PREPARING / OUT_FOR_DELIVERY / DELIVERED | **none** |
| Sales order payment recorded | **none** |
| Debt or installment plan created from an order | **none** |
| Supplier transaction created / edited / removed | **none** |
| Supplier ledger viewed or recalculated | **none** |
| User presses **Deduct Stock / إخراج من المخزون** | one `SALE_FULFILLMENT` per selected line (ADMIN or EMPLOYEE, no password) |
| Admin presses **Restore Stock / إرجاع إلى المخزون** | one `SALE_CANCEL_RESTORE` per selected fulfillment (ADMIN only, typed reason) |
| Supplier goods arrive | **no v1.9.0 document flow**; use existing manual inventory until v1.9.1 |

And in the other direction — no stock action may write to `Debt`, `Payment`,
`PaymentAllocation`, `InstallmentPlan`, `Installment`, `Transaction`, or `SupplierTransaction`.
Section 11 turns this into assertions.

The client is never trusted with `productId`, `quantity`, or `referenceId` for a document-linked
movement. It sends **document line identifiers only**. The server reads the product and the
quantity from the row it already owns.

---

## 4. Data model

### 4.1 `SalesOrderStockFulfillment`

The recommendation is a **dedicated table**, not `StockMovement.referenceType` /
`referenceId`. Those two columns are free-text metadata written by the existing manual flow
(`referenceType: 'MANUAL'`) and there is nothing stopping a future caller writing anything into
them. A dedicated table gives a real foreign key, a real unique index, and a place to hold
reversal state.

```prisma
enum SalesOrderStockFulfillmentStatus {
  ACTIVE
  REVERSED
}

model SalesOrderStockFulfillment {
  id               String         @id @default(uuid()) @db.Uuid
  salesOrderId     String         @db.Uuid
  salesOrder       SalesOrder     @relation(fields: [salesOrderId], references: [id], onDelete: Restrict)
  salesOrderItemId String         @db.Uuid
  salesOrderItem   SalesOrderItem @relation(fields: [salesOrderItemId], references: [id], onDelete: Restrict)
  productId        String         @db.Uuid
  product          Product        @relation(fields: [productId], references: [id], onDelete: Restrict)
  quantity         Int
  status           SalesOrderStockFulfillmentStatus @default(ACTIVE)

  stockMovementId  String         @unique @db.Uuid
  stockMovement    StockMovement  @relation("FulfillmentMovement", fields: [stockMovementId], references: [id], onDelete: Restrict)

  reversalStockMovementId String?        @unique @db.Uuid
  reversalStockMovement   StockMovement? @relation("FulfillmentReversalMovement", fields: [reversalStockMovementId], references: [id], onDelete: Restrict)
  reversedAt              DateTime?
  reversedById            String?        @db.Uuid
  reversedBy              User?          @relation("FulfillmentReversedBy", fields: [reversedById], references: [id], onDelete: Restrict)
  reversalReason          String?        @db.Text

  createdById String   @db.Uuid
  createdBy   User     @relation("FulfillmentCreatedBy", fields: [createdById], references: [id], onDelete: Restrict)
  createdAt   DateTime @default(now())

  @@index([salesOrderId])
  @@index([productId, createdAt])
  @@index([status])
  @@map("sales_order_stock_fulfillments")
}
```

Raw SQL additions Prisma cannot express — **these are the actual safety mechanism**:

```sql
-- One ACTIVE fulfillment per order line. This, not application code, is what makes
-- double-click, retry, and concurrent requests safe.
CREATE UNIQUE INDEX "sales_order_stock_fulfillments_one_active_per_item"
  ON "sales_order_stock_fulfillments"("salesOrderItemId")
  WHERE "status" = 'ACTIVE';

ALTER TABLE "sales_order_stock_fulfillments"
  ADD CONSTRAINT "sales_order_stock_fulfillments_positive_quantity_check"
    CHECK ("quantity" > 0),
  ADD CONSTRAINT "sales_order_stock_fulfillments_reversal_coherent_check"
    CHECK (
      ("status" = 'ACTIVE'   AND "reversalStockMovementId" IS NULL AND "reversedAt" IS NULL
        AND "reversedById" IS NULL AND "reversalReason" IS NULL)
      OR
      ("status" = 'REVERSED' AND "reversalStockMovementId" IS NOT NULL AND "reversedAt" IS NOT NULL
        AND "reversedById" IS NOT NULL AND "reversalReason" IS NOT NULL)
    ),
  ADD CONSTRAINT "sales_order_stock_fulfillments_reversal_reason_nonempty_check"
    CHECK ("reversalReason" IS NULL OR btrim("reversalReason") <> '');
```

The partial unique index is the same technique already proven in
`stock_movements_one_opening_balance_per_product`.

**Note on `onDelete: Restrict` for `salesOrderItemId`.** `SalesOrderItem` cascades from
`SalesOrder`, and `SalesOrdersService.removeItem` hard-deletes a line. `Restrict` here is the
backstop that makes it structurally impossible to delete a line whose stock has left the
building, independent of whatever the service layer believes.

### 4.2 Audit enum additions

- `SalesAuditAction` — add `DEDUCT_STOCK` and `RESTORE_STOCK`. `SalesAudit` is the *operational*
  order timeline (it already records status changes and line edits), so stock actions belong in
  it and the order screen gets a complete history for free.
- `SupplierAuditRecordType` — **do not extend or otherwise touch in v1.9.0.**

### 4.3 Exact database contract for CP-1903

CP-1903 creates only the model above and its inverse relations on `SalesOrder`,
`SalesOrderItem`, `Product`, `StockMovement`, and `User`. The migration is additive and creates:

- enum `SalesOrderStockFulfillmentStatus` with `ACTIVE`, `REVERSED`;
- table `sales_order_stock_fulfillments`;
- primary key `sales_order_stock_fulfillments_pkey`;
- unique constraints/indexes for `stockMovementId` and nullable `reversalStockMovementId`;
- partial unique index `sales_order_stock_fulfillments_one_active_per_item`;
- indexes `sales_order_stock_fulfillments_salesOrderId_idx`,
  `sales_order_stock_fulfillments_productId_createdAt_idx`, and
  `sales_order_stock_fulfillments_status_idx`;
- `ON DELETE RESTRICT` foreign keys to the order, item, product, both stock movements, creator,
  and reverser;
- `sales_order_stock_fulfillments_positive_quantity_check`;
- `sales_order_stock_fulfillments_reversal_coherent_check` requiring all reversal fields
  (`reversalStockMovementId`, `reversedAt`, `reversedById`, `reversalReason`) to be null for
  `ACTIVE` and all to be present for `REVERSED`;
- `sales_order_stock_fulfillments_reversal_reason_nonempty_check` using
  `CHECK ("reversalReason" IS NULL OR btrim("reversalReason") <> '')`;
- enum additions `DEDUCT_STOCK` and `RESTORE_STOCK` to `SalesAuditAction`, each in its own SQL
  statement.

It inserts and updates no rows. It creates no supplier-receiving object.

---

## 5. Sales-order deduction

### 5.1 Scope decision — whole-line only

**v1.9.0 deducts a whole order line or nothing.** Partial fulfillment brings remaining-quantity
tracking, split movements, per-fulfillment partial reversal, and a substantially harder UI. It is
not needed by a single-shop appliance retailer whose orders are delivered as a unit. Deferred to
v1.10.0 and explicitly out of scope here. The schema does not block it later: a second ACTIVE row
per line becomes possible by replacing the partial unique index with a summed-quantity check —
a contained change.

### 5.2 Per-line eligibility states

The server computes these; the client renders them. It never re-derives them.

| State | Condition | Deduct allowed |
| --- | --- | --- |
| `NOT_INVENTORY_LINE` | `productId IS NULL` (manual line) | no |
| `STOCK_NOT_TRACKED` | product exists, `trackStock = false` | no |
| `NEEDS_OPENING_COUNT` | no `OPENING_BALANCE` movement for the product | no |
| `PREDATES_OPENING_COUNT` | order date < date of the product's `OPENING_BALANCE` | no — see 5.3 |
| `ORDER_NOT_ELIGIBLE` | order status is `DRAFT`, `CANCELLED` or `RETURNED` | no |
| `INSUFFICIENT_STOCK` | `product.stockQuantity < item.quantity` | no |
| `ALREADY_DEDUCTED` | an `ACTIVE` fulfillment exists for the line | no |
| `RESTORED` | only `REVERSED` fulfillments exist for the line | yes (re-deduct permitted) |
| `AVAILABLE` | none of the above | **yes** |

### 5.3 The double-count guard — orders that predate the opening count

This is the correctness hazard most likely to be missed, and it must be a server-side rule.

A verified opening count is a physical count taken on a date. Anything sold *before* that count
had already left the shelf when the counting happened, so the counted number already reflects it.
Deducting such an order would remove the same units twice and silently corrupt the number the
whole v1.8.0 release existed to make trustworthy.

**Rule:** reject deduction when `SalesOrder.orderDate` (business date) is earlier than the
business date of the product's `OPENING_BALANCE` movement `createdAt`.

**[CP-1901] Two implementation prerequisites, both of which the first draft of this plan
assumed away.**

1. `hasOpeningBalance` returns `{ id }` only. This guard needs the timestamp, so either widen
   that select or add `findOpeningBalance(productId, tx)` returning `{ id, createdAt }`. Prefer
   the second — `hasOpeningBalance` is called on every manual movement and does not need the
   extra column.
2. **The date comparison must be timezone-aware, and the obvious helper is the wrong one.**
   `prismaDateToBusinessDate` (`business-date.ts:35`) reads **UTC** calendar fields. That is
   correct for Prisma `@db.Date` columns such as `SalesOrder.orderDate`, which
   `businessDateToPrisma` stores as UTC midnight. It is **wrong** for `StockMovement.createdAt`,
   which is a real instant: Beirut runs UTC+2/+3, so an opening count verified at 01:30 Beirut on
   13 August is stored as 22:30 UTC on 12 August and would be read back as the 12th. That is a
   silent off-by-one on the highest-severity guard in the release, and it fails in exactly one
   direction — it makes an ineligible order look eligible.

   The conversion already exists and is merely misnamed: `todayInBusinessTimezone(timezone, now)`
   (`business-date.ts:53`) takes an arbitrary `Date` and formats it through `Intl` in the
   business timezone. Extract its body as `timestampToBusinessDate(instant, timezone)` and have
   `todayInBusinessTimezone` delegate to it. No new date logic, no new dependency.

   Then compare with the existing `compareBusinessDates`. Cover the midnight boundary in tests
   with an explicit `BUSINESS_TIMEZONE` and an instant chosen to fall on different UTC and
   Beirut dates — a test that passes at midday would pass with the broken helper too.

Message: *"This order predates the verified opening count for this product; its stock effect is
already included in the counted quantity. / هذا الطلب يسبق الجرد الافتتاحي المؤكد لهذا المنتج،
وتأثيره على المخزون محتسب مسبقًا."*

This also solves "what about the hundreds of orders already in the database" without any
backfill, any cutover date, and any configuration: for every historical order, the answer falls
out of data the system already has. No `PREDATES_OPENING_COUNT` line ever offers a button.

### 5.4 Order-status eligibility

Deduction is allowed from `CONFIRMED` onward, i.e. `CONFIRMED`, `PREPARING`,
`READY_FOR_DELIVERY`, `OUT_FOR_DELIVERY`, `DELIVERED`. It is refused on `DRAFT` (not a
commitment yet — a draft is still being priced and edited) and on `CANCELLED` / `RETURNED`
(nothing is leaving). `DELIVERED` is deliberately included: the common real-world sequence is
"deliver first, remember the inventory afterwards", and refusing it would push the operator back
to `MANUAL_REMOVE`, losing the order link.

### 5.5 Transaction shape

`SalesOrderInventoryService.deductStock(orderId, { itemIds, note? }, user, context)`

Inside one `runFinancialTransaction`, per selected item, in a **stable order sorted by
`productId`** (deterministic lock ordering prevents deadlocks between two concurrent multi-line
deductions):

1. Load the order with items. Assert it exists and its status is eligible.
2. Assert every submitted `itemId` belongs to this order. Reject unknown ids outright — never
   silently skip, or a typo becomes a partial deduction the user believes was complete.
3. For each item: resolve `productId` and `quantity` **from the row**, never from the request.
4. Run the eligibility checks of 5.2 and 5.3.
5. **Re-read `product.stockQuantity` from `tx` inside the loop** → `before`;
   `after = before - quantity`; reject `after < 0`.
6. `compareAndSetQuantity(productId, before, after)`; assert `count === 1`, else the existing
   stale-stock error.
7. Insert the `StockMovement`:
   - `movementType = SALE_FULFILLMENT`
   - `quantityChange = -quantity`, `quantityBefore = before`, `quantityAfter = after`
   - `reason` — **server-generated** (§5.5.1), still passed through the existing
     `normalizeRequiredReason`
   - `referenceType = 'SALES_ORDER_ITEM'`, `referenceId = <item id>` (**display metadata only**;
     the fulfillment row is the authority)
   - `createdById = user.userId`
8. Insert the `SalesOrderStockFulfillment` row linking item ↔ movement, `status = ACTIVE`.
9. Write one `SalesAudit` row, `action = DEDUCT_STOCK`, listing the lines and quantities.

**All lines succeed or none do.** A five-line order that fails on line four leaves stock exactly
as it was. Partial success is far worse than failure here, because the operator has no way to
tell which half happened.

**[CP-1901] The same product may legitimately appear on two lines of one order** — no
`(salesOrderId, productId)` constraint exists, `prepareItems` handles each line independently,
and the editor allows it. Sorting by `productId` groups those lines adjacently, so the balance
must **chain**: line one reads 10 and writes 8, line two must read **8**, not the 10 a pre-loop
batch fetch would have cached. Reading inside the loop from the same `tx` gives this for free,
and the eligibility precheck in step 4 must likewise validate against the *running* balance, so
that two lines of 6 against a stock of 10 are rejected as a pair rather than passing
individually. **Test this explicitly** — a single-line test suite will not catch it.

#### 5.5.1 Reason text — server-generated, not typed

`StockMovement.reason` is `NOT NULL` with a non-empty CHECK, and the first draft of this plan had
the operator type it. **[CP-1901] That is now the wrong call**, for two reasons. First, the
document *is* the reason — "why did stock leave?" is answered by the order number, and asking
again at the counter produces either friction or garbage text. Second, there is an uncommitted
working-tree change to `ProductFormDialog.tsx` doing exactly this substitution for product edits
(a typed reason replaced by a constant), so the shop is already moving in this direction and
v1.9.0 should not move against it.

- Deduction: `Stock deducted for sales order <orderNumber> / إخراج مخزون للطلب <orderNumber>`
- Restoration: `Stock restored for sales order <orderNumber> / إرجاع مخزون للطلب <orderNumber>`
An **optional** free-text note stays available on deduction for the genuinely unusual case.
Restoration additionally keeps a **required** typed `reversalReason`: it is the admin-verified
correction path, and there the "why" genuinely is not derivable from the document.

### 5.6 Idempotency and concurrency

The guarantee is the partial unique index, not the application check. The application check
exists to produce a good error message; the index exists to be correct.

- Two concurrent requests for the same line: both read "no ACTIVE fulfillment", both attempt the
  insert. Under Serializable one of two things happens — a serialization failure (`P2034`) or a
  unique violation (`P2002`).
- `P2034` is retried by `runFinancialTransaction`. The retry re-runs the **entire** operation,
  including the re-read of `stockQuantity`, so the compare-and-set is never stale. On the retry
  the fulfillment now exists and the request fails cleanly with `ALREADY_DEDUCTED`.
- `P2002` on `sales_order_stock_fulfillments_one_active_per_item` must be mapped to a 409
  "already deducted" conflict. It must **not** be added to `isRetryableTransactionError` —
  retrying a unique violation can only produce the same violation.
- **[CP-1901] There is no global mapping to lean on.** `error.middleware.ts:25` only understands
  `AppError`, so an unhandled `P2002` becomes an HTTP 500 and the operator sees a crash instead
  of "already deducted". The catch must be **local**, in the deduction service, throwing
  `SalesConflictError` (already 409 in `sales-errors.ts:3`) — the same shape as the existing
  order-number collision handling at `sales-orders.service.ts:710`.
- **[CP-1903 — measured, not assumed]** The scratch PostgreSQL contract test proves that the raw
  partial index reports `P2002` with
  `meta = { modelName: "SalesOrderStockFulfillment", target: ["salesOrderItemId"] }`. The gated
  database test pins that exact shape. CP-1904 may therefore discriminate on `code === 'P2002'`,
  the model name, and a target array containing `salesOrderItemId`; it must still avoid a bare
  catch that could swallow an unrelated constraint violation.
- A double-click therefore produces one fulfillment and one clear message, never two movements.

### 5.7 Permissions

**Settled by the security policy correction of 2026-08-13 (§5.7.1). This is no longer an open
decision.**

| Action | Role | Account password |
| --- | --- | --- |
| Deduct stock for an order line | ADMIN **or** EMPLOYEE | **no** |
| Restore stock for a fulfillment | **ADMIN only** | **no** — typed reason required instead |

Note the schema's role values are `ADMIN` and `EMPLOYEE` (`schema.prisma:13`). "MEMBER" in the
policy statement maps to `EMPLOYEE`; no new role is introduced and the enum is not touched.

`requireRole([Role.ADMIN, Role.EMPLOYEE])` is effectively "any authenticated user" today, since
those are the only two values. Write it as an explicit role list anyway rather than relying on
`requireAuth` alone — when a third role appears (a read-only or accountant role is the obvious
candidate), the deduction endpoint must fail closed, not inherit the new role by default.

### 5.7.1 The policy correction — password is for corrections, not for operations

The app had been reaching for `verifyAdminPassword` on actions that are simply *work*. The
corrected policy is **role-based first**, with the account password reserved for high-risk
corrections.

**Admin password stays required for:** deleting records; changing or deleting payments; reversing
financial records; changing supplier or customer ledger balances; stock count correction
(`STOCK_COUNT`); manual stock removal **not linked to a document** (`MANUAL_REMOVE`,
`DAMAGE_LOSS`); database repair and maintenance; changing user roles; dangerous overrides.

**Admin password is NOT required for:** document-linked stock deduction from a valid sales order;
scanning; viewing inventory; normal order creation; normal product lookup.

**v1.8.0's manual inventory policy is unchanged by this correction** — `MANUAL_REMOVE`,
`STOCK_COUNT` and `DAMAGE_LOSS` keep ADMIN + password, because those are precisely the
"not linked to a document" removals the policy still guards. Nothing in §8 moves.

### 5.7.2 Where the security actually comes from

Removing the password prompt does not remove the control. For a document-linked deduction the
guarantees are structural, and each is stronger than a re-typed password:

1. **Role check** — `ADMIN` or `EMPLOYEE`, enforced at the route.
2. **Server-side derivation** — product, quantity and reference come from the `SalesOrderItem`
   row. The operator cannot choose any of them; a forged request body is ignored entirely.
3. **Database idempotency** — the partial unique index makes a second deduction of a line
   impossible, not merely discouraged.
4. **Audit trail** — a `StockMovement` with `createdById` plus a `SalesAudit` row with the actor's
   name and username, both immutable.
5. **Before/after quantities** — every movement records `quantityBefore` and `quantityAfter`
   under a CHECK constraint, so the ledger reconciles or the discrepancy is visible.
6. **Edits blocked after deduction** — a fulfilled line cannot be silently changed (§6.1).
7. **An explicit restore workflow** — the only way to undo is a recorded, admin-only reversal
   (§6.3), never a silent adjustment.

A password prompt on every counter sale would add none of the above. What it would add is
friction on the highest-frequency action in the app, and the predictable outcome of that friction
is staff falling back to untracked manual removals — which is *less* safe, because a manual
removal has no document behind it and no line-level idempotency.

The password remains valuable exactly where it was designed to be: on the rare, deliberate act of
correcting or reversing something that is already recorded.

---

## 6. Order editing, cancellation, and restoration

### 6.1 Locking a deducted line

While a line has an `ACTIVE` fulfillment:

- `PATCH /sales-orders/:id/items/:itemId` — refused.
- `POST /sales-orders/:id/items/:itemId/remove` — refused.
- Adding *new* lines to the order stays allowed; they are simply not yet deducted.
- Order-level edits (delivery fee, dates, notes, payment) stay allowed — they do not move goods.

Message: *"Stock has already been deducted for this line. Restore the stock before editing. /
تم إخراج المخزون لهذا السطر. أعد المخزون قبل التعديل."*

**Guard ordering is settled.** In `updateItem`
and `removeItem`, `assertEditable` and `assertNoFinancialLink` both run *before* the item is
loaded (`sales-orders.service.ts:230`, `:266`), so an order that has both a linked debt and a
deducted line will report *"unlink the financial record"* and never mention the stock. The
fulfillment check can only run after item lookup, so it is structurally last unless the code is
rearranged.

**Keep the existing order.** Unlinking the financial record is a
prerequisite for editing regardless, so it is not a wrong instruction — merely an incomplete one,
and the user hits the stock message on the next attempt. Reordering means moving an item lookup
ahead of two guards that currently protect it for a cosmetic gain. If both conditions exist, the
financial-link error appearing first is accepted v1.9.0 behaviour.

In `terminalMutation` the ordering *is* free — the order is already loaded — so put the
fulfillment check immediately after the financial-link check, where it reads naturally.

Stock is never silently recalculated from an edited order. That is the "ERP magic" failure mode
in its purest form.

### 6.2 Restoration must ship **with** deduction, not after it

The brief asks whether restore/cancel belongs in v1.9.0 or v1.10.0. **It belongs in v1.9.0**, and
deferring it is not the conservative choice — it is the dangerous one.

If deduction ships without restoration, then the moment a deducted order is cancelled (an
everyday event in a shop: customer changes their mind, delivery fails, wrong model), the system
is in a state with no legitimate exit. Cancellation is blocked because stock is out. The
fulfillment cannot be reversed because there is no reversal path. The line cannot be edited. The
operator's only remaining move is a manual `MANUAL_ADD` that restores the number while leaving
the fulfillment row `ACTIVE` forever — so the order stays permanently uncancellable *and* the
stock has now been added back outside the document trail. That is a deadlock of exactly the
shape the v1.8.0 plan already identified and rejected for zero opening counts.

Deduction and restoration are one feature. Ship them together.

### 6.3 Restoration design

`SalesOrderInventoryService.restoreStock(orderId, { fulfillmentIds, reason }, …)`

**ADMIN role only. A typed reason is required. No account password** — see the reasoning below.

Per fulfillment, in one transaction:

1. Load the fulfillment; assert it belongs to the order and `status = ACTIVE`.
2. Assert `user.role === Role.ADMIN`; assert the typed `reason` is present and non-empty via the
   existing `normalizeRequiredReason`. Restoration is the one action in this release where the
   reason is **not** server-generated (§5.5.1): the document says what was deducted, but only the
   admin knows why it is coming back.
3. `before = product.stockQuantity`; `after = before + fulfillment.quantity`; overflow-guard
   against the existing `2_147_483_647` ceiling.
4. `compareAndSetQuantity`; assert `count === 1`.
5. Insert `StockMovement` with `movementType = SALE_CANCEL_RESTORE`, `quantityChange = +quantity`,
   `referenceType = 'SALES_ORDER_ITEM'`, `referenceId = <item id>`, and the admin's typed reason.
6. Update the fulfillment: `status = REVERSED`, `reversalStockMovementId`, `reversedAt`,
   `reversedById`, `reversalReason`. The partial unique index now frees the line, so a corrected
   quantity can be deducted again later.
7. `SalesAudit` row, `action = RESTORE_STOCK`.

Duplicate restoration is prevented by the `status = ACTIVE` precondition plus the
`reversalStockMovementId @unique` column, both enforced inside the same serializable transaction.

**Why role-only rather than ADMIN + password, given that restoration is a reversal.** The policy
correction defaults reversals of *financial* records to a password, and restoration is
superficially in that family. Three things separate it:

- **It reverses an inventory record, not a financial one.** No debt, payment, or balance moves.
  The ledger it corrects is the stock ledger, which this release keeps deliberately separate.
- **It cannot be used to hide anything.** The fulfillment row is not deleted — it becomes
  `REVERSED` with the admin's name, timestamp and typed reason attached, and both movements stay
  in the append-only ledger. A restore *adds* evidence rather than removing it.
- **The password gate is already downstream, at the action restoration exists to enable.**
  Cancelling or returning an order calls `requireAdminVerification`
  (`sales-orders.service.ts:575`) and therefore already demands ADMIN + password. So the realistic
  sequence — restore the stock, then cancel the order — still hits a password prompt at the
  moment that actually matters. Adding a second prompt one step earlier trains people to type the
  password twice in a row without reading either dialog, which makes the *downstream* gate weaker,
  not the upstream one stronger.

The typed reason is doing the real work here: it is the thing an auditor reads, and it cannot be
supplied by muscle memory.

### 6.4 Cancel and return

`terminalMutation` gains one more guard, in the same shape as the existing debt/installment
guard:

> If the order has any `ACTIVE` fulfillment, refuse cancellation or return, naming the Restore
> Stock action. *"Stock is still deducted for this order. Restore it before cancelling. / لا يزال
> المخزون مخصومًا لهذا الطلب. أعِد المخزون قبل الإلغاء."*

No override, no "confirm handled manually" escape hatch. An override would let stock and
documents disagree, which is the failure this release exists to prevent, and it is unnecessary
because restoration is always available to an admin.

`restore` (un-cancelling an order back to an open status) needs no inventory guard: a cancelled
order can only have `REVERSED` fulfillments, so restoring it simply makes its lines eligible for
deduction again.

**Returns — settled.** `returnOrder` requires `DELIVERED` and is the correct place for a returned-goods
flow, but a *return* is physically different from a *cancellation*: goods come back, possibly
damaged, possibly not all of them. v1.9.0 treats a return exactly like a cancellation — restore
first, then mark returned — and the operator uses the existing `DAMAGE_LOSS` movement for
anything that came back unsellable. Grading returned goods is out of scope.

### 6.5 Exact v1.9.0 user-facing copy

New labels and errors use the repository's `English / عربي` convention:

| Purpose | Exact text |
| --- | --- |
| Deduction action | `Deduct Stock / إخراج من المخزون` |
| Restoration action | `Restore Stock / إرجاع إلى المخزون` |
| Optional deduction note | `Note (optional) / ملاحظة (اختياري)` |
| Required restoration reason | `Reason / السبب *` |
| Manual line | `Manual order lines cannot affect inventory / لا يمكن لأسطر الطلب اليدوية التأثير على المخزون` |
| Invalid order status | `This order is not eligible for stock deduction / هذا الطلب غير مؤهل لإخراج المخزون` |
| Already deducted | `Stock has already been deducted for this line / تم إخراج المخزون لهذا السطر` |
| Edit/remove lock | `Stock has already been deducted for this line. Restore the stock before editing or removing it. / تم إخراج المخزون لهذا السطر. أعد المخزون قبل تعديله أو حذفه.` |
| Active stock before terminal action | `Stock is still deducted for this order. Restore it before cancelling or returning it. / لا يزال المخزون مخصومًا لهذا الطلب. أعد المخزون قبل إلغائه أو إرجاعه.` |
| Insufficient stock | `Cannot deduct {quantity}; only {available} units are in stock / لا يمكن إخراج {quantity}؛ المتوفر {available} فقط` |
| Restoration reason missing | `Reason is required / السبب مطلوب` |
| Deduction success | `Stock deducted for sales order {orderNumber} / تم إخراج المخزون لطلب البيع {orderNumber}` |
| Restoration success | `Stock restored for sales order {orderNumber} / تمت إعادة المخزون لطلب البيع {orderNumber}` |

The existing bilingual stock-tracking-disabled and opening-count messages are reused unchanged.
The exact predates-opening-count message remains the one in §5.3. Authoritative movement and
audit reasons are generated on the backend; the frontend never supplies them for deduction.

---

## 7. Supplier receiving — deferred to v1.9.1

Supplier receiving is not part of v1.9.0. This document retains only these boundary decisions for
the later release:

- it will use its own receiving document rather than `SupplierTransaction`;
- it will be available to ADMIN or EMPLOYEE without an account password;
- it will never change supplier-ledger balances or imply a payable;
- its screen will live under Inventory, not inside Supplier Ledger;
- `PURCHASE_RECEIPT` stays reserved and unwired until then.

The v1.9.1 schema, routes, services, UI, tests, reconciliation rules, rehearsal, and release notes
must be designed and authorized in that release. CP-1903 must not create receiving tables early.

---

## 8. Manual inventory actions are untouched

Every v1.8.0 action stays exactly as it is: Add stock, Remove stock, Correct count, Damage/loss,
Return to stock, Verify opening count. Same routes, same permissions, same dialogs.

They are the fallback and the correction mechanism. Document-linked movements handle the normal
path; manual movements handle everything the documents cannot express. A v1.9.0 change that makes
a manual action harder to reach is a regression, and the frontend tests should assert the manual
actions are still present.

---

## 9. Customers and ledgers

- A customer profile never changes stock. Stock reaches a customer only through a sales order.
- The customer-profile fulfillment indicator is **deferred**. v1.9.0 adds no chip or action there.
- No inventory action creates or edits `Debt`, `Payment`, `PaymentAllocation`, `InstallmentPlan`,
  `Installment`, or `Transaction`.
- No inventory action creates or edits `SupplierTransaction`, or changes any supplier balance.
- Receivables totals, dashboard financial figures, and settlement state are untouched by every
  path in this release.

---

## 10. Dashboard and inventory screen additions

Allowed, and all of it is counting rows that already exist:

- **Orders awaiting stock deduction** — count of non-terminal, non-draft orders holding at least
  one `AVAILABLE` line. Clicks through to a filtered order list.
- **Recent sale fulfillments and restorations** in the existing movement feed, each row linking
  back to its source sales order.
- Products needing onboarding, low stock, out of stock — already live, now reflecting document
  movements automatically.

Explicitly not allowed, and not by accident: stock valuation, COGS, FIFO, weighted average,
margin, profit, supplier payables, customer receivable arithmetic. `costPrice` exists on
`Product` and must not be multiplied by a quantity anywhere in this release.

`MovementHistory` gains a source-document link for `SALE_FULFILLMENT` and
`SALE_CANCEL_RESTORE`, resolved through the fulfillment table rather than by parsing
`referenceType`.

---

## 11. Migration and database safety

### Rules

- **Additive only.** `CREATE TYPE`, `CREATE TABLE`, `CREATE INDEX`, `ALTER TYPE … ADD VALUE`.
- No `DROP`, no `TRUNCATE`, no `DELETE`, no `UPDATE` of existing rows, no `prisma migrate reset`.
- **No backfill.** No historical sales order is converted into a fulfillment. Every pre-v1.9.0
  order is "not deducted", and §5.3
  ensures the ones that predate their product's opening count can never be deducted.
- No change to any customer, debt, payment, installment, or supplier-ledger row.
- New enums are new types; the two additions to `SalesAuditAction`
  (`DEDUCT_STOCK`, `RESTORE_STOCK`) use `ALTER TYPE … ADD VALUE`, which is additive and cannot
  invalidate existing rows. Note that PostgreSQL will not let a newly added enum value be used in
  the same transaction that added it — keep the `ALTER TYPE` in its own migration statement, and
  confirm behaviour during the scratch rehearsal.

### Rehearsal — two stages, both required

1. **Scratch rehearsal.** `npm run rehearse:migrations -- --confirm-scratch`. Proves the bundle
   applies to an empty database and that a half-applied migration is detected.
2. **Restored business-PC backup rehearsal (CP-1907).** Restore a real backup to a local
   database and apply the migration there. This is what gates the release; it cannot happen
   before the migration is written, and no installer reaches the shop PC until it passes.
   Capture: row counts before/after for `products`, `stock_movements`, `sales_orders`,
   `sales_order_items`, `suppliers`, `supplier_transactions`, `debts`, `payments` — all must be
   identical except that `sales_order_stock_fulfillments` exists and is empty; plus timing, and the v1.8.0
   reconciliation check still passing.

### Helper SQL

Report-only, mirroring the `backend/prisma/repair/inventory-v1.8.0/` pattern under a new
`inventory-v1.9.0/` folder:

- `01_document_link_preflight_report.sql` — orders with lines that would be eligible, grouped by
  eligibility state; count of orders predating their product's opening count.
- `02_fulfillment_reconciliation_check.sql` — for every product,
  `SUM(quantityChange) = stockQuantity`; every `ACTIVE` fulfillment has exactly one
  `SALE_FULFILLMENT` movement and no reversal; every `REVERSED` fulfillment has exactly one of
  each.

Nothing in these files writes. No `manifest.json` entry is added unless the CP-1907 rehearsal
turns up drift that needs a business-PC-safe repair, which is the only condition under which a
repair script is justified.

---

## 12. Test plan

### Sales deduction — backend

- Deducting an eligible line creates exactly one `SALE_FULFILLMENT` and one fulfillment row.
- `Product.stockQuantity` decreases by exactly the line quantity;
  `quantityBefore + quantityChange = quantityAfter`.
- Second deduction of the same line → 409, no second movement, stock unchanged.
- **Concurrency:** two simultaneous deduct requests for the same line → exactly one fulfillment,
  exactly one movement, the other returns a conflict. Assert on rows, not on the response only.
- `P2002` on the partial unique index maps to a **409 `SalesConflictError`, not a 500** and not a
  retry. Assert the status code, not just that an error was thrown — the failure mode here is an
  unhandled `P2002` falling through `error.middleware.ts` as a 500.
- Insufficient stock → rejected, stock unchanged, no movement.
- Product without a verified opening count → rejected with `ONBOARDING_REQUIRED`.
- Manual line (`productId = null`) → rejected.
- `trackStock = false` → rejected.
- Order in `DRAFT` / `CANCELLED` / `RETURNED` → rejected.
- **Order dated before the product's opening count → rejected** (§5.3), including a
  **midnight-boundary case** with an explicit `BUSINESS_TIMEZONE` where the UTC date and the
  Beirut date differ — a midday fixture passes even with the broken UTC helper.
- **Two lines of the same product on one order:** both deducted, balance chains correctly
  (10 → 8 → 6), and two lines of 6 against a stock of 10 are rejected **as a pair**.
- Multi-line order where one line is ineligible → **nothing** is deducted, whole request fails.
- An `itemId` belonging to a different order → rejected, nothing deducted.
- Forged request body: extra `productId`, `quantity`, `referenceId`, `referenceType` fields are
  ignored entirely; movement matches the stored line. Include a case where the forged quantity
  differs from the stored quantity and assert the *stored* one was used.
- **Permission policy per §5.7, asserted as behaviour rather than as configuration:**
  - EMPLOYEE **can** deduct stock from a valid sales order, and no password field is accepted.
  - An `accountPassword` sent to the deduction endpoint is ignored, not honoured as a bypass and
    not rejected as a validation error.
  - EMPLOYEE **cannot** restore stock — 403, no movement, stock unchanged.
  - ADMIN can restore with a typed reason; an empty or whitespace-only reason is rejected.
  - Restoration requires **no** password, and none is prompted for.
  - The v1.8.0 manual policy is intact: `MANUAL_REMOVE`, `STOCK_COUNT` and `DAMAGE_LOSS` still
    demand ADMIN + password. Add a regression test asserting this, because §5.7.1 relaxes the
    neighbouring paths and it would be easy to relax these by accident.
  - The deduction route uses an explicit role list, so an unknown/third role is refused.

### Restoration — backend

- Restore creates one `SALE_CANCEL_RESTORE`, stock increases by the fulfillment quantity,
  fulfillment becomes `REVERSED` with reversal fields populated.
- Restoring an already-`REVERSED` fulfillment → rejected, no movement.
- Restore as EMPLOYEE → 403, no movement, stock unchanged, fulfillment still `ACTIVE`.
- After restore, the line becomes eligible again and can be deducted a second time.
- Concurrent restore of the same fulfillment → exactly one reversal movement.

### Order interaction — backend

- `updateItem` and `removeItem` refuse a line with an `ACTIVE` fulfillment; both succeed once it
  is `REVERSED`.
- `cancel` and `returnOrder` refuse while any `ACTIVE` fulfillment exists; both succeed after
  restoration.
- Adding a new line to an order that already has a deducted line still works.
- The `onDelete: Restrict` backstop: deleting a fulfilled `SalesOrderItem` directly fails at the
  database.

### Ledger safety — backend, and non-negotiable

For every write path in this release, snapshot before and after and assert **unchanged**:
`debts`, `payments`, `payment_allocations`, `installment_plans`, `installments`, `transactions`,
`supplier_transactions`; plus each order's `paidAmount`, `remainingAmount`, `paymentStatus`,
`settlement`, `debtId`, `installmentPlanId`; plus the customer receivable totals and the
dashboard financial figures.

### Reconciliation invariant

Carried forward from v1.8.0 and extended: after any sequence of manual, sale-fulfillment, and
restore movements, for every tracked product
`SUM(StockMovement.quantityChange) = Product.stockQuantity`, and the newest movement's
`quantityAfter = Product.stockQuantity`.

### Frontend

- The sales-order details page shows an inventory section with a per-line state chip.
- **Deduct Stock / إخراج من المخزون** appears only when at least one line is `AVAILABLE`, and is
  disabled while a request is in flight.
- Each ineligible state shows its own reason text, bilingual, in the `English / عربي` house
  format from `frontend/src/shared/labels/business-labels.ts`.
- A deducted line renders locked with the "already deducted" explanation.
- Insufficient stock is visible *before* the button is pressed.
- Cancel on an order with active fulfillments surfaces the restore-first message.
- **All six manual inventory actions are still present** in the product inventory panel.

### Manual verification script (developer machine, seeded data)

Onboard a product with a verified count → create an order for it → deduct → retry the deduction →
try to edit the line → try to cancel the order → restore → cancel → confirm customer debt,
payments and supplier ledger are unchanged → confirm the dashboard inventory cards moved and the
dashboard financial cards did not.

---

## 13. Checkpoints

| CP | Content | Gate |
| --- | --- | --- |
| **CP-1901** | Repo review at v1.8.0. Verify §1 baseline against the actual code. **No code written.** | ✅ **Complete 2026-08-13.** Baseline confirmed; corrections marked **[CP-1901]** throughout |
| **CP-1902** | Finalise sales-only deduction/restoration design and close decisions. **Planning files only.** | ✅ **Complete 2026-08-13.** Decisions recorded in §14 |
| **CP-1903** | Prisma schema + additive migration for `sales_order_stock_fulfillments` and two `SalesAuditAction` values only. No backfill. Scratch rehearsal. | ✅ **Complete 2026-08-13.** Migration and constraints verified on scratch PostgreSQL; exact partial-index `P2002.meta` pinned |
| **CP-1904** | Backend sales deduction **and restoration** service, routes, validators, tests. Order-edit and cancel guards. | ✅ **Complete 2026-08-13.** Targeted and full suites green |
| **CP-1905** | Frontend sales-order inventory panel, deduct/restore actions, per-line states, tests. | ✅ **Complete 2026-08-13.** Server-owned states and password-free actions verified |
| **CP-1906** | Dashboard counter, sales movement-history links, release notes. | ✅ **Complete 2026-08-13.** Filter and authoritative source links verified |
| **CP-1907** | **Rehearsal on a restored business-PC backup.** Row-count comparison, timing, reconciliation check. | ✅ **Passed 2026-08-13.** Release gate satisfied; see §17 |
| **CP-1908** | Final v1.9.0 review. No bump, build, installer, or commit without explicit approval. | 🔄 **Remediation implemented 2026-08-13; re-review pending.** Initial review found the dashboard SQL timezone conversion was inverted |

Supplier receiving begins later under a separate v1.9.1 plan and authorization. It is not a
v1.9.0 checkpoint.

### 13.1 CP-1902 working-tree gate before CP-1903 — resolved

At CP-1902 review time:

- HEAD is `f6339124078034592d894392d6bda971d57a339d` on `main`;
- `package.json` is `1.8.0`;
- `main` is ahead of `origin/main` by 2 and behind by 0;
- 21 tracked files are modified, all under product/service backend or frontend code;
- three untracked backend product/service test/source files and an untracked v1.8.1 release-notes
  directory are part of the active security-friction cleanup;
- the v1.9.0 plan/prompt and unrelated WhatsApp, Financial Truth Foundation, and Mobile Scanner
  planning files are untracked;
- `stash@{0}` is `bucket-c: electron version propagation, pricing panel, setup scripts (excluded
  from v1.8.1)`.

The active product/service security cleanup was validated, packaged, and committed as v1.8.1 at
`9c46f712bec2fb2e13cfbff65e565ab974f251d8`. Before CP-1903 began, the tracked tree was clean,
`package.json` was `1.8.1`, Bucket C remained isolated in `stash@{0}`, and only planning markdown
was untracked. The gate therefore passed. CP-1903 did not apply or alter the Bucket C stash.

---

## 14. Closed decisions — CP-1902

1. **Release split:** v1.9.0 is sales deduction/restoration only. Supplier receiving, including
   its schema, is v1.9.1.
2. **Deduction permission:** ADMIN or EMPLOYEE, no account password, explicit button only.
3. **Restoration permission:** ADMIN only, no account password, typed non-empty reason required.
4. **Fulfillment unit:** whole order line only; partial fulfillment is deferred.
5. **Delivered orders:** deduction is allowed on `DELIVERED` when every other eligibility rule
   passes and the line has no active fulfillment.
6. **Cancellation and returns:** active fulfillments must be explicitly restored first. There is
   no automatic restore and no override. Returns use the same restore-first rule; damaged goods
   use the existing manual `DAMAGE_LOSS` path.
7. **Reason policy:** deduction movement/audit reason is generated by the backend from the order
   number; an optional note is accepted. Restoration requires the administrator's typed reason.
8. **Guard ordering:** preserve `assertEditable` then `assertNoFinancialLink`; check the selected
   line's active fulfillment after item lookup. In `terminalMutation`, check financial linkage
   before active fulfillment.
9. **Opening-count security:** unchanged at ADMIN + account password.
10. **Customer-profile chip:** deferred.
11. **Supplier receiving navigation:** deferred with v1.9.1; when built, it belongs under
    Inventory rather than Supplier Ledger.
12. **Product/service password cleanup:** excluded from v1.9.0 and handled by the separate v1.8.1
    security-friction work.
13. **CP-1903 gate:** it requires explicit authorization after application-code changes are clean
    or separately isolated and the suite is re-baselined.

---

## 15. Risks

| Risk | Severity | Mitigation |
| --- | --- | --- |
| **Double-counting historical orders.** An operator deducts months of past orders whose effect the verified opening count already includes, destroying the trusted stock number. | **Highest** | Server-side rejection of orders predating the product's `OPENING_BALANCE` (§5.3). No backfill. Never a client-side warning alone. |
| **Deduction without restoration** leaves orders that can be neither cancelled nor corrected. | High | Ship restoration in the same release (§6.2). |
| Double deduction from double-click, retry, or two terminals. | High | Partial unique index on `salesOrderItemId WHERE status='ACTIVE'`; `P2002` mapped to a conflict and never retried (§5.6). |
| Partial multi-line deduction leaves the operator unsure what happened. | High | Whole-or-nothing transaction; unknown item ids rejected rather than skipped (§5.5). |
| Financial coupling creeps in — a deduction touches a debt, payment, settlement, or ledger. | High | No financial writes in any new code path; before/after snapshot assertions across seven tables (§12). |
| Migration disturbs live shop data. | High | Additive only, no backfill, scratch rehearsal plus restored-backup rehearsal as the release gate (§11). |
| Operators bypass the feature and keep using `MANUAL_REMOVE`, so the order link is lost anyway. | Medium | Keep deduction fast and password-free (§5.7); surface "orders awaiting stock deduction" on the dashboard (§10). |
| **Password relaxation spreads by accident** into the manual paths it is meant to keep guarding (`MANUAL_REMOVE`, `STOCK_COUNT`, `DAMAGE_LOSS`, opening count). | Medium | §5.7.1 states the manual policy is unchanged; explicit regression tests assert each still demands ADMIN + password (§12). |
| **An EMPLOYEE deducts the wrong order's stock**, and no password stood in the way. | Medium | Deduction is reversible by design (§6.3) and fully attributed — `StockMovement.createdById` plus a named `SalesAudit` row. A password would not have prevented a wrong-but-authorised click; the audit trail and the restore path are what actually recover from it (§5.7.2). |
| Two concurrent multi-line deductions deadlock on product rows. | Medium | Deterministic `productId` ordering within the transaction; existing `P2034` retry absorbs the rest (§5.5). |
| `costPrice` is present and tempting; someone adds a valuation figure. | Medium | Explicitly forbidden; reconciliation and dashboard tests assert no valuation output (§10). |
| Scope creep into COGS / FIFO / Financial Truth Foundation. | Medium | Named out of scope here and in the build prompt; CP gates. |
| Enum addition behaviour under PostgreSQL (`ALTER TYPE … ADD VALUE` not usable in the adding transaction). | Low | Separate migration statement; verified in the scratch rehearsal (§11). |
| **[CP-1901] Timezone off-by-one in the double-count guard.** `prismaDateToBusinessDate` reads UTC fields; a `createdAt` timestamp near Beirut midnight resolves to the previous day, and the error runs in the unsafe direction — an ineligible order looks eligible. | **High** | Timezone-aware `timestampToBusinessDate` extracted from the existing `todayInBusinessTimezone`; midnight-boundary test with an explicit `BUSINESS_TIMEZONE` (§5.3, §12). |
| **[CP-1901] Stale balance across two lines of the same product** in one deduction — a batch pre-fetch would let a 10-unit stock satisfy two 6-unit lines. | High | Read inside the loop from the same `tx`; precheck against the running balance; explicit two-line test (§5.5). |
| **[CP-1901] Unhandled `P2002` becomes a 500.** No global Prisma error mapping exists, and `meta.target` for a raw partial unique index may not be the expected shape. | Medium | Local catch → `SalesConflictError` (409); discriminator determined empirically and pinned by a test; documented fallback (§5.6). |
| **Migration authored on an unreviewed working tree**, making the green test baseline unattributable. | Medium | Resolve or isolate the 21 active tracked product/service changes and re-baseline before CP-1903 (§13.1). |

---

## 16. Explicitly out of scope for v1.9.0

Automatic deduction on order create / confirm / status change; **all supplier receiving schema,
backend, frontend, tests, navigation, dashboard, and release-note work**; automatic receiving from
`SupplierTransaction`; automatic supplier payable or customer debt creation; any change to
customer or supplier ledger logic; Financial Truth Foundation; expenses; chart of accounts; COGS;
FIFO; weighted average; stock valuation; partial line fulfillment; graded returns; service-job
part consumption (`SERVICE_PART_USED` stays reserved
and unwired); multi-location stock; stock reservations or allocations; purchase orders;
WhatsApp or customer communication; unrelated UI rewrites.

---

## 17. CP-1904 through CP-1908 outcome — 2026-08-13

The sales-order deduction and restoration backend, frontend inventory panel, dashboard awaiting-
deduction counter/filter, authoritative movement-history links, report-only SQL, and release
notes are implemented. Deduction remains explicit, available to ADMIN and EMPLOYEE without an
account password; restoration remains ADMIN-only with a typed reason and no account password.
No supplier receiving, valuation, COGS, customer/debt/payment, or supplier-ledger behavior was
added.

The restored-business-backup rehearsal used
`homeconnect-2026-08-12-133854-manual.backup` in the local scratch database
`homeconnect_rehearsal_v190`. The retained rehearsal restore completed in 4.15 seconds, the clean
comparison restore completed in 6.85 seconds, and the two pending migrations deployed to the
retained rehearsal database in 3.01 seconds. Before and
after protected counts matched: 90 products, 20 sales orders, 22 order items, 167 customers, 124
debts, 112 payments, 7 suppliers, and 37 supplier transactions. The product inventory fingerprint
was identical (`02d3ea27e1b1feef495b6f9dcab40885`). The new fulfillment and stock-movement tables
contained zero rows after migration. Reconciliation reported 90 `NOT_IN_INVENTORY`, 0 pending,
0 product-ledger mismatches, and zero faults in every fulfillment-link category. The preflight
classified the 22 historical order lines as 18 `NOT_INVENTORY_LINE` and 4 `STOCK_NOT_TRACKED`;
none predated an opening count.

Final verification passed both TypeScript typechecks, lint with zero errors, 124 targeted tests,
and the full suite with 1,470 passing tests and 6 intentionally gated tests skipped. Package
version remains 1.8.1. No build, installer, commit, push, business-PC access, or version bump was
performed.

### CP-1908 review remediation

The initial independent review rejected CP-1908 on one HIGH display-consistency defect: the
awaiting-deduction SQL interpreted Prisma's UTC-naive `StockMovement.createdAt` as Beirut local
time. The query now converts `UTC → business timezone` explicitly, matching
`timestampToBusinessDate`. A PostgreSQL-gated midnight-boundary test verifies that an order from
the previous business day is excluded while an opening-day order is included.

The audit also confirmed that packaged HomeConnect intentionally starts before pending migrations
so Maintenance can make a verified backup before applying them. The inventory summary therefore
checks `to_regclass` and omits fulfillment relations/counts while this new table is pending,
keeping Maintenance and the existing dashboard reachable without auto-migrating. New action
schemas are strict and use the shared safe user-text validation. CP-1908 remains pending until
these corrections pass validation and independent re-review.
