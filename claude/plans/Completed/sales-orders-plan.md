# Sales Orders / طلبات البيع — Feature Plan

Status: planning only. No code, no migration, no version bump.
Target: HomeConnect v1.2.0 (feature release after 1.1.3).
Author role: ERP architect / sales workflow planner / full-stack planner.

This plan is grounded in the existing repository, not in generic ERP theory. The
conventions it reuses were read from:

- `backend/prisma/schema.prisma` (Customer, Product, Debt, InstallmentPlan, Payment, PaymentAllocation, PrepaidPurchase, ServiceJob, ServiceAudit)
- `backend/src/features/service/**` (closest structural analogue: numbered records, status workflow, audit, admin password)
- `backend/src/features/financial/**` (money, business dates, immutability policy)
- `backend/src/features/dashboard/**` (per-domain analytics modules)
- `frontend/src/features/service/**`, `frontend/src/features/dashboard/**`
- `docs/UI_GUIDELINES.md`

---

## 1. Version goal

Ship a **Sales Orders module** that lets shop staff record every sale the business
actually makes — walk-in, delivery, and phone — as a first-class record with an
order number, customer link, one or more product lines, backend-calculated money,
a fulfillment workflow, and a payment picture.

In scope for v1:

1. Create / list / view / edit sales orders with multiple line items.
2. Three sales channels: shop direct, shop delivery, phone order.
3. Fulfillment status workflow with delivery stages.
4. Backend-calculated totals, paid, and remaining — Decimal-safe, API returns strings.
5. **Explicit** conversion of a remaining balance into a Debt or an Installment Plan.
6. Admin edit / cancel / restore with account-password confirmation, reason, and audit.
7. Dashboard sales analytics section.
8. Bilingual EN/AR labels following the existing `Label / التسمية` pattern.

Explicit non-goals for v1: automatic financial record creation, stock movement,
invoices, taxes, delivery driver management. See §18.

**Success test:** an employee can record an AC sale with $180 down and $270
remaining, convert the remainder to a 3-month installment plan in one click, and
the dashboard shows the sale without double-counting the receivable.

---

## 2. Business workflow

```
Customer wants a product
        │
        ├── walks into the shop ─────────────► SHOP_DIRECT
        ├── walks in, needs delivery ────────► SHOP_DELIVERY
        └── calls the shop ──────────────────► PHONE_ORDER
                │
                ▼
    Employee creates a Sales Order
    (customer + channel + items + money + dates)
                │
                ▼
    Backend computes totalAmount / remainingAmount
                │
        ┌───────┴────────┐
        ▼                ▼
  Fully paid cash   Balance remains
   (done)                │
                         ▼
              Explicit action by user:
              "Create Debt"  or  "Create Installment Plan"
                         │
                         ▼
              Existing financial system owns the receivable
                         │
                         ▼
              Fulfillment continues (prepare → deliver)
```

Two independent tracks run after creation and must not be conflated:

| Track | Owner | Ends at |
|---|---|---|
| **Fulfillment** — is the product with the customer? | Sales Orders module | `DELIVERED` / `CANCELLED` / `RETURNED` |
| **Settlement** — has the money been collected? | Financial module (Debt / InstallmentPlan / Payment) | debt paid, plan completed, or cash-at-sale |

A delivered order can still be unpaid. A paid order can still be undelivered
(phone order paid up front, delivery tomorrow). This is why §4 recommends two
status fields.

---

## 3. Sales order cases

### Case 1 — Shop direct sale (`SHOP_DIRECT`)

Customer takes the product with them.

- `deliveryDate` not used; fulfillment jumps straight to `DELIVERED`.
- Payment: full cash / nothing / installment.
- UI: the create wizard collapses the delivery step entirely.

Flow shortcut: for a paid cash walk-in, the wizard should be completable in
**under 30 seconds** — customer, product, "Paid in full", save. This is the most
common case and must never feel like an ERP form.

### Case 2 — Shop order with delivery (`SHOP_DELIVERY`)

Customer buys in-shop; goods leave later (AC units, large appliances).

- `deliveryDate` expected (optional but prompted).
- `deliveryAddressSnapshot` prefilled from `Customer.address`, editable.
- `deliveryFee` optional, participates in the order total.
- Fulfillment moves `CONFIRMED → PREPARING → READY_FOR_DELIVERY → OUT_FOR_DELIVERY → DELIVERED`.
- Payment: full / partial / none.

Installation is **out of scope**. If installation work is later needed, it should
be created as a `ServiceJob` (`requestType: ON_CALL`) linked from the order, not
modelled inside the order. Note this as future work, do not build the link in v1.

### Case 3 — Phone order (`PHONE_ORDER`)

Employee records an order taken over the phone. This is a manual back-office
record, **not** an e-commerce checkout: no self-service, no cart, no payment
gateway, no customer-facing state.

- Customer must still be linked (create the customer inline if new — see §5).
- Delivery fields available (most phone orders are delivered).
- Typically starts `DRAFT` or `CONFIRMED`, unpaid.

---

## 4. Sales channel and status design

### 4.1 Sales channel

```prisma
enum SalesChannel {
  SHOP_DIRECT
  SHOP_DELIVERY
  PHONE_ORDER
}
```

Labels: `Shop Direct / بيع مباشر من المحل`, `Shop Delivery / طلب مع توصيل`,
`Phone Order / طلب عبر الهاتف`.

Deliberately **not** named `ONLINE` / `WEB`. If e-commerce is ever added it gets
its own value; renaming an enum later costs a migration and rewrites history.

### 4.2 Status: one field or two? — **Recommendation: two fields**

The repository already answers this question by example.
`ServiceJob.status` is a single enum because a service job has exactly one
lifecycle. Money in this codebase is *never* a status field — `Debt.status`,
`InstallmentStatus`, and `PaymentAllocation` are derived from allocation
arithmetic in `backend/src/features/financial/domain/balances.ts` and
`statuses.ts`.

A single merged enum would force nonsense states (`PAID` + `OUT_FOR_DELIVERY`
cannot both be expressed) and would let a fulfillment click silently overwrite a
payment fact. Two fields it is:

```prisma
enum SalesOrderFulfillmentStatus {
  DRAFT
  CONFIRMED
  PREPARING
  READY_FOR_DELIVERY
  OUT_FOR_DELIVERY
  DELIVERED
  CANCELLED
  RETURNED
}

enum SalesOrderPaymentStatus {
  UNPAID
  PARTIALLY_PAID
  PAID
}
```

### 4.3 Why `DEBT` and `INSTALLMENT` are *not* payment statuses

`DEBT` and `INSTALLMENT` answer "how is the remainder being financed?", not "how
much has been paid?". Putting them in the payment enum makes `PARTIALLY_PAID` and
`INSTALLMENT` mutually exclusive when they are routinely both true. Use a third,
tiny field:

```prisma
enum SalesOrderSettlement {
  NONE          // cash at sale, or nothing arranged yet
  DEBT          // linked to a Debt record
  INSTALLMENT   // linked to an InstallmentPlan
}
```

`settlement` is derived from `debtId` / `installmentPlanId` being present. Store
it anyway for cheap indexed filtering (the dashboard filters on it), and keep it
consistent inside the same transaction that creates the link.

**`paymentStatus` is fully derived by the backend** from `paidAmount` vs
`totalAmount` and is never accepted from the client. It is stored (not computed
on read) only so list queries and the dashboard can index it.

| Condition | paymentStatus |
|---|---|
| `paidAmount == 0` | `UNPAID` |
| `0 < paidAmount < totalAmount` | `PARTIALLY_PAID` |
| `paidAmount == totalAmount` | `PAID` |

### 4.4 Fulfillment transition rules

Initial status: `DRAFT` when saved from the wizard without confirming;
`CONFIRMED` when the wizard is completed normally. Shop-direct orders may be
created directly as `DELIVERED` (goods handed over at the counter).

Allowed graph:

```
DRAFT ──► CONFIRMED ──► PREPARING ──► READY_FOR_DELIVERY ──► OUT_FOR_DELIVERY ──► DELIVERED
  │           │             │                 │                     │                │
  │           └─────────────┴─────────────────┴─────────────────────┘                │
  │                              ▼                                                   ▼
  └────────────────────────► CANCELLED                                          RETURNED
```

- `SHOP_DIRECT` orders may go `DRAFT → CONFIRMED → DELIVERED` and skip the delivery stages.
- Terminal statuses: `DELIVERED`, `CANCELLED`, `RETURNED`.
- Backward moves within the open stages are allowed but are **sensitive** (reason + admin password), mirroring `assertStatusTransitionAllowed` / `isRoutineForwardTransition` in `backend/src/features/service/domain/service-status.ts`.
- Leaving a terminal status requires the explicit `restore` action (admin only), same shape as the service `reopen` action.

| Rule | Value |
|---|---|
| Initial | `DRAFT` or `CONFIRMED` |
| Terminal | `DELIVERED`, `CANCELLED`, `RETURNED` |
| Counted in dashboard sales | everything except `DRAFT`, `CANCELLED`, `RETURNED` |
| Freely editable | `DRAFT` (any user) |
| Editable with reason + password | `CONFIRMED` … `DELIVERED` |
| Not editable | `CANCELLED`, `RETURNED` — restore first |
| Requires admin password | cancel, restore, return, any backward transition, any money edit after `CONFIRMED` |

### 4.5 Cancelled and returned

- **`CANCELLED`** — the sale never happened. Excluded from all sales totals.
  Admin-only, reason required, `cancelledAt` / `cancelledById` / `cancelledReason` set.
  Linked Debt / InstallmentPlan are **not** touched automatically — the API
  refuses to cancel an order with a live financial link and tells the user to
  cancel the financial record first through the financial screens. This preserves
  the "financial records are immutable and owned by the financial module" rule in
  `backend/src/features/financial/domain/immutable-policy.ts`.
- **`RETURNED`** — the sale happened and was reversed after delivery. Excluded from
  forward-looking sales totals but kept in a separate "returns" figure. Same
  financial-link restriction. Refund handling is **out of scope** for v1; the
  order carries a note and the money is settled through the financial module.

---

## 5. Customer integration

Reuse `Customer` (`backend/prisma/schema.prisma:265`). Never copy the customer's
name or phone onto the order as editable fields — `Customer` is the single source
of truth, exactly as `ServiceJob`, `Debt`, and `InstallmentPlan` treat it.

- `SalesOrder.customerId` → `Customer` with `onDelete: Restrict`, matching every
  other customer-linked model.
- The order detail view reads the customer name/phone through the relation.
- Add `salesOrders SalesOrder[]` to the `Customer` model relations.

**Selection UX:** reuse `frontend/src/features/service/components/CustomerPicker.tsx`.
It already does debounced search by name/phone against the customers API and is
the pattern staff know. Do not build a second picker; if the component needs to
be shared between two features, promote it to `frontend/src/features/customers/components/`
and import it from both (a small refactor to schedule in CP10, not a rewrite).

**New customer during order creation — recommendation:** allow **inline quick
create** from inside the picker (name + phone + optional address), because the
phone-order case makes "go create the customer first, then come back" actively
hostile — the customer is on the line. Guard it:

- The quick-create form posts to the existing `POST /api/v1/customers` endpoint. No new customer-creation logic, no new validation path.
- Show a duplicate warning if the typed phone matches an existing customer, and offer to use that customer instead. Phone is indexed (`@@index([phone])`), so this is cheap.
- Full customer editing stays on the customers screens.

A sales order may never be saved with a null customer. "Walk-in / unknown" is not
supported — it would break the receivables and dashboard-by-customer views.

---

## 6. Product and order item design

### 6.1 Two tables from day one

Even though most sales are a single product, model `SalesOrder` + `SalesOrderItem`
now. Retrofitting a line-item table onto a single-product order after real data
exists means a data migration plus a rewrite of every total calculation. The cost
today is one extra table.

### 6.2 Catalog product or manual text

Follow the exact `ServiceJob` precedent (`productId` optional +
`manualProductName` / `manualProductModel`): the shop sells things that are not
in the catalog yet, and forcing catalog creation mid-sale is how staff end up
creating junk products.

- `productId` set → line is catalog-backed; snapshot `skuSnapshot`, `productNameSnapshot`, `productModelSnapshot` at creation so the line still reads correctly if the product is renamed or deactivated later.
- `productId` null → `manualProductName` required, `manualProductModel` optional.
- Exactly one of the two must be present (validated in `superRefine`, same style as `validateJobValues`).

### 6.3 Pricing

`Product` carries `price`, `discount`, `costPrice`, and preset-driven pricing
(`pricingPresetId`, `useCustomPricing`, the `custom*Percent` fields). The
calculator lives in `backend/src/features/pricing/calculator/`.

- When a catalog product is selected, the UI **suggests** the computed cash price via the existing pricing calculator endpoint (`/api/v1/pricing`), prefilling `unitPrice`.
- The user may override `unitPrice`. Overriding below `costPrice` is allowed but flagged in the UI and recorded in the audit as a price override.
- `discountAmount` is a per-line absolute amount (not a percent) — percents belong to the pricing engine, and mixing the two invites disagreement between what the label says and what the order says.

### 6.4 Money arithmetic — backend only

All of this uses `backend/src/features/financial/domain/money.ts`
(`parseMoney`, `multiplyMoney`, `sumMoney`, `subtractMoney`, `moneyToApiString`).

```
lineTotal      = round2(quantity × unitPrice − discountAmount)
itemsSubtotal  = Σ lineTotal
totalAmount    = itemsSubtotal + deliveryFee
remainingAmount= totalAmount − paidAmount
```

Rules, non-negotiable:

- The frontend sends `quantity`, `unitPrice`, `discountAmount`. It **never** sends `lineTotal`, `totalAmount`, or `remainingAmount`; those are ignored if present.
- Rounding happens once per line at 2 decimals, then lines are summed. Never sum unrounded values and round at the end — the two disagree by cents and the cents are what customers argue about.
- The frontend may display an optimistic total while typing, clearly as a preview; the saved response replaces it.
- All money crosses the API as **strings** (`moneyToApiString`), consistent with every existing financial endpoint. No `number` in any money field of any DTO.
- DB columns are `Decimal @db.Decimal(12, 2)`, matching `Debt.originalAmount`.

---

## 7. Payment / debt / installment integration plan

This is the highest-risk part of the feature and the place where a wrong decision
silently corrupts the books.

### 7.1 The existing financial model owns receivables

`Debt`, `InstallmentPlan`, `Installment`, `Payment`, and `PaymentAllocation` form
a closed, allocation-based system. `PrepaidPurchase` is the precedent that matters
most — its schema comment says it plainly:

> Companion record for a Debt with kind = PREPAID_PURCHASE. Holds delivery state
> only; the Debt, Payment, and PaymentAllocation rows remain the immutable
> financial record and are never rewritten here.

**`SalesOrder` follows the same shape: it is a commercial/fulfillment record that
may *point at* financial records. It never becomes one.**

### 7.2 Decided: unpaid orders land in the ledger as a Debt

**Owner decision (2026-08-03), superseding the earlier "no financial record on
save" recommendation:** an order that is not fully paid must produce a `Debt`, so
the money shows up on the ledger / receivables page like any other amount owed.
Orders and the ledger are connected. Installment plans stay a separate explicit
action for now — *debt only for now*.

What this does **not** mean: a silent write. `Debt.dueDate` is required and
non-nullable in the schema, and the system cannot invent a due date. So the
wizard's payment step **asks for the due date whenever the order is not fully
paid**, and that answer is what authorises the debt. From the employee's side it
is one flow with no extra button; from the system's side the user supplied the
terms, the write is audited, and nothing happens behind their back.

| Order state at save | Financial record created |
|---|---|
| Paid in full (cash at counter) | **none** — nothing is owed, so nothing enters the ledger |
| Unpaid | `Debt` for `totalAmount`, due date from the wizard |
| Partially paid | `Debt` for `remainingAmount` only — never for the full total |
| Installment | no debt; the user runs `create-installment-plan` explicitly afterwards |

Counter cash is still **not** a `Payment` row. `PaymentAllocation` has to point at
a debt or an installment; a fully-paid walk-in has neither, so a fabricated
`Payment` would break the allocation invariants. The down payment is recorded on
the order, and the debt it creates is for the remainder only — which is exactly
the amount the customer actually owes.

The order list shows **payment status, not money duplication** — see §11.1. Once
a debt exists, the ledger owns the balance and the order stops being a second
place to read it from.

### 7.3 Conversion rules

There are two entry points to the same code path:

1. **At order creation** — the create payload carries `debtDueDate` when the order
   is not fully paid. The order, its items, the debt, the link, and the audit rows
   all commit in **one transaction**. If the debt fails, the order does not exist.
2. **Later, from the details page** — the endpoints below, for orders that were
   saved as `DRAFT`, or whose payment situation changed after the fact.

Both go through one shared service function. Do not write the debt-creation logic
twice.

**Atomicity (owner decision, CP6):** `DebtsService.createDebt` and
`InstallmentPlansService.createPlan` get an additive optional
`tx?: FinancialTransactionClient` parameter, threaded to the repositories that
already accept one (`DebtsRepository.createDebt(data, tx?)` already does, and
`verifyAdminPassword(..., tx?)` is the existing precedent for this pattern).
Behaviour with the parameter omitted is unchanged and the existing financial tests
must pass untouched. This is the only sanctioned edit to
`backend/src/features/financial/`.

`POST /api/v1/sales-orders/:id/create-debt`

- Requires `fulfillmentStatus != DRAFT` and `!= CANCELLED`.
- Requires `remainingAmount > 0`.
- Requires `debtId == null` **and** `installmentPlanId == null` (one financial link per order in v1).
- Creates a `Debt` with `kind: STANDARD`, `originalAmount = remainingAmount`, `customerId` from the order, `description` defaulting to `Sales order {orderNumber}`, `dueDate` supplied by the user.
- Sets `salesOrder.debtId`, `settlement = DEBT`, writes an audit row — all in **one transaction**.

`POST /api/v1/sales-orders/:id/create-installment-plan`

- Same preconditions.
- Creates an `InstallmentPlan` with `totalAmount = remainingAmount`, plus its `Installment` rows via the existing `installment-schedule.ts` generator. Do **not** reimplement schedule maths.
- Sets `salesOrder.installmentPlanId`, `settlement = INSTALLMENT`, writes audit.

Unlinking is admin-only, requires reason + password, does **not** cancel the
financial record (the financial screens own that), and is recorded in the audit.

### 7.4 The double-counting rule

> A currency amount appears in **exactly one** of two metric families.

| Family | Source of truth | Example metrics |
|---|---|---|
| **Sales value** | `SalesOrder.totalAmount` | Sales today, sales by day, average order value |
| **Receivables & collections** | `Debt` / `Installment` / `PaymentAllocation` | Outstanding, collected, overdue |

A converted order's remainder is counted **once**, in receivables. The sales
figure is a revenue-side number and is never added to the receivables figure to
produce a third total. Dashboard code must never sum across the two families;
the plan for §12 keeps them in visually separate cards for exactly this reason.

### 7.5 Resolved: the down payment does not reach the ledger

Worked example: AC for $450, $180 paid at the counter, $270 remaining converted
to a 3-month plan.

- Order: `totalAmount 450.00`, `paidAmount 180.00`, `remainingAmount 270.00`, `paymentStatus PARTIALLY_PAID`.
- Plan: `totalAmount 270.00` over 3 months. Correct — the customer owes 270, not 450.
- The **$180** exists only on the order. It is not a `Payment` row, so it does not appear in the financial ledger or collections totals.

That is correct for the receivables system (nothing was owed, so nothing was
collected) but means cash-in at point of sale is not visible in the ledger. The
repository has no cash/revenue ledger today — the ledger is receivables-oriented.

**Recommendation for v1:** keep the down payment as an order-level fact and
surface it in the sales-side dashboard cards ("Cash collected at sale today").
Do not fabricate `Payment` rows with no `Debt` to allocate against — the schema
requires `PaymentAllocation` to point at a debt or an installment, so a
counter-sale payment has nothing to allocate to and would corrupt the allocation
invariants.

**Owner decision (D2, 2026-08-03): accepted.** Shop cash-in stays out of the
receivables ledger for v1. What *does* reach the ledger is the unpaid remainder,
as a `Debt` (§7.2). If counter cash must appear in the ledger later, that needs a
cash/revenue account concept — a financial module change, not a sales-order
change. Do not attempt it inside this feature.

---

## 8. Delivery / shipping plan

Keep it to fields and status. No routing, no drivers, no carrier integration.

| Field | Type | Notes |
|---|---|---|
| `deliveryDate` | `DateTime? @db.Date` | Planned date; validated `>= orderDate` |
| `deliveredAt` | `DateTime? @db.Date` | Actual; set when entering `DELIVERED` |
| `deliveryFee` | `Decimal? @db.Decimal(12,2)` | Included in `totalAmount` |
| `deliveryAddressSnapshot` | `String? @db.Text` | Prefilled from `Customer.address`, editable |
| `deliveryNotes` | `String? @db.Text` | Landmarks, floor, phone-2, timing |

`deliveryAddressSnapshot` earns its place: delivery addresses genuinely differ
from the profile address (new apartment, relative's house, workplace), and
overwriting the customer profile because of one delivery is a data-quality bug.
It is a snapshot — editing it never touches `Customer`.

Delivery **state** lives in `fulfillmentStatus`; no separate `deliveryStatus`
field. Two overlapping status fields for the same physical process is exactly the
confusion §4.2 is trying to avoid.

`SHOP_DIRECT` orders hide all delivery fields in the UI and reject
`deliveryDate` / `deliveryFee` at validation.

---

## 9. Data model plan

New module namespace: `sales`. Table names snake_case with `@@map`, matching all
existing models.

### 9.1 Enums

```prisma
enum SalesChannel { SHOP_DIRECT SHOP_DELIVERY PHONE_ORDER }

enum SalesOrderFulfillmentStatus {
  DRAFT CONFIRMED PREPARING READY_FOR_DELIVERY OUT_FOR_DELIVERY DELIVERED CANCELLED RETURNED
}

enum SalesOrderPaymentStatus { UNPAID PARTIALLY_PAID PAID }

enum SalesOrderSettlement { NONE DEBT INSTALLMENT }

enum SalesAuditRecordType { SALES_ORDER SALES_ORDER_ITEM }

enum SalesAuditAction {
  CREATE
  UPDATE_DETAILS
  CHANGE_FULFILLMENT_STATUS
  CHANGE_PAYMENT
  ADD_ITEM
  UPDATE_ITEM
  REMOVE_ITEM
  LINK_DEBT
  LINK_INSTALLMENT_PLAN
  UNLINK_FINANCIAL
  CANCEL
  RESTORE
  RETURN
}
```

### 9.2 `SalesOrder`

```prisma
model SalesOrder {
  id          String @id @default(uuid()) @db.Uuid
  orderNumber String @unique

  customerId String   @db.Uuid
  customer   Customer @relation(fields: [customerId], references: [id], onDelete: Restrict)

  salesChannel SalesChannel
  orderDate    DateTime  @db.Date
  deliveryDate DateTime? @db.Date
  deliveredAt  DateTime? @db.Date

  fulfillmentStatus SalesOrderFulfillmentStatus @default(DRAFT)
  paymentStatus     SalesOrderPaymentStatus     @default(UNPAID)
  settlement        SalesOrderSettlement        @default(NONE)

  itemsSubtotal   Decimal  @db.Decimal(12, 2)
  deliveryFee     Decimal? @db.Decimal(12, 2)
  totalAmount     Decimal  @db.Decimal(12, 2)
  paidAmount      Decimal  @default(0) @db.Decimal(12, 2)
  remainingAmount Decimal  @db.Decimal(12, 2)

  deliveryAddressSnapshot String? @db.Text
  deliveryNotes           String? @db.Text
  notes                   String? @db.Text

  debtId String? @unique @db.Uuid
  debt   Debt?   @relation("SalesOrderDebt", fields: [debtId], references: [id], onDelete: Restrict)

  installmentPlanId String?          @unique @db.Uuid
  installmentPlan   InstallmentPlan? @relation("SalesOrderInstallmentPlan", fields: [installmentPlanId], references: [id], onDelete: Restrict)

  createdById String   @db.Uuid
  createdBy   User     @relation("SalesOrderCreatedBy", fields: [createdById], references: [id], onDelete: Restrict)
  updatedById String?  @db.Uuid
  updatedBy   User?    @relation("SalesOrderUpdatedBy", fields: [updatedById], references: [id], onDelete: Restrict)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  cancelledAt     DateTime?
  cancelledById   String?   @db.Uuid
  cancelledBy     User?     @relation("SalesOrderCancelledBy", fields: [cancelledById], references: [id], onDelete: Restrict)
  cancelledReason String?   @db.Text

  items  SalesOrderItem[]
  audits SalesAudit[]

  @@index([customerId])
  @@index([orderDate])
  @@index([deliveryDate])
  @@index([fulfillmentStatus])
  @@index([paymentStatus])
  @@index([salesChannel])
  @@index([settlement])
  @@index([fulfillmentStatus, orderDate])
  @@index([customerId, fulfillmentStatus])
  @@map("sales_orders")
}
```

`orderNumber` is already unique, so no extra index is added for it — the unique
constraint provides one. `@@index([fulfillmentStatus, orderDate])` backs the
default list sort; `@@index([customerId, fulfillmentStatus])` backs the customer
profile tab. Both mirror the `ServiceJob` composite indexes.

### 9.3 `SalesOrderItem`

```prisma
model SalesOrderItem {
  id           String     @id @default(uuid()) @db.Uuid
  salesOrderId String     @db.Uuid
  salesOrder   SalesOrder @relation(fields: [salesOrderId], references: [id], onDelete: Cascade)

  productId String?  @db.Uuid
  product   Product? @relation(fields: [productId], references: [id], onDelete: Restrict)

  manualProductName  String?
  manualProductModel String?

  productNameSnapshot  String
  productModelSnapshot String?
  skuSnapshot          String?

  quantity       Int      @default(1)
  unitPrice      Decimal  @db.Decimal(12, 2)
  discountAmount Decimal? @db.Decimal(12, 2)
  lineTotal      Decimal  @db.Decimal(12, 2)
  notes          String?  @db.Text

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([salesOrderId])
  @@index([productId])
  @@map("sales_order_items")
}
```

`onDelete: Cascade` on the order relation is safe and correct — items have no
independent meaning and no financial rows point at them. This is the same
reasoning as `ProductImage`. The product relation stays `Restrict` so catalog
rows referenced by a sale cannot be hard-deleted.

### 9.4 `SalesAudit`

Deliberately shaped identically to `ServiceAudit` (`schema.prisma:704`) so the
audit list component and repository can be near-copies.

```prisma
model SalesAudit {
  id                String               @id @default(uuid()) @db.Uuid
  recordType        SalesAuditRecordType
  recordId          String               @db.Uuid
  salesOrderId      String?              @db.Uuid
  salesOrder        SalesOrder?          @relation(fields: [salesOrderId], references: [id], onDelete: Restrict)
  action            SalesAuditAction
  changedById       String               @db.Uuid
  changedBy         User                 @relation("SalesAuditChangedBy", fields: [changedById], references: [id], onDelete: Restrict)
  changedByName     String
  changedByUsername String
  changedAt         DateTime             @default(now())
  reason            String               @db.Text
  beforeValues      Json
  afterValues       Json
  requestId         String?
  ipAddress         String?

  @@index([recordType, recordId, changedAt])
  @@index([salesOrderId, changedAt])
  @@index([changedAt])
  @@map("sales_audits")
}
```

### 9.5 Back-relations to add on existing models

- `Customer`: `salesOrders SalesOrder[]`
- `Product`: `salesOrderItems SalesOrderItem[]`
- `Debt`: `salesOrder SalesOrder? @relation("SalesOrderDebt")`
- `InstallmentPlan`: `salesOrder SalesOrder? @relation("SalesOrderInstallmentPlan")`
- `User`: `salesOrdersCreated`, `salesOrdersUpdated`, `salesOrdersCancelled`, `salesAudits`

### 9.6 Order numbering

`SO-YYYY-NNNN`, mirroring `SV-YYYY-NNNN` from
`backend/src/features/service/domain/job-number.ts`. Copy `formatServiceJobNumber`
/ `nextServiceJobNumber` into `sales/domain/order-number.ts` with its own unit
tests.

**Improve one thing:** the service version reads the latest number then formats,
which can collide under concurrent creates. Generate inside the create
transaction and retry once on a `P2002` unique-violation on `orderNumber`. Two
staff creating orders at the same counter second is unlikely but not impossible,
and a crashed sale is a bad failure mode. Do not retrofit this into the service
module as part of this feature.

---

## 10. Backend API plan

Module: `backend/src/features/sales/`, following `features/service/` layout.

```
backend/src/features/sales/
  index.ts
  domain/
    order-number.ts               + .test.ts
    sales-order-totals.ts         + .test.ts
    sales-order-status.ts         + .test.ts
    sales-errors.ts
    sales-types.ts
  authorization/
    sales-policy.ts               + .test.ts
  audit/
    sales-audit.ts
    sales-audit.repository.ts
  sales-orders/
    sales-orders.controller.ts
    sales-orders.repository.ts
    sales-orders.routes.ts        + .routes.test.ts
    sales-orders.service.ts       + .service.test.ts
    sales-orders.validator.ts     + .validator.test.ts
```

Mounted in `backend/src/app.ts`:

```ts
app.use('/api/v1/customers', requireAuth, customerSalesOrdersRoutes); // before customersRoutes
app.use('/api/v1/sales-orders', requireAuth, salesOrdersRoutes);
```

Order matters: `customerSalesOrdersRoutes` must be registered before
`customersRoutes`, matching how `customerServiceJobsRoutes` is placed at
`app.ts:87`.

### Endpoints

| Method | Path | Auth | Notes |
|---|---|---|---|
| `GET` | `/api/v1/sales-orders/summary` | any | Counts/totals for page header cards. Registered **before** `/:salesOrderId` |
| `GET` | `/api/v1/sales-orders` | any | Filters + pagination (§16) |
| `POST` | `/api/v1/sales-orders` | any | Creates order + items atomically |
| `GET` | `/api/v1/sales-orders/:salesOrderId` | any | Detail with items, customer, links |
| `PATCH` | `/api/v1/sales-orders/:salesOrderId` | any / admin per field | Sensitive fields require `accountPassword` + `reason` |
| `POST` | `/api/v1/sales-orders/:salesOrderId/fulfillment-status` | any / admin | Backward or terminal moves need password |
| `POST` | `/api/v1/sales-orders/:salesOrderId/payment` | any / admin | Sets `paidAmount`; recomputes derived money and `paymentStatus` |
| `POST` | `/api/v1/sales-orders/:salesOrderId/cancel` | admin | `reason` + `accountPassword` required |
| `POST` | `/api/v1/sales-orders/:salesOrderId/restore` | admin | Returns to a chosen open status |
| `POST` | `/api/v1/sales-orders/:salesOrderId/items` | any | Add line; recomputes totals |
| `PATCH` | `/api/v1/sales-orders/:salesOrderId/items/:itemId` | any / admin | Sensitive after `CONFIRMED` |
| `POST` | `/api/v1/sales-orders/:salesOrderId/items/:itemId/remove` | any / admin | Hard-deletes the row (items carry no financial history); refuses on the last remaining item |
| `POST` | `/api/v1/sales-orders/:salesOrderId/create-debt` | any | §7.3 preconditions |
| `POST` | `/api/v1/sales-orders/:salesOrderId/create-installment-plan` | any | §7.3 preconditions |
| `POST` | `/api/v1/sales-orders/:salesOrderId/unlink-financial` | admin | Password + reason; does not cancel the financial record |
| `GET` | `/api/v1/sales-orders/:salesOrderId/audit` | admin | Same shape as service audit endpoint |
| `GET` | `/api/v1/customers/:customerId/sales-orders` | any | Customer profile tab |

**No `DELETE` endpoint.** The user asked for "delete", and the UI will say
*Remove / إزالة* — but nothing in this codebase hard-deletes a business record
with money on it, and a hard delete would orphan audit rows and break linked
debts. `cancel` is the delete. §13 covers how this is presented honestly.

### Dashboard

```
GET /api/v1/dashboard/sales-summary
```

Added to `dashboardAnalyticsRoutes` in
`backend/src/features/dashboard/dashboard.routes.ts`, next to `/service-summary`
and `/product-summary`, reusing `dashboardQuerySchema`. Implemented in a new
`backend/src/features/dashboard/sales/` module (repository + service + types +
service test), matching the existing per-domain analytics folders.

### Response conventions

- Money fields: strings, via `moneyToApiString`.
- Dates: `YYYY-MM-DD` strings for business dates; ISO timestamps for `createdAt` / `changedAt`.
- Errors: existing `lib/errors.ts` classes through `middleware/error.middleware.ts`.
- Validation: `zod` schemas + `validate` middleware, `params` / `query` / body as today.

---

## 11. Frontend UI / UX plan

Feature folder `frontend/src/features/sales-orders/` mirroring
`frontend/src/features/service/`:

```
frontend/src/features/sales-orders/
  api/sales-orders.api.ts
  hooks/useSalesOrders.ts
  schemas/sales-orders.schemas.ts
  types/sales-orders.types.ts
  utils/sales-order-labels.ts
  utils/sales-order-status.ts
  components/
    SalesOrdersTable.tsx
    SalesOrderStatusChip.tsx
    PaymentStatusChip.tsx
    SalesChannelChip.tsx
    SalesOrderFilters.tsx
    SalesOrderSummaryCards.tsx
    CreateSalesOrderDialog.tsx
    SalesOrderItemsEditor.tsx
    ProductLinePicker.tsx
    PaymentSummaryCard.tsx
    DeliveryCard.tsx
    SalesOrderAuditList.tsx
    CustomerSalesOrdersSection.tsx
    sales-orders.components.test.tsx
```

Pages: `frontend/src/pages/sales-orders/SalesOrdersPage.tsx` and
`SalesOrderDetailsPage.tsx`. Routes `/sales-orders` and `/sales-orders/:id` in
`frontend/src/App.tsx`. Nav entry `Sales Orders / طلبات البيع` with a
`ShoppingCart` icon in `frontend/src/layouts/DashboardLayout.tsx`, placed above
Service.

### Style contract (from `docs/UI_GUIDELINES.md`)

Non-negotiable, because the guideline document is explicit about past breakage:

- Use `Button`, `Card`, `CardHeader`, `Badge`, `Modal`, `FormField`, `Input`, `Select`, `Table`, `Pagination`, `PageHeader`, `SectionHeader`, `EmptyState`, `Skeleton`, `BilingualLabel` from `@/components/ui`. Do not declare local button/card/badge classes.
- `slate-*` for neutrals — **never `gray-*`**.
- `brand-*` for accent; `success` / `warning` / `danger` / `info` for **state only**.
- Chart colours come from `--viz-*` in `.viz-root`, never status colours.
- Radius: `rounded-lg` controls, `rounded-xl` cards, `rounded-2xl` modals.
- **Light-only.** No `prefers-color-scheme` blocks.
- One `primary` button per screen. `IconButton` always gets a `label`.
- Labels above controls; no placeholder-as-label. Errors get icon **and** text.

### 11.1 Sales Orders page

```
┌───────────────────────────────────────────────────────────────────────┐
│ Sales Orders / طلبات البيع                        [ + Add Order ]     │
├───────────────────────────────────────────────────────────────────────┤
│ ┌─────────┐ ┌─────────┐ ┌───────────┐ ┌─────────┐ ┌───────────┐      │
│ │ Sales   │ │ Orders  │ │ Pending   │ │ Unpaid  │ │ Partial   │      │
│ │ Today   │ │ Today   │ │ Delivery  │ │ Orders  │ │ Payments  │      │
│ │ $2,340  │ │   7     │ │    4      │ │   11    │ │    3      │      │
│ └─────────┘ └─────────┘ └───────────┘ └─────────┘ └───────────┘      │
├───────────────────────────────────────────────────────────────────────┤
│ [search…] [Channel ▾] [Payment ▾] [Fulfillment ▾] [Dates ▾] [Reset]   │
├───────────────────────────────────────────────────────────────────────┤
│ Order#       Customer    Items       Total    Payment    Fulfillment  │
│ SO-2026-0044 Ali Hassan  AC 12k ×1   $450.00  ●Partial   ●Preparing   │
│ SO-2026-0043 Sara N.     Fridge ×1   $780.00  ●Paid      ●Delivered   │
└───────────────────────────────────────────────────────────────────────┘
```

**Owner decision (2026-08-03): the list shows status, not money detail.** There
are no `Paid` and `Remaining` columns. `Total` stays because a sales list without
an amount is useless, but the outstanding balance is the ledger's number and is
read there — or in the order details drawer. Two places showing the same balance
is two places that can disagree.

- Summary cards come from `GET /sales-orders/summary` — **never** computed from the paginated rows.
- Table on desktop; the same rows collapse to stacked cards under `md`. Reuse the responsive approach already used by `ServiceJobsTable.tsx`.
- Two badges per row: fulfillment (neutral/info/brand progression, `success` at `DELIVERED`, `danger` at `CANCELLED`) and payment (`danger` unpaid, `warning` partial, `success` paid). A small settlement icon marks orders linked to a debt or plan.
- Row click → details page. Row hover reveals quick actions (advance status, view).

### 11.2 Create Sales Order flow

A `Modal`-hosted wizard, six steps, with a persistent running-total footer so the
money is never off-screen.

| Step | Content | Skip rule |
|---|---|---|
| 1. Customer | `CustomerPicker` + inline quick-create | never |
| 2. Channel | Three large icon cards: Shop Direct / Shop Delivery / Phone Order | never |
| 3. Items | Product picker or manual entry, qty, unit price, discount, live line total; "Add another item" | never |
| 4. Payment | Radio: Paid in full / Partial / Unpaid; amount input for partial; live remaining | never |
| 5. Delivery | Delivery date, address (prefilled), notes, fee | skipped for `SHOP_DIRECT` |
| 6. Review | Full read-only summary + Save as draft / Confirm order | never |

Fast paths that matter:

- Steps 2, 4, 5 have sensible defaults, so a cash walk-in is: pick customer → pick product → Enter → Confirm.
- Barcode/SKU input in step 3 resolves a product directly (products already carry `sku` and `barcode`), which is the reason the label/SKU work shipped in 1.1.x.
- Stock hint under the product picker when `trackStock` is true: `In stock: 4` / `Low stock` / `Out of stock` — informational only, never blocking (§ stock rules below).

### 11.3 Details page

`/sales-orders/:id`, sectioned with `Card`s:

1. **Header** — order number, channel chip, both status chips, created/updated by, actions (`Edit`, `Advance status`, `Cancel`, admin-only `Restore`).
2. **Customer** — name, phone, link to the customer profile.
3. **Items** — line table with add/edit/remove; totals row.
4. **Payment** — total / paid / remaining, payment status, and the two conversion buttons (`Create Debt`, `Create Installment Plan`) when eligible. When already linked: a card showing the linked Debt or Plan with a link into the financial screens, plus admin-only `Unlink`.
5. **Delivery** — a vertical status timeline (Confirmed → Preparing → Ready → Out → Delivered) with dates, address, notes. Hidden for `SHOP_DIRECT`.
6. **History** — audit list, admin-only, reusing the `ServiceJobAuditList.tsx` shape.

### 11.4 Customer profile integration

Add a `CustomerSalesOrdersSection` to the customer profile page, matching the
existing `CustomerServiceJobsSection`, fed by `GET /customers/:id/sales-orders`.

---

## 12. Dashboard integration plan

Backend: `backend/src/features/dashboard/sales/` (repository, service, types,
service test) exposed at `GET /api/v1/dashboard/sales-summary`.

**Every figure is computed in SQL/Prisma aggregates on the backend.** The
frontend renders what it receives and computes nothing global — the same rule the
existing dashboard modules follow.

### Cards

| Card | Definition |
|---|---|
| Sales Today / مبيعات اليوم | Σ `totalAmount` where `orderDate = today`, excluding `DRAFT`/`CANCELLED`/`RETURNED` |
| Orders Today / طلبات اليوم | Count, same filter |
| Pending Delivery / بانتظار التوصيل | Count in `CONFIRMED`…`OUT_FOR_DELIVERY` with a channel that delivers |
| Unpaid Orders / طلبات غير مدفوعة | Count `paymentStatus = UNPAID`, open orders |
| Partial Payments / دفعات جزئية | Count `paymentStatus = PARTIALLY_PAID` |
| Installment Orders / طلبات تقسيط | Count `settlement = INSTALLMENT` |

### Charts

| Chart | Type | Notes |
|---|---|---|
| Sales by day | bar, last 30 days | `--viz-*` palette |
| Payment status distribution | donut | mirrors `ServiceStatusDonut.tsx` |
| Fulfillment status distribution | donut | |
| Delivery pipeline | horizontal funnel | counts per open stage |
| Top products sold | bar, top 5 | **catalog-backed lines only**; manual lines excluded and labelled as such, otherwise free-text typos become fake products |

Frontend: `SalesAnalytics.tsx` in
`frontend/src/features/dashboard/components/sections/`, chart components in
`components/charts/`, labels in `config/dashboard-labels.ts`, module entry in
`config/module-registry.ts`, query keys in `hooks/dashboard.queryKeys.ts`, fetcher
in `api/dashboard.api.ts`.

Placement: the sales section goes **above** service analytics — sales is the
higher-frequency daily activity.

**Double-count guard (§7.4):** the sales section shows sales-side money only. It
never shows outstanding receivables — those already live in the customer
financial section. If both are ever shown on one screen, they are visually
separated cards with distinct headers and are never summed.

---

## 13. Admin edit / delete policy

### Roles

- **Employee** — create orders, add/edit items and advance fulfillment forward while the order is open, record payments, run the conversion actions.
- **Admin** — everything, plus cancel, restore, return, backward status moves, money edits after confirmation, and unlink financial records.

Enforced with `requireRole([Role.ADMIN])` (`middleware/role.middleware.ts`) exactly
as `requireServiceAdmin` does.

### Sensitive-field policy

Add `SALES_ORDER_FIELD_POLICY` in `sales/authorization/sales-policy.ts`, same
shape as `SERVICE_JOB_FIELD_POLICY` (`true` = sensitive):

```
customerId: true          orderDate: true            salesChannel: true
deliveryDate: true        deliveryFee: true          paidAmount: true
fulfillmentStatus: true   unitPrice: true            discountAmount: true
quantity: true            productId: true
notes: false              deliveryNotes: false       deliveryAddressSnapshot: false
manualProductName: false  manualProductModel: false  item notes: false
```

Sensitive edits require `accountPassword` + `reason` (min 5 chars) in the request
body, verified via `verifyAdminPassword` from `backend/src/lib/admin-verification.ts`
**inside the same transaction** as the write. Field name is `accountPassword`,
matching the service validators — not `adminPassword`.

The password is never stored, never logged, never echoed. `lib/redaction.ts`
already handles this for logs; confirm the new field name is covered.

### Delete

The UI says **Remove / إزالة**; the backend performs a cancel. The confirmation
modal is explicit about it:

> This order will be marked cancelled and kept in history for auditing.
> سيتم إلغاء هذا الطلب والاحتفاظ به في السجل.

Refusals:

- Cancelling an order with a live `debtId` / `installmentPlanId` → `409` with a message pointing at the financial screen.
- Editing a `CANCELLED` / `RETURNED` order → `409`, restore first.

Hard delete is not exposed. If a genuinely mistaken order must vanish, that is a
data-fix task, not a product feature.

---

## 14. Audit / history plan

Every mutation writes exactly one `SalesAudit` row **inside the transaction that
performs it**. Never write the audit after a successful commit — a crash in
between produces an unexplained change.

| Action | When | Reason required |
|---|---|---|
| `CREATE` | order created | no (auto-reason) |
| `UPDATE_DETAILS` | header fields changed | if any sensitive field |
| `ADD_ITEM` / `UPDATE_ITEM` / `REMOVE_ITEM` | line change | if after `CONFIRMED` |
| `CHANGE_FULFILLMENT_STATUS` | status move | backward or terminal moves |
| `CHANGE_PAYMENT` | `paidAmount` changed | yes |
| `LINK_DEBT` / `LINK_INSTALLMENT_PLAN` | conversion | no (auto-reason with amount) |
| `UNLINK_FINANCIAL` | admin unlink | yes |
| `CANCEL` / `RESTORE` / `RETURN` | terminal transitions | yes |

`beforeValues` / `afterValues` hold only the changed keys, money as strings.
`changedByName` / `changedByUsername` are denormalised at write time so history
stays readable if a user is later renamed or deactivated — the `ServiceAudit`
precedent. `requestId` and `ipAddress` are populated from the request context.

Never write passwords, hashes, or full request bodies into the audit JSON.

Read path: `GET /sales-orders/:id/audit`, admin-only, paginated, newest first.

---

## 15. Arabic + English label strategy

Follow the established pattern exactly — see
`frontend/src/features/service/utils/service-labels.ts`. Labels are a single
string with both languages separated by ` / `, held in `Record<Enum, string>`
maps. There is no i18n framework in this project and this plan does not add one.

`frontend/src/features/sales-orders/utils/sales-order-labels.ts`:

```ts
export const SALES_CHANNEL_LABELS: Record<SalesChannel, string> = {
  SHOP_DIRECT: 'Shop Direct / بيع مباشر من المحل',
  SHOP_DELIVERY: 'Shop Delivery / طلب مع توصيل',
  PHONE_ORDER: 'Phone Order / طلب عبر الهاتف',
};

export const FULFILLMENT_STATUS_LABELS: Record<SalesOrderFulfillmentStatus, string> = {
  DRAFT: 'Draft / مسودة',
  CONFIRMED: 'Confirmed / مؤكد',
  PREPARING: 'Preparing / قيد التحضير',
  READY_FOR_DELIVERY: 'Ready for Delivery / جاهز للتوصيل',
  OUT_FOR_DELIVERY: 'Out for Delivery / في الطريق',
  DELIVERED: 'Delivered / تم التسليم',
  CANCELLED: 'Cancelled / ملغى',
  RETURNED: 'Returned / مرتجع',
};

export const PAYMENT_STATUS_LABELS: Record<SalesOrderPaymentStatus, string> = {
  UNPAID: 'Unpaid / غير مدفوع',
  PARTIALLY_PAID: 'Partially Paid / مدفوع جزئياً',
  PAID: 'Paid / مدفوع',
};
```

Field labels via the `BilingualLabel` primitive: Sales Orders / طلبات البيع,
Add Order / إضافة طلب, Customer / الزبون, Product / المنتج,
Order Date / تاريخ الطلب, Delivery Date / تاريخ التوصيل, Amount / المبلغ,
Paid / المدفوع, Remaining / المتبقي, Payment Status / حالة الدفع,
Delivery Status / حالة التوصيل, Quantity / الكمية, Unit Price / سعر الوحدة,
Discount / الحسم, Notes / ملاحظات, Cancel Order / إلغاء الطلب.

Rules:

- **Do not switch the app to RTL.** The layout stays LTR, as it is everywhere else.
- Any element rendering user-entered text (customer names, manual product names, notes, delivery addresses, audit reasons) gets `dir="auto"`.
- Enum labels are never assembled by string concatenation at render time — always from the label map, so a missed translation is a type error.

---

## 16. Validation rules

`sales-orders.validator.ts` with `zod`, reusing `dateSchema`, `uuidSchema`, and
`userTextSchema` from the existing validators.

### Order

| Rule | Error |
|---|---|
| `customerId` required, valid UUID, customer exists and not deleted | 400 / 404 |
| `orderDate` required, `YYYY-MM-DD` | 400 |
| `orderDate` not in the future beyond today | 400 |
| `deliveryDate` optional, `YYYY-MM-DD`, `>= orderDate` | 400 |
| `salesChannel` required, valid enum | 400 |
| `SHOP_DIRECT` must not carry `deliveryDate` / `deliveryFee` | 400 |
| At least one item required | 400 |
| Max 50 items per order | 400 |
| `paidAmount >= 0` | 400 |
| `paidAmount <= totalAmount` — overpayment rejected in v1 | 400 |
| `debtDueDate` required when `paidAmount < totalAmount` and the order is not being saved as `DRAFT` | 400 |
| `debtDueDate` rejected when the order is paid in full | 400 |
| `debtDueDate >= orderDate` | 400 |
| `deliveryFee >= 0` when present | 400 |
| `notes` / `deliveryNotes` via `userTextSchema`, max 1000 | 400 |
| `totalAmount`, `remainingAmount`, `lineTotal`, `paymentStatus` from client | ignored, never trusted |
| Editing a `CANCELLED` / `RETURNED` order | 409 |

Date comparison uses `compareBusinessDates` from
`backend/src/features/financial/domain/business-date.ts` — do not compare date
strings or `Date` objects ad hoc.

### Item

| Rule | Error |
|---|---|
| `quantity` integer `>= 1`, `<= 999` | 400 |
| `unitPrice > 0` | 400 |
| `discountAmount >= 0` and `<= quantity × unitPrice` | 400 |
| Exactly one of `productId` / `manualProductName` | 400 |
| `productId` must exist and be `isActive` | 400 |
| `manualProductName` 2–200 chars via `userTextSchema` | 400 |
| Removing the last item on an order | 409 |

### Financial conversion

| Rule | Error |
|---|---|
| `remainingAmount > 0` | 409 |
| `debtId == null && installmentPlanId == null` | 409 |
| `fulfillmentStatus` not `DRAFT` / `CANCELLED` / `RETURNED` | 409 |
| Debt `dueDate >= orderDate` | 400 |
| Plan `installmentCount` 2–60, `startDate >= orderDate` | 400 |
| Concurrent double-conversion | prevented by `@unique` on `debtId` / `installmentPlanId` + transaction |

### Stock

Product stock fields exist (`trackStock`, `stockQuantity`, `lowStockThreshold`)
and are managed by `features/service/products/product-stock.ts`.

- The order **reads** stock to display a hint and a soft warning when `quantity > stockQuantity`.
- The order **never** writes `stockQuantity`. Not on create, not on delivery, not on cancel.
- Selling more than stock is allowed with a warning — real shops sell items arriving tomorrow, and a hard block would push staff to lie to the system.
- The future inventory module owns stock movement. Any decrement logic added now would collide with it and would have to be unwound. This mirrors the `PrepaidPurchase` schema comment: *"Optional catalog reference. Carries no stock effect."*

---

## 17. Testing strategy

Vitest, matching existing naming and colocated placement.

### Backend domain (pure, fast, exhaustive)

`sales-order-totals.test.ts`
- line total with and without discount; rounding at `.005` boundaries
- multi-line subtotal + delivery fee → total
- remaining = total − paid; zero and exact-equal cases
- payment status derivation across all three bands
- rejects negative, non-finite, and over-precision inputs
- float-drift case: `3 × 33.33 + 0.01` stays exact

`order-number.test.ts` — format, sequence increment, year rollover, malformed previous value.

`sales-order-status.test.ts` — allowed/forbidden transitions, terminal detection, forward vs backward classification, channel-specific shortcuts.

### Backend routes/services

`sales-orders.routes.test.ts`
- create shop-direct paid order → `PAID`, no financial record
- create unpaid order → `UNPAID`, `remaining == total`
- create partial payment order → `PARTIALLY_PAID`
- create delivery order with delivery date → delivery fields persisted
- create phone order → delivery fields allowed
- client-sent `totalAmount` / `lineTotal` is ignored; backend value wins
- `deliveryDate < orderDate` → 400
- missing customer → 404; unknown customer id → 404
- zero items → 400
- catalog item and manual item both accepted; both-at-once → 400
- `SHOP_DIRECT` + `deliveryFee` → 400
- sensitive edit without `accountPassword` → 401/403; with wrong password → 401
- cancel writes a `SalesAudit` row with before/after and reason
- cancel with a linked debt → 409
- create-debt twice → 409 on the second call
- create-installment-plan generates the right number of installments
- editing a cancelled order → 409
- every money field in every response is a string
- audit endpoint is admin-only

`sales-orders.service.test.ts` — transaction boundaries: a failure after the order insert leaves no partial rows; audit and mutation commit together.

Dashboard: `sales-analytics.service.test.ts` — excludes `DRAFT`/`CANCELLED`/`RETURNED`, date-window boundaries, and no receivables figure leaks into the sales family.

### Frontend

`sales-orders.components.test.tsx`
- page renders with summary cards from the API, not from rows
- wizard completes a shop-direct sale
- customer picker selects an existing customer; quick-create posts to the customers API
- product picker prefills unit price; manual product path works
- payment mode switching updates the displayed remaining
- delivery step is hidden for `SHOP_DIRECT`, shown for the other two
- both status chips render the right tone and both languages
- filters compose into the query string
- details page renders items, payment, delivery, and (admin) history
- dashboard sales cards render
- Arabic text present in labels; `dir="auto"` on user-text elements
- table collapses to cards at mobile width

### Manual smoke (before release)

1. Direct paid cash sale, under 30 seconds.
2. Unpaid sale → create debt → verify it appears in receivables once.
3. Partial sale → create installment plan for the remainder → verify the schedule.
4. Delivery sale through all fulfillment stages.
5. Phone order with inline customer create.
6. Cancel an order (with and without a financial link).
7. Admin edit of a confirmed order's price with password + reason; verify audit.
8. Dashboard reflects the day's activity; no figure double-counts.

---

## 18. What is out of scope

Not planned, not stubbed, not half-built:

- E-commerce storefront, cart, self-service checkout, payment gateway.
- Full inventory management and stock movement/ledger. **No automatic stock decrement.**
- Delivery driver assignment, route planning, carrier/shipping integration, tracking numbers.
- Installation jobs (future: link to a `ServiceJob`, not modelled now).
- Tax / VAT, profit & loss accounting, COGS reporting.
- Invoice or receipt printing. (A future thin print view can reuse the existing product-label print infrastructure.)
- Refund processing and credit notes for returns.
- Multi-currency, multi-branch stock allocation.
- Automatic Debt / InstallmentPlan creation without an explicit user action.
- Order approval chains, quotes, or reservations.

---

## 19. Implementation checkpoints for Codex

Each checkpoint is independently reviewable and leaves the app working. Adjusted
from the suggested order in two places: the numbering utility folds into CP3, and
customer-profile integration joins CP11.

**CP1 — Confirm patterns.** Read `features/service/**`, `features/financial/domain/**`,
`features/dashboard/service/**`, and `docs/UI_GUIDELINES.md`. Confirm this plan
against reality and report any conflicts *before* writing code. No code.

**CP2 — Schema.** Add the four enums, three models, and back-relations from §9.
Generate the migration. Run `prisma/validate.ts`. Verify
`financial-domain-schema.test.ts` still passes.

**CP3 — Domain utilities.** `order-number.ts`, `sales-order-totals.ts`,
`sales-order-status.ts`, `sales-errors.ts`, `sales-types.ts` + unit tests. Pure
functions, no Prisma, Decimal-safe. Tests must pass before any HTTP work.

**CP4 — Create / list / detail API.** Repository, service, controller, validator,
routes; mount in `app.ts`. Includes `/summary` and `/customers/:id/sales-orders`.
Route tests for the happy paths and validation rejections.

**CP5 — Mutation, status, cancel, restore, audit.** `PATCH`, item endpoints,
`fulfillment-status`, `payment`, `cancel`, `restore`, `unlink-financial`, `audit`
read. Field policy + `verifyAdminPassword` + `SalesAudit` writes inside
transactions.

**CP6 — Financial conversion.** `create-debt` and `create-installment-plan`,
reusing the existing debt and installment-plan services and
`installment-schedule.ts`. Full precondition tests. **Do not modify any existing
financial module code** — call it.

**CP7 — Dashboard backend.** `features/dashboard/sales/` + `GET /dashboard/sales-summary`
+ service tests covering exclusions and date windows.

**CP8 — Frontend data layer.** `sales-orders.api.ts`, `sales-orders.types.ts`,
`sales-orders.schemas.ts`, `useSalesOrders.ts`, `sales-order-labels.ts`,
`sales-order-status.ts`. Money typed as `string` end to end.

**CP9 — Sales Orders page.** Page, route, nav entry, summary cards, filters,
table/card layout, status chips, empty and loading states.

**CP10 — Create wizard.** `CreateSalesOrderDialog` with all six steps. Promote
`CustomerPicker` to a shared location and update the service feature's import in
the same commit.

**CP11 — Details, edit, status, cancel + customer profile section.** Details page
with all six cards, admin actions with password/reason modals, audit list, and
`CustomerSalesOrdersSection` on the customer profile.

**CP12 — Dashboard frontend.** `SalesAnalytics` section, charts on `--viz-*`,
labels, module registry entry, query keys.

**CP13 — Polish and docs.** Responsive pass, Arabic label review, `docs/ERP_MODULE_MAP.md`
and `docs/ERP_DASHBOARD_INFORMATION_ARCHITECTURE.md` updates, full test run, manual
smoke list from §17, then version bump and release (separate, explicitly approved step).

---

## 20. Risks and open decisions

### Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | **Double-counting** sales value against receivables in dashboards | §7.4 metric-family rule; separate cards; a service test asserting no receivables figure appears in the sales summary |
| R2 | Float drift in money | Decimal everywhere, `money.ts` helpers, API strings, boundary tests in CP3 |
| R3 | Order-number collision under concurrency | Generate inside the transaction, unique constraint, retry once on P2002 |
| R4 | Future inventory module conflicting with stock logic added here | Sales orders never write stock in v1 (§16) |
| R5 | Cancel/unlink orphaning financial records | Refuse to cancel while a live link exists; unlink is admin + audited and never cancels the financial record |
| R6 | Wizard becoming slower than the paper it replaces | Step skipping, defaults, barcode entry, and a hard 30-second target for the cash walk-in path |
| R7 | Manual product names polluting product analytics | Top-products chart uses catalog-backed lines only, and says so |
| R8 | Scope creep into invoicing/inventory during implementation | §18 is binding; anything on that list needs a new plan |
| R9 | Duplicate `CustomerPicker` implementations drifting apart | CP10 promotes it to a shared component instead of copying |

### Resolved decisions (2026-08-03)

**D1 — Counter cash. RESOLVED.** No `Payment` row for cash taken at the counter;
it lives on the order as `paidAmount`. **Additionally:** an order that is not
fully paid creates a `Debt` for the remainder so it appears on the ledger, with
the due date collected in the wizard's payment step. See §7.2. *Debt only for
now* — installment plans stay a separate explicit action.

**D2 — Ledger visibility of shop cash-in. RESOLVED: accepted.** Cash-in stays out
of the receivables ledger; the unpaid remainder is what enters it. §7.5.

**D3 — One financial link per order. RESOLVED: accepted.** One `Debt` **or** one
`InstallmentPlan`, enforced by `@unique`, with a second conversion refused (409)
until an admin explicitly unlinks.

**D7 — Delivery fee. RESOLVED: accepted.** Included in `totalAmount`, therefore
in `remainingAmount` and in any debt created from it.

**CP6 atomicity — RESOLVED.** `DebtsService.createDebt` and
`InstallmentPlansService.createPlan` receive an additive optional `tx` parameter.
See §7.3. This is the only sanctioned change to the financial module.

### Open decisions — still need an answer

**D4 — Draft orders.** Keep `DRAFT` at all? It adds a status and a "why isn't this
in my totals?" question. Recommendation: keep it — phone orders genuinely get
taken half-finished — but confirm.

**D5 — Returns.** v1 marks `RETURNED` and records a note; no refund mechanics, no
stock effect. Confirm that is enough for now.

**D6 — Overpayment.** Rejected in v1 (`paidAmount <= totalAmount`). Does the shop
ever take a deliberate overpayment as credit? If so it belongs to the prepaid
flow, not here.

**D8 — Employee permissions.** Can an employee cancel a `DRAFT` order they just
created by mistake, or is cancel strictly admin? Recommendation: allow employees
to cancel their own same-day `DRAFT` orders; everything else admin.

---

## 21. Exact files likely to change

### New — backend

```
backend/src/features/sales/index.ts
backend/src/features/sales/domain/order-number.ts
backend/src/features/sales/domain/order-number.test.ts
backend/src/features/sales/domain/sales-order-totals.ts
backend/src/features/sales/domain/sales-order-totals.test.ts
backend/src/features/sales/domain/sales-order-status.ts
backend/src/features/sales/domain/sales-order-status.test.ts
backend/src/features/sales/domain/sales-errors.ts
backend/src/features/sales/domain/sales-types.ts
backend/src/features/sales/authorization/sales-policy.ts
backend/src/features/sales/authorization/sales-policy.test.ts
backend/src/features/sales/audit/sales-audit.ts
backend/src/features/sales/audit/sales-audit.repository.ts
backend/src/features/sales/sales-orders/sales-orders.controller.ts
backend/src/features/sales/sales-orders/sales-orders.repository.ts
backend/src/features/sales/sales-orders/sales-orders.routes.ts
backend/src/features/sales/sales-orders/sales-orders.routes.test.ts
backend/src/features/sales/sales-orders/sales-orders.service.ts
backend/src/features/sales/sales-orders/sales-orders.service.test.ts
backend/src/features/sales/sales-orders/sales-orders.validator.ts
backend/src/features/sales/sales-orders/sales-orders.validator.test.ts
backend/src/features/dashboard/sales/sales-analytics.repository.ts
backend/src/features/dashboard/sales/sales-analytics.service.ts
backend/src/features/dashboard/sales/sales-analytics.service.test.ts
backend/src/features/dashboard/sales/sales-analytics.types.ts
backend/prisma/migrations/<timestamp>_add_sales_orders/migration.sql
```

### Modified — backend

```
backend/prisma/schema.prisma                                   # enums, 3 models, back-relations
backend/src/app.ts                                             # mount sales routes (before customersRoutes)
backend/src/features/dashboard/dashboard.routes.ts             # GET /sales-summary
backend/src/features/dashboard/dashboard.controller.ts         # salesSummary handler
backend/src/features/dashboard/dashboard.types.ts              # summary types
backend/src/lib/redaction.ts                                   # confirm accountPassword redaction covers new routes
```

### New — frontend

```
frontend/src/features/sales-orders/api/sales-orders.api.ts
frontend/src/features/sales-orders/hooks/useSalesOrders.ts
frontend/src/features/sales-orders/schemas/sales-orders.schemas.ts
frontend/src/features/sales-orders/types/sales-orders.types.ts
frontend/src/features/sales-orders/utils/sales-order-labels.ts
frontend/src/features/sales-orders/utils/sales-order-status.ts
frontend/src/features/sales-orders/components/SalesOrdersTable.tsx
frontend/src/features/sales-orders/components/SalesOrderStatusChip.tsx
frontend/src/features/sales-orders/components/PaymentStatusChip.tsx
frontend/src/features/sales-orders/components/SalesChannelChip.tsx
frontend/src/features/sales-orders/components/SalesOrderFilters.tsx
frontend/src/features/sales-orders/components/SalesOrderSummaryCards.tsx
frontend/src/features/sales-orders/components/CreateSalesOrderDialog.tsx
frontend/src/features/sales-orders/components/SalesOrderItemsEditor.tsx
frontend/src/features/sales-orders/components/ProductLinePicker.tsx
frontend/src/features/sales-orders/components/PaymentSummaryCard.tsx
frontend/src/features/sales-orders/components/DeliveryCard.tsx
frontend/src/features/sales-orders/components/SalesOrderAuditList.tsx
frontend/src/features/sales-orders/components/CustomerSalesOrdersSection.tsx
frontend/src/features/sales-orders/components/sales-orders.components.test.tsx
frontend/src/pages/sales-orders/SalesOrdersPage.tsx
frontend/src/pages/sales-orders/SalesOrderDetailsPage.tsx
frontend/src/features/dashboard/components/sections/SalesAnalytics.tsx
frontend/src/features/dashboard/components/charts/SalesByDayChart.tsx
frontend/src/features/dashboard/components/charts/SalesPaymentStatusDonut.tsx
frontend/src/features/dashboard/components/charts/DeliveryPipelineChart.tsx
```

### Modified — frontend

```
frontend/src/App.tsx                                            # /sales-orders routes
frontend/src/layouts/DashboardLayout.tsx                        # nav entry
frontend/src/features/dashboard/api/dashboard.api.ts            # salesSummary fetcher
frontend/src/features/dashboard/hooks/dashboard.queryKeys.ts
frontend/src/features/dashboard/hooks/useDashboard.ts
frontend/src/features/dashboard/pages/DashboardPage.tsx         # render SalesAnalytics
frontend/src/features/dashboard/config/dashboard-labels.ts
frontend/src/features/dashboard/config/module-registry.ts
frontend/src/features/dashboard/types.ts
frontend/src/features/service/components/CustomerPicker.tsx     # promoted to shared (CP10)
frontend/src/pages/customers/CustomerProfilePage.tsx            # sales orders section
```

### Modified — docs

```
docs/ERP_MODULE_MAP.md
docs/ERP_DASHBOARD_INFORMATION_ARCHITECTURE.md
docs/DASHBOARD_ANALYTICS_DATA_FLOW.md
```

Untouched by design: everything under `backend/src/features/financial/` (called,
never modified) and `backend/src/features/service/products/` stock utilities.

---

## Plan summary

- Two status fields (`fulfillmentStatus` + `paymentStatus`) plus a small `settlement` field, because fulfillment and money are independent and `DEBT`/`INSTALLMENT` describe financing, not payment progress.
- `SalesOrder` is a commercial record that *points at* financial records and never becomes one — the `PrepaidPurchase` precedent.
- Debt and installment plans are created only by an explicit user action, never silently.
- All money is Decimal on the backend, strings across the API, never calculated in the browser.
- No stock movement in v1; the future inventory module owns that.
- "Delete" is a cancel, audited, admin-only, and blocked while a financial link is live.
- 13 checkpoints, each shippable; 8 open decisions listed in §20 that need answers before CP6.
```
