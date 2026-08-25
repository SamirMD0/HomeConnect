# Supplier → Inventory → Scanner → Sales → Ledger → Customer

**Type:** Planning / architecture review checkpoint. No code, no migration, no version bump.
**Created:** 2026-08-14
**Baseline:** repository at v1.9.0 (`package.json`), with v1.9.1 supplier receiving implemented but
uncommitted in the working tree.
**Predecessors:**
`claude/plans/inventory-management-plan.md` (v1.8.0 — stock movement ledger)
`claude/plans/inventory-v1.9.0-document-linked-movements-plan.md` (v1.9.0 — sales deduction)
`claude/plans/inventory-v1.9.1-supplier-receiving-plan.md` (v1.9.1 — supplier receiving)
`claude/plans/Completed/scanner-hub-mobile-lan-plan.md` (v1.7.0 — scanner hub)

---

## 0. One-paragraph summary

Everything the goal describes is *reachable* from where the code already stands, and none of it
requires touching the financial engine. The supplier ledger and the inventory ledger are already
correctly separated — v1.9.1 made that separation structural, and nothing in this plan weakens it.
What is missing is not architecture, it is three seams: a **visible link** between a supplier debt
and the delivery it paid for, a **usable product picker** that can hold a product the user just
scanned or just created, and a **POS-style preview** on the scanner that shows price and stock
without leaking either onto the phone. Two of those three are frontend work. The one genuine
design decision in this whole review is what "Quick Product Add" is allowed to do, because a new
product cannot legally receive stock until an **administrator** has verified an opening count with
an **account password** — and that guard is load-bearing, not friction to be removed.

---

## 1. Current workflow map

```
                       ┌──────────────────────────────────────┐
                       │            SUPPLIER                  │
                       │  suppliers (name, phone, isActive)   │
                       └───────┬──────────────────────┬───────┘
                               │                      │
              FINANCIAL TRACK  │                      │  INVENTORY TRACK
                               ▼                      ▼
              ┌────────────────────────┐   ┌──────────────────────────┐
              │ SupplierTransaction    │   │ SupplierReceiving        │
              │ type/direction/amount  │   │ referenceNumber          │
              │ description (required) │   │ receivedOn, note         │
              │ reference (optional)   │   │ ADMIN or EMPLOYEE        │
              │ ADMIN only             │   └───────────┬──────────────┘
              │ no product, no qty     │               │
              └────────────┬───────────┘               ▼
                           │              ┌──────────────────────────┐
                           │              │ SupplierReceivingItem    │
                           │              │ productId, quantity      │
                           │              │ stockMovementId @unique  │
                           │              └───────────┬──────────────┘
                           │                          │
                           ▼                          ▼
              ┌────────────────────────┐   ┌──────────────────────────┐
              │  Supplier balance      │   │ StockMovement            │
              │  (derived: sum of      │   │ PURCHASE_RECEIPT +qty    │
              │   INCREASE − DECREASE) │   │ Product.stockQuantity ↑  │
              └────────────────────────┘   └───────────┬──────────────┘
                                                       │
                      ✗ NO LINK EXISTS TODAY           ▼
                                           ┌──────────────────────────┐
                                           │       PRODUCT            │
                                           │ sku, barcode, price      │
                                           │ trackStock, stockQuantity│
                                           └───────┬──────────┬───────┘
                                                   │          │
                              ┌────────────────────┘          │
                              ▼                               │
              ┌──────────────────────────┐                    │
              │  SCANNER HUB             │                    │
              │  ProductsService         │                    │
              │    .scanLookup(code)     │                    │
              │  returns id/name/model/  │                    │
              │  sku/barcode/brand/      │                    │
              │  isActive ONLY           │                    │
              │  ✗ no price ✗ no stock   │                    │
              │  → navigate /products    │                    │
              └──────────────────────────┘                    │
                    ▲                                         │
                    │ same service also serves the            │
                    │ UNAUTHENTICATED LAN phone endpoint      │
                    │ (scanner.lan.routes.ts:79)              │
                                                              ▼
                                           ┌──────────────────────────┐
                                           │  SALES ORDER             │
                                           │  items (product|manual)  │
                                           │  unitPrice from client   │
                                           │  totals server-computed  │
                                           │  create: any auth'd role │
                                           └───────┬──────────┬───────┘
                                                   │          │
                    explicit separate action ──────┘          └──── remaining > 0
                                   ▼                                and not DRAFT
                    ┌──────────────────────────┐                          ▼
                    │ POST /deduct-stock       │          ┌──────────────────────────┐
                    │ ADMIN or EMPLOYEE        │          │ DebtsService.createDebt  │
                    │ SALE_FULFILLMENT −qty    │          │ → Debt → CUSTOMER ledger │
                    │ SalesOrderStockFulfilment│          │ SalesOrder.debtId @unique│
                    │ POST /restore-stock      │          └──────────────────────────┘
                    │ ADMIN only               │
                    └──────────────────────────┘
```

The single most important feature of this map is the **✗ NO LINK EXISTS TODAY** marker. That is
not a defect. It is the v1.9.1 §1 decision, and this plan keeps it — while adding a *visible,
informational* connection across it.

---

## 2. What currently works

Verified by reading the code, not assumed.

| Area | State | Evidence |
| --- | --- | --- |
| Supplier ledger | Working, ADMIN-only writes, `description` required (3–500 chars), `reference` optional (100 chars) and **already full-text searchable** | `supplier-transactions.validator.ts:29-30`, `lib/search-query.ts:75-81` |
| Supplier balance | Derived, never stored; sum of `INCREASE_OWED` − `DECREASE_OWED` over ACTIVE rows | `supplier-transactions.service.ts:93-102` |
| Supplier payment | `SUPPLIER_PAYMENT` → `DECREASE_OWED`, no inventory coupling of any kind | `supplier-domain.ts` / `resolveSupplierDirection` |
| Supplier receiving | Implemented: whole-or-nothing transaction, one `PURCHASE_RECEIPT` per line, server-generated reason, `compareAndSetQuantity` optimistic lock, ADMIN **or** EMPLOYEE, no password | `supplier-receivings.service.ts:20-70` |
| Receiving ↔ ledger isolation | Structural. `SupplierReceivings*` files import nothing from `features/suppliers/transactions` or `features/financial/debts` | `supplier-receivings.service.ts` imports |
| Duplicate receipt warning | `GET /inventory/receivings/duplicate-check`, case-insensitive, warns and never blocks | `supplier-receivings.repository.ts:35-42` |
| Opening-count guard | Receiving refuses a product with no `OPENING_BALANCE` movement, and refuses a `receivedOn` earlier than that movement's business date | `supplier-receivings.service.ts:106-115` |
| Scanner desk lookup | `scanLookup` → `serializeScanResult`, deliberately excludes price, cost, stock | `products.service.ts:655-665` |
| Scanner LAN safety | Phone endpoints are on a *separate router mounted only on the LAN listener*; session-token gated; rate limited | `scanner.lan.routes.ts:13-23` |
| Scanner writes | None. `ScannerService` writes only to an in-memory store. No Prisma import anywhere in `scanner.service.ts` | `scanner.service.ts` |
| Sales order totals | Server-computed from lines; `paidAmount`/`remainingAmount`/`paymentStatus` all derived | `sales-order-totals.ts`, `sales-orders.service.ts:69-70` |
| Sales stock deduction | Separate explicit endpoint, never automatic on order save; per-product running balance prevents one stale total serving repeated lines | `sales-order-inventory.service.ts:75-95` |
| Customer debt | Only ever created through `DebtsService.createDebt`, called from exactly two places in sales (`createAndLinkDebt`, `recalculateOrder`) | `sales-orders.service.ts:444-465` |
| Order/stock interlock | An order with an ACTIVE fulfillment cannot be cancelled, returned, or have that line edited/removed | `sales-orders.service.ts:250-252, 288-290, 382-386` |

---

## 3. Current gaps and risks

These are the findings that drive the rest of the plan. Each is real and located.

### Gap A — Receipt-number field length mismatch across the seam
`SupplierTransaction.reference` is capped at **100** characters
(`supplier-transactions.validator.ts:30`); `SupplierReceiving.referenceNumber` is capped at **200**
(`supplier-receivings.validator.ts:18`). Any workflow that matches a debt to a delivery by invoice
string is silently unreliable for references over 100 characters. Both columns are Postgres `TEXT`
(no `@db.VarChar`), so aligning them is a **validator change with no migration**.

### Gap B — "Quick Product Add then receive" is impossible without an admin password
This is the central constraint of Part 2 and it is not a UI problem.

- `ProductsService.create` never sets `trackStock`; the schema default is `false`
  (`schema.prisma:672`, `products.service.ts:80-98`).
- Receiving rejects any product with `trackStock = false` **and** any product with no
  `OPENING_BALANCE` movement (`supplier-receivings.service.ts:108-111`).
- The **only** code path that creates an `OPENING_BALANCE` movement is
  `InventoryService.verifyOpeningCount`, which requires `Role.ADMIN` **and** an account password
  (`inventory.service.ts:50-99`).
- `PATCH /products/:id/stock` can flip `trackStock` but is `requireServiceAdmin` and **still does
  not create the opening movement**, so it does not unblock receiving either.

Therefore: an EMPLOYEE can never quick-add a product and receive it. An ADMIN can, but only by
entering an account password. Any design that "just makes quick-add work" is, by construction, a
proposal to weaken the opening-count guard. **Do not do that.** See §5 Option B for the safe shape.

### Gap C — The scanner popup cannot be built by extending `scanLookup`
`ProductsService.scanLookup` is consumed by **two** callers with very different trust levels:
the authenticated desk API (`products.routes.ts:26`) and the **unauthenticated-user LAN phone
endpoint** (`scanner.lan.routes.ts:79`, gated only by a paired device token). The service carries
an explicit comment saying the payload must not grow pricing, cost, or stock "by inheritance"
(`products.service.ts:163-166`). Adding `price` and `stockQuantity` to `ProductScanPayload` to
feed the POS modal would publish shop pricing and stock levels to every paired phone on the shop
Wi-Fi. **The modal must fetch its own data from the existing authenticated
`GET /api/v1/products/:productId`, keyed by the id `scanLookup` already returns.**

### Gap D — The product picker physically cannot hold a scanned product
`ProductLinePicker` is a `<select>` populated by `useProducts({ isActive: true, pageSize: 100,
sortBy: 'name' })` (`ProductLinePicker.tsx:7`). The API caps `pageSize` at 100
(`products.validator.ts:163`). A catalogue larger than 100 products means any product sorted after
the 100th **cannot be chosen at all** — not by scanning, not by hand. The receiving form has the
identical ceiling (`SupplierReceivingForm.tsx:71`). This is the highest-value defect in the whole
review: it silently caps both the new receiving feature and any scanner prefill.

### Gap E — `CreateSalesOrderDialog` has no prefill surface
Its props are `{ isOpen, onClose }` (`CreateSalesOrderDialog.tsx:17`). It is a six-step wizard
holding its own `items` state, with the line editor on step 3. There is no way to hand it a
starting product.

### Gap F — Duplicate-receipt warning does not cover supplier-less deliveries
`duplicate-check` requires **both** `supplierId` and `referenceNumber`
(`supplier-receivings.validator.ts:39-42`), but supplier is optional by design (v1.9.1 §10 item 1).
A cash purchase entered twice gets no warning at all.

### Gap G — Role asymmetry will read as a bug at the counter
An EMPLOYEE can receive goods but cannot record what the shop owes for them (supplier transaction
writes are ADMIN-only via `assertSupplierAdmin`). Correct by design, invisible in the UI.

### Gap H — Stock is advisory at order time, authoritative at deduction time
`ProductLinePicker.tsx:21` literally renders "selling above stock is allowed". Stock is only
enforced in `SalesOrderInventoryService.deductStock`. A POS-style modal that shows "out of stock"
must therefore **warn, not block** — otherwise the scanner becomes stricter than the sales order
it feeds, which is a behaviour change, not a UI change.

### Gap I — Changing the scanner's found-product behaviour is a production behaviour change
`ScannerHubPage.tsx:53` currently navigates to `/products?focus={id}` on a found scan. Replacing
that with a modal changes what a trained user sees. It needs to ship as its own checkpoint with its
own release note, not as a side effect of the supplier work.

### Risk J — `costPrice` is one keystroke from becoming valuation
A receiving line has a product and a quantity; `Product.costPrice` exists. v1.9.1 §9 forbids
multiplying them. Every checkpoint below inherits that prohibition. No COGS, FIFO, weighted
average, margin, or profit anywhere in this workstream.

---

## 4. Recommended architecture

**One sentence: two ledgers and one stock ledger, joined by references that a human reads and a
machine never derives money from.**

```
   FINANCIAL (supplier)          INVENTORY (stock)           FINANCIAL (customer)
  ┌────────────────────┐      ┌────────────────────┐      ┌────────────────────┐
  │ SupplierTransaction│      │ StockMovement      │      │ Debt / Payment     │
  │ ADMIN + reason     │      │ append-only        │      │ via DebtsService   │
  │ mutable, removable │      │ immutable          │      │ only from Sales    │
  └─────────┬──────────┘      └─────────┬──────────┘      └─────────▲──────────┘
            │                           │                           │
            │   informational link      │      document link        │
            │   (nullable, no math)     │      (FK, authoritative)  │
            ▼                           ▼                           │
  ┌────────────────────┐      ┌────────────────────┐      ┌─────────┴──────────┐
  │ SupplierReceiving  │◀─────│ SupplierReceiving  │      │ SalesOrder         │
  │ immutable document │      │ Item               │      │ + StockFulfillment │
  └────────────────────┘      └────────────────────┘      └────────────────────┘
```

Four invariants, each of which a test must assert:

1. **A financial row is never derived from an inventory row, and never the reverse.** A link may
   record *that* two documents describe the same event. It may never be read to compute an amount,
   a balance, or a quantity.
2. **Every stock change is a `StockMovement` with a server-generated reason and a typed
   `referenceType`.** No feature in this workstream introduces a new way to change
   `Product.stockQuantity`.
3. **The scanner is a read.** It resolves a code to a product identity and hands that identity to a
   screen. It writes nothing but an in-memory scan event.
4. **The sales-order backend is the only authority on price, stock, and customer debt.** The client
   proposes a `unitPrice`; the server computes every total from the stored lines. That already
   holds and must survive scanner prefill unchanged.

---

## 5. Supplier debt workflow options

### The decision on the "description problem"

The current supplier debt form requires a description (min 3 chars) and offers an optional
reference. Nothing about that is wrong; it is simply *un-anchored* — there is no way to say which
delivery the debt is for. The fix is not to put products inside the financial form. The fix is to
let the user **start from the delivery**.

**Recommended primary flow (the "bridge"):**

```
Inventory → Receiving → New
  ├─ supplier (optional) · reference/invoice no. · received-on · note
  ├─ product lines (quantity each)
  └─ [Receive Stock]  ──▶ posts document, stock rises, PURCHASE_RECEIPT per line
                            │
                            ▼
              ┌────────────────────────────────────────────────┐
              │ Receiving posted. Stock updated.               │
              │ No supplier payable was recorded.              │
              │                                                │
              │ ADMIN only:  [ Record supplier debt ]  ────────┼──▶ opens the EXISTING
              │ EMPLOYEE:    "Ask an administrator to record   │    supplier transaction
              │               the amount owed."                │    form, prefilled:
              └────────────────────────────────────────────────┘    supplier, date,
                                                                    reference = invoice no.,
                                                                    description = "Delivery
                                                                    {ref} — N item(s)",
                                                                    amount = BLANK
```

`amount` is deliberately left blank. The system does not know what the delivery cost — it knows
quantities, not prices, and `costPrice` is off limits (Risk J). A human types the invoice total.
That single blank field is what keeps this a bridge instead of an automation.

### The three UI options, judged

| Option | Verdict | Shape |
| --- | --- | --- |
| **A — Existing product** | **Ship.** Already implemented and correct. | Search/select → quantity → `PURCHASE_RECEIPT`. Requires `trackStock` + verified opening count. **Blocked on Gap D**: fix the picker before calling this usable. |
| **B — Quick product add** | **Ship a restricted form; defer the unrestricted one.** | See below. |
| **C — Manual description** | **Ship unchanged — it already exists.** | This *is* today's supplier transaction: description + optional reference, no product, no quantity, no `StockMovement`. Nothing to build; only to label clearly so users know it does not move stock. |

### Option B — Quick Product Add, in two tiers

Gap B is the constraint: a product cannot receive stock until an ADMIN has verified an opening
count with an account password. Two honest designs follow from that.

**B1 — "Add to catalogue" (recommended first, any role, no password)**
Quick-add creates a catalogue product only. Required fields: `name`, `model`, optional `barcode`
(uniqueness already enforced at `products.service.ts:73-75`); `sku` is auto-generated
(`generateProductSku`). The product lands with `trackStock = false`, `stockQuantity = 0`, no
opening movement. The receiving form shows the new product in a **disabled line** with an explicit
message: *"Not in inventory yet — an administrator must verify the opening count before stock can
be received / غير مُدرج في المخزون بعد."* Zero new privilege, zero new bypass, and the user's real
goal (get the product into the database without leaving the screen) is met.

**B2 — "Add and onboard" (ADMIN only, existing account password, defer to a later checkpoint)**
An admin quick-adds and, in the same dialog, verifies an opening count of **0** through the
*existing* `POST /products/:id/opening-count` endpoint with the *existing* password prompt. The
product becomes receivable immediately. Opening count must be **0**, never the quantity being
received — otherwise the delivery is counted twice, once in the opening balance and once in the
`PURCHASE_RECEIPT`. Note the ordering trap: the opening movement's `createdAt` is *now*, and
receiving rejects a `receivedOn` earlier than the opening date
(`supplier-receivings.service.ts:112-113`), so a backdated delivery of a just-created product will
be refused. That is correct behaviour and the UI must say so rather than look broken.

**Not acceptable under any framing:** a receiving endpoint that creates products, a quick-add that
sets `trackStock = true` without an opening movement, or an opening-count path that skips the
password. Each would make `Product.stockQuantity` un-auditable, which is the property v1.8.0 was
built to establish.

### Receipt / invoice number — where it lives

**Both, and it already does.** No new column is needed on either side.

| | Column | Cap | Searchable |
| --- | --- | --- | --- |
| Supplier transaction | `reference` | 100 → **raise to 200** | Yes, full-text (`search-query.ts:78`) |
| Supplier receiving | `referenceNumber` | 200 | Yes, `contains` filter on list |

Actions: align the caps (Gap A, validator-only), surface the field prominently in both forms, and
extend duplicate-check to supplier-less receipts (Gap F).

---

## 6. Supplier payment rule

**Keep the old way. Change nothing.**

`SUPPLIER_PAYMENT` resolves to `DECREASE_OWED` and reduces the derived balance. It touches no
product, no quantity, no `StockMovement` — and it must not start to. Specifically:

- No inventory field, product picker, or receiving link appears in the payment form.
- Paying a supplier does not confirm, complete, or alter any receiving document.
- A receiving document's existence never gates a payment, and a payment never gates a receiving.
- The `accountPassword` requirement on update/remove/restore stays exactly where it is
  (`supplier-transactions.service.ts:58, 83`).

If a future release wants payment-to-invoice allocation, that is a supplier-ledger feature designed
on its own terms, alongside the Financial Truth Foundation work — not a side effect of inventory.

---

## 7. Inventory consistency rules

Checked against the Part 3 list. Verified items cite code; unverified items are marked as needing a
live check because the v1.9.1 work is uncommitted and untested against the business dataset.

| # | Check | Status |
| --- | --- | --- |
| 1 | Existing-product receiving increases `Product.stockQuantity` | **Works** — `compareAndSetQuantity` with `count === 1` assertion (`supplier-receivings.service.ts:48-49`) |
| 2 | Creates a `PURCHASE_RECEIPT` movement | **Works** — `:51-62`, server-generated reason |
| 3 | Movement history links back to the receiving document | **Implemented, needs UI verification** — `MovementHistory.tsx` and `inventory.repository.ts` are modified in the working tree; resolve through the `SupplierReceivingItem` relation, never by parsing `referenceType` |
| 4 | Product-specific inventory history shows the receipt | **Needs verification** — `GET /products/:id/inventory` exists; confirm `PURCHASE_RECEIPT` rows carry the document link |
| 5 | Supplier profile shows receiving history | **Implemented** — `SupplierReceivingHistory` added to `SupplierProfilePage.tsx` |
| 6 | Inventory page shows receiving history | **Implemented** — `/inventory/receiving` routes registered in `App.tsx:72-74` |
| 7 | Scanner detects a newly added barcode | **Works** — `findByScanCode` queries `products` live, no cache |
| 8 | Sales order can use the product after receiving | **Works, but see Gap D** — the picker may not be able to *reach* it |
| 9 | Low-stock / out-of-stock indicators update | **Works** — derived from `stockQuantity`/`lowStockThreshold` at read time |
| 10 | Description-only supplier debt changes no stock | **Structurally guaranteed** — `SupplierTransaction` has no product and no quantity column, and the transactions service imports nothing from inventory |

**Standing rules for every future checkpoint in this workstream:**

- One receiving line produces exactly one movement; `stockMovementId @unique` enforces it.
- A posted receiving document is immutable. Corrections are compensating `DAMAGE_LOSS`,
  `MANUAL_REMOVE`, or `STOCK_COUNT` movements, which keep their ADMIN + password guard.
- Receiving never onboards a product.
- No valuation, ever.

---

## 8. Scanner Hub POS-like workflow

### Target flow

```
  barcode / SKU typed or phoned in
            │
            ▼
  GET /products/scan?code=…            ← unchanged, still lean, still safe for the phone
            │
            ├─ INVALID_CODE ─▶ inline "not a scannable code", offer text search
            ├─ NOT_FOUND    ─▶ inline "no product matches {code}", offer [Add product]
            └─ FOUND {id}
                    │
                    ▼
        GET /products/:id          ← NEW CALL, existing authenticated endpoint
        GET /products/:id/image    ← existing, via useProductImageUrl
                    │
                    ▼
        ┌──────────────────────────────────────────┐
        │  PRODUCT PREVIEW MODAL                   │
        │  image · name · model · brand            │
        │  SKU · barcode                           │
        │  price (from pricing preview)            │
        │  stock: 12 in stock  /  LOW  /  OUT      │  ← advisory, never blocking
        │  archived / not-tracked banners          │
        │                                          │
        │  [Open product]  [Make Order / إنشاء طلب]│
        └──────────────────────────────────────────┘
                    │
                    ▼
        CreateSalesOrderDialog(prefill = { productId, unitPrice, quantity: 1 })
                    │
                    ▼
        existing 6-step wizard → existing POST /sales-orders → existing validation
```

### Non-negotiable rules for this screen

- **Do not extend `ProductScanPayload`.** The modal's price and stock come from the authenticated
  product endpoint (Gap C). The phone's payload stays exactly as it is.
- **The scanner performs no writes.** No stock movement, no price change, no ledger row, no order.
- **The modal's stock badge is advisory.** Out-of-stock does not disable "Make Order", because the
  sales order itself permits selling above stock and only enforces it at deduction (Gap H).
- **"Make Order" hands over an identity, not a transaction.** It passes `productId` and a suggested
  `unitPrice`; the sales-order backend re-reads the product (`findActiveProduct`) and recomputes
  every total server-side.
- **Prefill is a suggestion the server may reject.** If the product was archived between the scan
  and the save, `prepareItems` throws `Product not found` — which is correct, and the dialog must
  surface it rather than swallow it.

### Prerequisite

Gap D must be fixed first. Prefilling a `<select>` that only contains the first 100 products by
name will appear to work in a small test catalogue and fail silently in the business database. The
picker needs to become a **searchable, server-backed** control that can resolve and hold a product
by id regardless of alphabetical position. That single change unblocks the scanner prefill, the
receiving form, and ordinary manual order entry at the same time.

---

## 9. Sales-order integration rules

The scanner entry point conflicts with nothing in the current sales logic, provided it stays a
prefill. Confirmed properties of the existing order flow that must remain untouched:

- **Customer:** optional only for an ADMIN recording a fully-paid sale; required the moment a
  balance remains (`validateCustomerRequirement`, `sales-orders.service.ts:710-714`).
- **Price:** client-proposed per line, server-recomputed into `lineTotal`, `itemsSubtotal`,
  `totalAmount`, `remainingAmount` (`calculateSalesOrderTotals`).
- **Discount:** `discountAmount` exists per line and is currently always submitted as zero by the
  UI. Not in scope here.
- **Debt:** created only when `remainingAmount > 0` **and** status is not `DRAFT`, only through
  `DebtsService.createDebt`, and only with an explicit `debtDueDate` supplied by the user
  (`validateCreateDebtTerms`).
- **Stock:** never deducted on save. Deduction is a separate `POST /:id/deduct-stock` call by an
  ADMIN or EMPLOYEE, gated on fulfilment status, opening count, order-date-vs-opening-date, and
  available quantity.
- **Interlocks:** an order with an ACTIVE fulfilment cannot be cancelled, returned, or have that
  line edited or removed until the stock is restored (ADMIN only).

**What the scanner may set:** `items[0].productId`, `items[0].unitPrice` (suggested),
`items[0].quantity = 1`.
**What the scanner may never set:** customer, payment mode, paid amount, debt due date, fulfilment
status, delivery fee, or channel. Those stay with the wizard and the human.

---

## 10. Customer / supplier ledger separation rules

All seven Part 7 conditions hold in the current code. They become **regression assertions**, not
aspirations.

| # | Rule | How it is guaranteed |
| --- | --- | --- |
| 1 | Sales order is the only origin of customer debt | `DebtsService.createDebt` is called from exactly two private methods in `sales-orders.service.ts` |
| 2 | Scanner writes no customer ledger | `scanner.service.ts` imports no Prisma client at all |
| 3 | Receiving writes no customer ledger | `supplier-receivings.service.ts` imports only inventory and financial-infrastructure helpers |
| 4 | Supplier debt/payment never touches customer ledger | Separate tables, separate services, no cross-import |
| 5 | Supplier and customer ledgers stay separate | `supplier_transactions` vs `debts`/`payments`/`transactions`; no shared write path |
| 6 | Existing customer debt/payment rules unweakened | No checkpoint in this plan modifies `features/financial/**` |
| 7 | Customer debt from sales comes only from sales-order logic | Enforced by 1 |

**Test obligation for every checkpoint below:** snapshot supplier balance, customer debt totals,
payment totals, `transactions` count, and every sales-order money column before and after the new
write, and assert them **unchanged**. This is the assertion set v1.9.0 and v1.9.1 already use;
extend it, do not reinvent it.

---

## 11. Security rules

### The scanner-to-order flow needs no admin password. Confirmed.

Justification, in the codebase's own terms: scanning is a read of the same catalogue the Products
page already shows, and creating a sales order is already available to any authenticated user
(`POST /sales-orders` carries no role middleware). Adding a password to the path between them
would guard nothing that is not already open on either side of it.

### What must hold instead

| Rule | Current state |
| --- | --- |
| User must be authenticated | Desk scanner routes sit behind `requireAuth` at mount |
| Role permissions respected | Pairing-code minting, LAN enable/disable, and session revoke stay `requireRole(['ADMIN'])` |
| Scanner creates no stock movement | Holds — no Prisma access |
| Scanner cannot change price or cost | Holds — pricing writes are `requireServiceAdmin` + account password |
| Scanner creates no ledger entry | Holds |
| Scanner does not deduct inventory | Holds — deduction is its own endpoint |
| Scanner passes identity only | Design rule for the new modal |
| Backend authoritative on price/stock/debt | Holds — totals recomputed server-side from stored lines |
| No client-trusted price or stock | The modal displays server data; the order recomputes from the server's own product row |

### The one new security rule this plan adds

**The POS preview payload must never be reachable from the LAN listener.** Price and stock reach
the modal through `GET /api/v1/products/:productId` on the authenticated main API. The LAN router
mounts four endpoints and must continue to mount exactly four. If a future change makes
`serializeScanResult` richer, it publishes shop pricing to every paired phone — a test should
assert the scan payload's key set explicitly so that regression fails loudly.

### Where admin passwords stay, unchanged

Opening-count verification, product pricing updates, SKU changes, stock removal/count, sales-order
sensitive edits and cancellations, supplier transaction update/remove/restore, sales-order stock
restoration. None of these are touched by this workstream.

---

## 12. Error-handling matrix

| Condition | Where detected | Behaviour |
| --- | --- | --- |
| Code is not scannable | `normalizeScanCode` | `INVALID_CODE` inline; offer text search. No modal. |
| No product matches | `scanLookup` | `NOT_FOUND` inline with the normalized code; offer "Add product". No modal. |
| Code matches a barcode and a different product's SKU | `scanLookup` | Barcode wins; `alsoMatchedSku` flag already returned — modal must say so rather than hide the second product |
| Product archived / inactive | Modal (`isActive: false`) | Modal opens with an archived banner; "Make Order" **disabled** — `prepareItems` calls `findActiveProduct` and would reject it anyway |
| Product out of stock | Modal | Red "Out of stock" badge; "Make Order" **enabled** (Gap H) |
| Product below low-stock threshold | Modal | Amber badge; no restriction |
| Product does not track stock | Modal | "Not tracked in inventory"; ordering allowed; deduction will later refuse with `STOCK_NOT_TRACKED` |
| Product has no verified opening count | Modal | "Pending inventory onboarding"; ordering allowed; deduction refuses with `ONBOARDING_REQUIRED` |
| Product has no price | Modal | Price shown as "—"; prefill leaves `unitPrice` blank; the wizard already blocks a zero price at step 3 |
| Customer has outstanding debt | Existing customer screens | Out of scope for the scanner; do not add a new warning surface in this workstream |
| Network / API error on lookup | `useScannerLookup` | Existing `isError` path; modal does not open |
| Network error on the modal's product fetch | New | Modal shows a retry; never falls back to stale or client-held price data |
| Duplicate order submission | `CreateSalesOrderDialog` | Existing `create.isPending` disables the buttons; keep it |
| Unauthorized user | Route middleware | 401/403 before any handler runs |
| Stale product data after preview | Sales-order backend | `prepareItems` re-reads the product; a price or status change between preview and save is resolved server-side, and the UI surfaces the error rather than retrying silently |
| Duplicate receiving reference | `duplicate-check` | Warn on submit, never block (v1.9.1 §10 item 2) |
| Receiving date before opening count | Receiving service | Rejected with the bilingual `BEFORE_OPENING_ERROR` |
| Quick-added product selected for receiving | Receiving form (B1) | Line disabled with "needs a verified opening count"; server would reject anyway |
| Archived supplier on a receiving | Receiving service | 409 `SUPPLIER_ARCHIVED` |
| Concurrent stock change during receiving | `compareAndSetQuantity` | 409 `STOCK_CHANGED`, whole document rolled back |

---

## 13. Database changes likely needed

**Nothing, until the last optional step.** This is a deliberate outcome, and the strongest argument
for the sequencing in §17.

| Change | Migration? | Checkpoint |
| --- | --- | --- |
| Raise `SupplierTransaction.reference` cap 100 → 200 | **No** — Postgres `TEXT`, validator-only | CP-A |
| Extend `duplicate-check` to supplier-less receipts | **No** — query and validator only | CP-A |
| Searchable product picker | **No** — the API already supports `search` | CP-B |
| Scanner POS modal | **No** — uses existing endpoints | CP-C |
| Sales-order prefill | **No** — frontend props only | CP-C |
| Quick product add, tier B1 | **No** — existing `POST /products` | CP-D |
| Quick product add, tier B2 | **No** — existing `POST /products/:id/opening-count` | Deferred |
| *Optional:* hard link `SupplierTransaction.supplierReceivingId` | **Yes** — one additive nullable `@db.Uuid` + FK `ON DELETE RESTRICT` + index | CP-E, deferred |

On CP-E: a nullable FK is the structurally honest way to say "this debt is for that delivery", and
it is the right eventual answer. But it is deferred deliberately. The soft path (a shared reference
number, already searchable on both sides once Gap A is fixed) delivers the user-visible outcome
with zero schema risk, and it lets the workflow prove itself before a column exists that a future
developer might be tempted to read as authoritative. If CP-E is ever built, the column must be
**informational only**: never read by balance computation, never a join in any money query, and
never a reason to cascade a delete.

---

## 14. Frontend changes likely needed

| Component | Change | Checkpoint |
| --- | --- | --- |
| `ProductLinePicker.tsx` | Replace the 100-item `<select>` with a searchable, server-backed picker that can hold any product by id | **CP-B** |
| `SupplierReceivingForm.tsx` | Same picker; drop the local `pageSize: 100` filter | CP-B |
| `SupplierTransactionFormDialog.tsx` | Promote `reference` to a labelled "Receipt / invoice no." field; accept prefill values | CP-A |
| Receiving success screen | Post-post panel: "no supplier payable was recorded", with an ADMIN-only "Record supplier debt" CTA and an EMPLOYEE-facing explanation (Gap G) | CP-A |
| `ScannerHubPage.tsx` | Open the preview modal on `onFound` instead of navigating to `/products?focus=` | CP-C |
| **New** `ProductPreviewModal.tsx` | Image, name, SKU/barcode, price, stock badge, status banners, `[Open product]`, `[Make Order]` | CP-C |
| `CreateSalesOrderDialog.tsx` | Accept an optional `prefill` prop; seed `items[0]`; land the user on the wizard's first step, not step 3 | CP-C |
| Receiving form | Quick-add dialog (B1), disabled line + onboarding message for non-receivable products | CP-D |
| Labels | Bilingual `English / عربي` strings for every new message, per house style | all |

---

## 15. Backend / API changes likely needed

Small, and mostly subtractive of risk rather than additive of surface.

| Change | Kind | Checkpoint |
| --- | --- | --- |
| `reference` max 100 → 200 in `supplier-transactions.validator.ts` | Validator | CP-A |
| `duplicate-check` accepts `referenceNumber` with a null `supplierId` | Validator + repository `where` | CP-A |
| Test asserting `ProductScanPayload`'s exact key set | Test only | CP-C |
| **No** new scanner endpoint | — | — |
| **No** change to `scanLookup` | — | — |
| **No** change to any sales-order endpoint | — | — |
| **No** change to supplier transaction create/update/remove/restore semantics | — | — |
| **No** change to receiving service logic | — | — |

The scanner modal introduces **zero** new backend surface. That is the point of routing it through
`GET /products/:productId`.

---

## 16. Test plan

### Regression assertions that run on every checkpoint

1. Supplier balance unchanged across every inventory write.
2. Customer debt, payment, allocation, and `transactions` row counts unchanged across every
   inventory and scanner action.
3. Every sales-order money column unchanged unless the sales-order service itself wrote it.
4. `ProductScanPayload` key set is exactly `{id, name, model, sku, barcode, brand, isActive}` —
   fails loudly if price or stock is ever added (Gap C guard).
5. The LAN router mounts exactly four endpoints.

### Per checkpoint

**CP-A (supplier bridge)**
- A 150-character reference round-trips through the supplier transaction validator.
- Duplicate-check warns for a supplier-less receipt with a repeated reference; still never blocks.
- Creating a supplier debt from the receiving CTA writes one `SupplierTransaction` and **zero**
  `StockMovement` rows.
- An EMPLOYEE posting a receiving sees the explanatory text and no debt CTA.
- Amount is never prefilled from `costPrice` — assert the field arrives empty.

**CP-B (picker)**
- With 250 products seeded, a product sorted 200th is findable and selectable in both the sales-order
  and receiving pickers.
- Selecting by search sets `productId` and the suggested `unitPrice` identically to today.
- Existing sales-order and receiving tests still pass unmodified.

**CP-C (scanner POS)**
- `FOUND` opens the modal; `NOT_FOUND` and `INVALID_CODE` do not.
- The modal renders price and stock from the product endpoint, and the *scan* response in the
  network log contains neither.
- Archived product → modal opens, "Make Order" disabled.
- Out of stock → badge shown, "Make Order" enabled.
- "Make Order" opens the wizard with the product seeded and creates a normal order through the
  existing endpoint; no new code path posts an order.
- Product archived between preview and save → the wizard surfaces the server's rejection.
- No `StockMovement`, `Debt`, or `SupplierTransaction` row is created by any scanner interaction.

**CP-D (quick add B1)**
- Quick-add creates a product with `trackStock = false` and no `OPENING_BALANCE` movement.
- That product cannot be added as a receiving line; the server rejects it if forced.
- Duplicate barcode is rejected with the existing conflict error.

### Manual verification on a **copy** of the business database

Never the live business PC database. Restore a backup to a scratch instance and check the v1.9.1
items still marked "needs verification" in §7 (rows 3 and 4), plus picker behaviour against the real
catalogue size — which is precisely where Gap D bites.

---

## 17. Version plan and checkpoints

### Minor versions, not v2.0.0

**Recommendation: v1.9.2 and v1.9.3.** Every change here is additive, backward compatible, and
introduces no new financial contract. v2.0.0 should be reserved for the Financial Truth Foundation
work (`claude/plans/financial-truth-foundation-plan.md`), which is the release that genuinely
changes how money is represented. Spending the major version on a workflow bridge and a scanner
modal would leave nothing to signal the change that actually deserves it.

| Checkpoint | Version | Contents | Migration |
| --- | --- | --- | --- |
| **v1.9.1** | v1.9.1 | Finish and ship what is already in the working tree, unchanged | already written |
| **CP-A** | v1.9.2 | Reference-cap alignment; duplicate-check for supplier-less receipts; receiving → supplier-debt CTA with prefill; role-asymmetry messaging | none |
| **CP-B** | v1.9.2 | Searchable server-backed product picker (sales orders + receiving) | none |
| **CP-C** | v1.9.3 | Scanner POS preview modal; "Make Order" prefill into the existing wizard | none |
| **CP-D** | v1.9.3 | Quick product add, tier B1 | none |
| **CP-E** | deferred | Optional `SupplierTransaction.supplierReceivingId` FK | one additive |
| **B2** | deferred | ADMIN quick-add + opening-count-0 in one dialog | none |

Ship v1.9.2 and build the installer before starting CP-C. Two shipped releases beat one large one
here, because CP-A/CP-B change screens that are used every day and CP-C changes trained scanner
behaviour — you want those failures separable.

---

## 18. Clear recommendation

### Build first

1. **v1.9.1 as written.** It is implemented and uncommitted. Verify §7 rows 3 and 4 against a
   restored backup, run the suite, ship it. Nothing else should start until this is a released
   baseline.
2. **CP-B, the searchable picker.** It is the highest-value item in this entire review, it needs no
   migration, and it silently caps both the feature you just built and everything planned after it.
   Sequenced inside v1.9.2 alongside CP-A.
3. **CP-A, the supplier bridge.** Delivers the user's stated goal — a debt anchored to a delivery —
   for a validator change and a prefilled form.

### Defer

- The `supplierReceivingId` FK (CP-E). Prove the workflow with the shared reference number first.
- Quick-add tier B2. It is safe as designed, but it is the one item that touches the opening-count
  guard, so it should land only after B1 shows how quick-add is actually used.
- Supplier payment allocation, receiving reversal, valuation/COGS, customer-debt warnings on the
  scanner, receipt printing.

### Must not change

- The supplier payment flow, in any respect.
- `DebtsService` as the sole origin of customer debt.
- Sales-order stock deduction and restoration (v1.9.0), including the ADMIN-only restore and the
  active-fulfilment interlocks.
- Receiving service logic and its ledger isolation (v1.9.1 §1 and §9).
- `serializeScanResult`'s payload shape, and the four-endpoint LAN router.
- The opening-count guard: ADMIN + account password, no exceptions, no bypass, no "quick" path.
- `Product.costPrice` staying out of every quantity calculation.

---

## Critical review questions — answered

**1. Should supplier debt creation increase stock automatically?**
**No.** `SupplierTransaction` carries no product and no quantity, so the browser would have to
supply both — reintroducing exactly the client-trust that v1.9.0 removed. It is also mutable and
soft-removable, which would imply stock reversal on a financial edit.

**2. Should supplier receiving create supplier debt automatically?**
**No.** The system knows quantities, not prices, and `costPrice` is off limits. Offer an
ADMIN-only CTA that opens the existing debt form prefilled with everything *except* the amount.
A human types the amount; that keeps it a bridge, not an automation.

**3. Should supplier payment flow stay the old way?**
**Yes, entirely unchanged.** No inventory field, no receiving link, no new gate in either
direction.

**4. Should the scanner create orders directly or only redirect/prefill?**
**Prefill only.** The scanner passes `productId` and a suggested `unitPrice` into the existing
wizard. It never posts an order and never gains its own sales logic.

**5. Should the scanner require an admin password?**
**No.** Scanning reads a catalogue the Products page already shows, and any authenticated user can
already create a sales order. A password between two open doors guards nothing. Authentication and
role checks stay; admin passwords stay exactly where they are today.

**6. How do we prevent duplicate stock movement?**
Four existing layers, plus one gap to close: `stockMovementId @unique` (a movement backs one line);
`@@unique([receivingId, productId])` (one line per product per document); whole-or-nothing
transactions; `compareAndSetQuantity` asserting `count === 1`. The remaining exposure is a human
entering the same delivery twice — covered by `duplicate-check`, which must be extended to
supplier-less receipts (Gap F). Supplier debt cannot duplicate stock because it cannot create
stock at all.

**7. How do we prevent ledger conflicts?**
By keeping the write paths disjoint, which they already are. Customer debt only via `DebtsService`
from sales orders; supplier balance only from `supplier_transactions`; stock only from
`StockMovement`. Links across those boundaries are informational and never read by any money
computation. Enforced by the before/after snapshot assertions in §16.

**8. How do we handle quick product add safely?**
Two tiers. **B1** (ship first, any role, no password): creates a catalogue product only —
`trackStock = false`, no opening movement — and the receiving form shows it as not-yet-receivable
with a clear message. **B2** (deferred, ADMIN only): quick-add plus an opening count of **0**
through the existing password-guarded endpoint. Opening count must be zero, never the received
quantity, or the delivery is counted twice.

**9. What version should this be?**
**v1.9.2** (supplier bridge + picker) and **v1.9.3** (scanner POS + quick add). Not v2.0.0 —
everything is additive with no new financial contract. Keep v2.0.0 for the Financial Truth
Foundation.

**10. What is the safest first checkpoint?**
**Finish and ship v1.9.1 exactly as written.** It is already implemented, correctly isolated from
both ledgers, and needs only verification of the movement-history links against a restored backup.
Then CP-B (the searchable picker) as the first new work, because it needs no migration and
everything downstream depends on it.
