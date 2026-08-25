# Scanner Quick Order — Workflow Review & Design Plan

**Status:** Planning / review checkpoint. **CP-SQO1 complete (review only). No code written. Awaiting approval before CP-SQO2.**
**Date:** 2026-08-22.
**Installed version:** `1.9.6`. **No version bump, no migration, no installer, no commit in this document's scope.**
**Scope boundary:** Frontend-only feature. The sales backend is **not** modified — not its validators, not its service, not its stock, debt, or ledger logic.

---

## 1 · Current behaviour found

### 1.1 The hand-off chain, end to end

| Step | Where | Evidence |
|---|---|---|
| Scan resolves to a product | `useScannerLookup` `onFound` sets local preview state | [ScannerHubPage.tsx:70-79](../../frontend/src/pages/scanner/ScannerHubPage.tsx#L70-L79) |
| Preview panel renders with three actions | `ProductPreviewPanel` | [ProductPreviewPanel.tsx:137-160](../../frontend/src/features/products/components/ProductPreviewPanel.tsx#L137-L160) |
| **Make Order** navigates away | `onMakeOrder={(id) => navigate(salesOrderCreateUrl(id))}` | [ScannerHubPage.tsx:156](../../frontend/src/pages/scanner/ScannerHubPage.tsx#L156) |
| URL built | `/sales-orders?action=add&productId=<id>` | [sales-order-links.ts:1-2](../../frontend/src/features/sales-orders/utils/sales-order-links.ts#L1-L2) |
| Sales Orders page reads the param, opens the dialog, strips the param | `salesOrderPrefillFromNavigation` → `setCreateOpen(true)` → `navigate(..., {replace:true})` | [SalesOrdersPage.tsx:27-37](../../frontend/src/pages/sales-orders/SalesOrdersPage.tsx#L27-L37), [SalesOrdersPage.tsx:95-109](../../frontend/src/pages/sales-orders/SalesOrdersPage.tsx#L95-L109) |
| Wizard opens **at Step 4 of 6** | `const [step, setStep] = useState(prefill ? 3 : 0)` and the effect `setStep(3)` once the product loads | [CreateSalesOrderDialog.tsx:29](../../frontend/src/features/sales-orders/components/CreateSalesOrderDialog.tsx#L29), [CreateSalesOrderDialog.tsx:49-55](../../frontend/src/features/sales-orders/components/CreateSalesOrderDialog.tsx#L49-L55) |
| Header literally announces the jump | `description={`Step ${step + 1} of 6`}` → renders **"Step 4 of 6"** | [CreateSalesOrderDialog.tsx:84](../../frontend/src/features/sales-orders/components/CreateSalesOrderDialog.tsx#L84) |

### 1.2 The six wizard steps

| Step index | Header shows | Content |
|---|---|---|
| 0 | Step 1 of 6 | Payment mode (FULL / PARTIAL / UNPAID), paid amount, debt due date |
| 1 | Step 2 of 6 | Customer picker |
| 2 | Step 3 of 6 | Sales channel cards (Shop direct / Shop delivery / Phone order) |
| 3 | **Step 4 of 6** | Items editor — **where the scanner lands** |
| 4 | Step 5 of 6 | Delivery fields (skipped for `SHOP_DIRECT`) |
| 5 | Step 6 of 6 | Review + Save draft / Confirm order |

### 1.3 Answers to the eight review questions

**1. How does Scanner Hub currently navigate to sales order?**
`navigate(salesOrderCreateUrl(id))` → a full route change to `/sales-orders?action=add&productId=<id>`. The scanner page unmounts; scan context, the preview panel, and recent-scan list are all destroyed.

**2. Why does it land on Step 4?**
Two places force it, deliberately. `useState(prefill ? 3 : 0)` opens at index 3 when a prefill exists, and the effect at lines 49-55 re-asserts `setStep(3)` once `prefillProduct.data` resolves. Index 3 is the items step — the step the prefill actually fills. The header string is computed as `step + 1`, so the user reads "Step 4 of 6" with no explanation of steps 1-3.

**3. Is the product prefilled through route state or query param?**
**Both paths exist; the query param is the live one.** `salesOrderPrefillFromNavigation` tries `?productId=` first and falls back to `location.state.prefillOrderProductId` ([SalesOrdersPage.tsx:100-102](../../frontend/src/pages/sales-orders/SalesOrdersPage.tsx#L100-L102)). The Scanner Hub only uses the query param. `scannerOrderRouteState` is still exported and still tested ([ScannerHubPage.tsx:30](../../frontend/src/pages/scanner/ScannerHubPage.tsx#L30), [scanner-hub.page.test.tsx:106-114](../../frontend/src/pages/scanner/scanner-hub.page.test.tsx#L106-L114)) but **has no caller** — it is dead code kept alive by its test. The query param was chosen so a hard reload survives (RW2·B in the v2.0.0 plan).

**4. Is the current full wizard reuse causing UX confusion?**
Yes, and it is structural rather than cosmetic:

- The dialog title bar states **"Step 4 of 6"**. The user is told three steps happened that they never saw.
- **Back is enabled** (`step > 0`), so pressing it walks *backwards into* the delivery/channel/customer/payment steps the flow intended to skip.
- The three skipped steps carry **silent defaults** the user never confirmed: `paymentMode = 'FULL'`, `channel = 'SHOP_DIRECT'`, `customerId = ''` ([CreateSalesOrderDialog.tsx:30-36](../../frontend/src/features/sales-orders/components/CreateSalesOrderDialog.tsx#L30-L36)). Those defaults are *reasonable for a counter sale* — but they are invisible, so the user cannot tell whether the sale is being recorded as paid or as debt.
- From step 3, **Next jumps to step 5** for `SHOP_DIRECT` ([CreateSalesOrderDialog.tsx:64](../../frontend/src/features/sales-orders/components/CreateSalesOrderDialog.tsx#L64)) — the header goes **4 → 6**. A second unexplained jump.
- The items editor still renders a **full product search picker** for the already-known product ([ProductLinePicker.tsx:18](../../frontend/src/features/sales-orders/components/ProductLinePicker.tsx#L18)), plus "Add another item" and "Use manual product" — all irrelevant to a single scanned line.
- The whole scanner context is gone. To sell the next scanned item the user must navigate back to `/scanner` and re-scan.

**5. Can a separate Scanner Quick Order form call the same create-sales-order service safely?**
**Yes.** `POST /sales-orders` is the single creation entry point ([sales-orders.routes.ts:34](../../backend/src/features/sales/sales-orders/sales-orders.routes.ts#L34)), guarded by `validate(createSalesOrderSchema)` at the route and re-validated inside `SalesOrdersService.create` ([sales-orders.service.ts:67-72](../../backend/src/features/sales/sales-orders/sales-orders.service.ts#L67-L72)). The wizard has **no privileged path** — it posts the same `CreateSalesOrderInput` through `salesOrdersApi.create` ([sales-orders.api.ts:27](../../frontend/src/features/sales-orders/api/sales-orders.api.ts#L27)) like any other caller would. A second frontend form producing the same payload shape is indistinguishable to the backend and produces an identical `SalesOrder` entity, order number, audit row, and debt linkage.

**6. What required fields does the sales order backend need?**

From [`createSalesOrderSchema`](../../backend/src/features/sales/sales-orders/sales-orders.validator.ts#L40-L66) and `SalesOrdersService.create`:

| Field | Required? | Rule |
|---|---|---|
| `salesChannel` | **Yes** | `SHOP_DIRECT` \| `SHOP_DELIVERY` \| `PHONE_ORDER` |
| `orderDate` | **Yes** | `YYYY-MM-DD`; **must not be in the future** (`validateOrderDates`, service:721-724) |
| `items` | **Yes** | 1–50 lines |
| `items[].quantity` | **Yes** | integer 1–999 |
| `items[].unitPrice` | **Yes** | money string, **must be > 0** (`positiveMoneySchema`) |
| `items[].productId` **XOR** `manualProductName` | **Yes** | exactly one; enforced twice — validator:34-38 and service `prepareItems`:622-624 |
| `fulfillmentStatus` | No | defaults `CONFIRMED`; `DELIVERED` **only** for `SHOP_DIRECT` (validator:63-65) |
| `paidAmount` | No | defaults `'0.00'` |
| `customerId` | **Conditional** | see below |
| `debtDueDate` | **Conditional** | see below |
| `discountAmount` | No | per line, non-negative money |
| `notes` / `items[].notes` | No | ≤ 1000 chars |
| `deliveryDate`, `deliveryFee` | No | **forbidden** when `salesChannel = SHOP_DIRECT` (validator:60-62) |

Conditional rules, both in `SalesOrdersService.create`:

- **Customer** — `validateCustomerRequirement(input.customerId, remainingAmount, user.role === Role.ADMIN)` (service:71, 710-714). A customer may be omitted **only** when the balance is zero **and** the actor is `ADMIN`. An `EMPLOYEE` always needs a customer. Any remaining balance always needs a customer.
- **Debt due date** — `validateCreateDebtTerms` (service:676-682). Required when a balance remains and status is not `DRAFT`; **rejected** when the order is paid in full; never earlier than `orderDate`.

**7. Which fields can be defaulted safely?**

| Field | Safe default | Why safe |
|---|---|---|
| `orderDate` | today | Same as the wizard's `today()`; a counter sale is today's sale |
| `salesChannel` | `SHOP_DIRECT` | A scan at the counter is by definition a walk-in; also keeps delivery fields legitimately absent |
| `fulfillmentStatus` | `DELIVERED` | Matches the wizard's own shop-direct confirm ([CreateSalesOrderDialog.tsx:82](../../frontend/src/features/sales-orders/components/CreateSalesOrderDialog.tsx#L82)); permitted because channel is `SHOP_DIRECT`. **Carries no stock or ledger side effect** — see §4. |
| `items[0].productId` | the scanned product | The whole point of the feature |
| `items[0].quantity` | `1` | Same as `salesOrderLineFromPrefill` today |
| `items[0].unitPrice` | server-derived price | Reuse `salesLineForProduct` verbatim ([ProductLinePicker.tsx:7-13](../../frontend/src/features/sales-orders/components/ProductLinePicker.tsx#L7-L13)): `pricing.cashPrice` when `pricingAvailable`, else `netPrice ?? price ?? '0.00'` |
| `discountAmount` | `'0.00'` | Already the wizard's `emptySalesLine()` default |
| `paidAmount` | equals total (paid in full) | **Shown, never hidden.** The default must be visible and switchable in one tap. |

**8. What must remain mandatory (never defaulted, never bypassed)?**

- **Unit price > 0.** A `0.00` price is a validator rejection. If the product has no price the field must open empty and blocking, not `0.00`.
- **Customer**, whenever the balance is non-zero **or** the actor is not `ADMIN`. The form mirrors the backend rule for a good error message; the backend still decides.
- **Debt due date**, whenever a balance remains.
- **Archived product refusal.** `findActiveProduct` filters `isActive: true` and throws `NotFoundError` (repository:92-94). The panel already disables Make Order for archived products (`disabled={!item.isActive}`, ProductPreviewPanel.tsx:141) — Quick Order keeps that gate.
- **Explicit submit.** No auto-submit on scan, ever.

---

## 2 · Why full-wizard reuse is a UX problem

The wizard is a *composition* tool: it asks payment shape → who → channel → what → delivery → confirm, in that order, because a manual order can be any of those things. The scanner arrives with the **"what"** already answered, which is step 4 of that ordering. Entering a linear sequence at position 4 is not a prefill; it is a **teleport into the middle of a process**, and the dialog says so out loud.

The deeper problem is that the wizard's ordering is wrong for a counter sale. At the counter the user wants **confirm quantity → confirm price → who's paying → done**, on one surface. No amount of conditional step-skipping inside a six-step machine produces that, because the machine's affordances (Back, Next, "Step *n* of 6") are the confusing part, not the field set. Adding a "scanner mode" flag would keep every one of those affordances and add branching to a file that already carries six render branches in ~100 dense lines.

---

## 3 · Recommended design — Scanner Quick Order

**One modal, one screen, no steps.** Opened from the Scanner Hub, over the hub, with the hub still mounted behind it.

New file layout (all frontend, all new files except two small edits):

```
frontend/src/features/sales-orders/components/
  ScannerQuickOrderDialog.tsx      NEW — the form shell + submit
  quick-order-payload.ts           NEW — pure mapping: form state → CreateSalesOrderInput
  quick-order-payload.test.ts      NEW — unit tests for the mapping
frontend/src/features/products/components/
  ProductPreviewPanel.tsx          EDIT — rename the action, add nothing else
frontend/src/pages/scanner/
  ScannerHubPage.tsx               EDIT — open the dialog instead of navigating
```

The mapping lives in its own pure module so it can be unit-tested without rendering, and so no business arithmetic hides inside JSX.

### Recomposed field order (the actual UX)

| Block | Content | Default |
|---|---|---|
| **Header** | Product image, name, model · brand, SKU, barcode, stock badge + quantity, price | Read-only, from `useProduct` |
| **1 · Line** | Quantity stepper, Unit price, live line subtotal | qty `1`, price server-derived |
| **2 · Payment** | Three chips: **Paid in full** / **Partial** / **Unpaid**; partial amount when Partial; debt due date when not Full | **Paid in full**, visible |
| **3 · Customer** | `CustomerPicker` (reused as-is, already has Quick create) | Empty. Labelled *optional* only when admin + paid in full |
| **4 · Notes** | Optional order note | Empty |
| **Footer** | Total · Remaining · **Create Sales Order / إنشاء طلب بيع** · Cancel | — |

Payment before customer, because the payment choice is what *decides* whether a customer is mandatory. The wizard has this order too — it is the one thing worth keeping.

### After a successful create

- Toast: order number.
- Success panel inside the same modal with two buttons: **Open order / فتح الطلب** (`/sales-orders/:id`) and **Scan next / مسح التالي** (closes the modal, refocuses the hub's scan input, clears the preview).
- **No print/receipt button.** There is no print or receipt flow anywhere in the sales-orders feature today — grep found none. Inventing one is out of scope.

---

## 4 · Backend safety rules (binding)

1. **No backend file is touched.** No new endpoint, no new validator, no schema change, no service change, no migration.
2. **One creation path.** The form posts `CreateSalesOrderInput` to `POST /sales-orders` via the existing `salesOrdersApi.create` and `useCreateSalesOrder` hook. No new API client method.
3. **No duplicated business logic.** The frontend computes only what the wizard already computes for *display* — line total, order total, remaining — using the same `toCents`/`fromCents` helpers. Every rule (customer requirement, debt terms, price > 0, product active, order-number allocation) stays server-side. Frontend mirroring exists to produce a good message, never to decide.
4. **Stock is not deducted, and cannot be from this form.** Verified: `SalesOrdersService.create` never writes a stock movement or fulfillment. `INVENTORY_DEDUCTIBLE_STATUSES` is used **only** to compute the read-only `ORDER_NOT_ELIGIBLE` label (service:873). Deduction is a separate, explicit, role-gated action — `POST /sales-orders/:id/deduct-stock`, `requireRole([ADMIN, EMPLOYEE])` (routes:47) — driven from the order details page. Quick Order never calls it.
5. **Stock validation is not weakened, and not added either.** The backend does **not** block selling above stock at create time; the existing picker even says so ("selling above stock is allowed", ProductLinePicker.tsx:18). Quick Order shows the same **advisory** badge and blocks nothing the backend does not block. Adding a client-side stock block would be a *behaviour change*, not a safety improvement.
6. **Ledger and debt untouched.** Debt creation stays inside `createAndLinkDebt` in the same transaction (service:106-112), triggered by the same condition as today: remaining > 0 and status ≠ DRAFT.
7. **Untracked products.** `trackStock: false` products are sellable today and remain so — the header simply shows no stock count, as the preview panel already does.
8. **Backend errors are surfaced verbatim.** Not a generic "Unable to create sales order" toast. The current wizard swallows the server message ([CreateSalesOrderDialog.tsx:79](../../frontend/src/features/sales-orders/components/CreateSalesOrderDialog.tsx#L79)); Quick Order must render the API error text in an inline `role="alert"` region.

---

## 5 · Field mapping — Quick Order form → `CreateSalesOrderInput`

Pure function in `quick-order-payload.ts`:

```
buildQuickOrderPayload({ product, quantity, unitPrice, discountAmount,
                         paymentMode, partialAmount, debtDueDate,
                         customerId, notes, today })
  → CreateSalesOrderInput
```

| Payload field | Value |
|---|---|
| `salesChannel` | `'SHOP_DIRECT'` (constant in v1) |
| `orderDate` | `today()` — same helper shape as the wizard |
| `fulfillmentStatus` | `'DELIVERED'` (legal because channel is `SHOP_DIRECT`) |
| `items` | exactly one line |
| `items[0].productId` | scanned product id |
| `items[0].manualProductName` / `manualProductModel` | `null` — never both set; XOR is satisfied by construction |
| `items[0].quantity` | form quantity |
| `items[0].unitPrice` | form unit price |
| `items[0].discountAmount` | form discount, else `'0.00'` |
| `items[0].notes` | `null` in v1 (order-level note only) |
| `paidAmount` | `FULL` → total · `UNPAID` → `'0.00'` · `PARTIAL` → normalised entry |
| `debtDueDate` | `null` when `FULL`; the chosen date otherwise |
| `customerId` | selected id, else `null` |
| `notes` | order note or `null` |
| `deliveryDate`, `deliveryFee`, `deliveryAddressSnapshot`, `deliveryNotes` | **omitted entirely** — required, since the validator rejects them on `SHOP_DIRECT` |

Client-side pre-submit guards (each a mirror of a server rule, each with a bilingual message):

| Guard | Mirrors |
|---|---|
| unit price > 0 | `positiveMoneySchema` |
| quantity 1–999 | `itemSchema.quantity` |
| customer set unless (admin ∧ paid in full) | `validateCustomerRequirement` |
| debt due date set when remaining > 0 | `validateCreateDebtTerms` |
| partial amount > 0 and < total | wizard rule, `CreateSalesOrderDialog.tsx:63` |
| submit disabled while `create.isPending` | prevents a double order |

---

## 6 · UI layout

```
┌─ Scanner Quick Order / طلب سريع من السكانر ───────────────── ✕ ─┐
│ ┌────────┐  Ceiling Fan 56"                                     │
│ │ image  │  MODEL-XYZ · BrandName                               │
│ │        │  SKU HC-00412   ·   Barcode 6291000123456            │
│ └────────┘  [ In stock: 14 ]   Price 145,000 LBP                │
├─────────────────────────────────────────────────────────────────┤
│ 1 · Line / السطر                                                │
│   Quantity / الكمية   [ − ] [  1  ] [ + ]                       │
│   Unit price / سعر الوحدة  [ 145000.00 ]                        │
│   Line total / إجمالي السطر            145,000                  │
├─────────────────────────────────────────────────────────────────┤
│ 2 · Payment / الدفع                                             │
│   ( Paid in full )  ( Partial )  ( Unpaid )                     │
│   ▸ Partial → Paid amount / المبلغ المدفوع  [        ]          │
│   ▸ not Full → Debt due date / تاريخ الاستحقاق [ date ] *       │
├─────────────────────────────────────────────────────────────────┤
│ 3 · Customer / الزبون                                           │
│   [ CustomerPicker — search · list · Quick create ]             │
│   ⓘ Optional for an admin-recorded fully paid sale              │
├─────────────────────────────────────────────────────────────────┤
│ 4 · Notes / ملاحظات   [                                    ]    │
├─────────────────────────────────────────────────────────────────┤
│ ⚠ <backend error text, verbatim>                                │
├─────────────────────────────────────────────────────────────────┤
│ Total 145,000 · Remaining 0                                     │
│              [ Cancel / إلغاء ]  [ Create Sales Order / إنشاء ] │
└─────────────────────────────────────────────────────────────────┘
```

Conventions kept: `Modal` with `size="lg"` and a `footer`, `FormField` / `Input` / `Select` / `Button` from `components/ui`, `formatMoney` for every money figure, `dir="auto"` + `user-text` on product and customer names, `"English / عربي"` label strings throughout, `ProductStockBadge` reused for the stock chip. **No new design primitives.**

---

## 7 · Route vs modal — recommendation

| Option | Verdict |
|---|---|
| **1 · Modal inside Scanner Hub** | **Recommended.** Hub stays mounted → scan input, preview, and recent-scans survive; "Scan next" costs one click and zero refetches. No route-state plumbing, no strip-the-param dance. |
| 2 · Dedicated route `/sales-orders/quick-create?productId=…&source=scanner` | Refresh-safe and directly testable, but unmounts the hub and re-creates exactly the context loss that makes today's flow feel wrong. Worth adding **later** if a phone-scanner deep link ever needs it. |
| 3 · Wizard with a scanner mode | **Rejected.** Keeps Back, Next and the step counter — the confusing parts — and adds branching to an already dense file. |

The chosen shape keeps option 2 cheap: the dialog is a self-contained component taking `{ productId, isOpen, onClose, onCreated }`, so a route wrapper is a ~15-line addition whenever it is wanted.

**Refresh caveat, stated honestly:** a modal is not URL-addressable, so a browser refresh mid-form loses the draft. Today's flow technically survives refresh (the `?productId=` param) — but only to reopen an empty wizard at step 4, which is the behaviour being removed. Losing a half-typed quantity on a hard refresh at the counter is an acceptable trade for keeping scan context. Flagged as an open decision in §11.

---

## 8 · Single product now, scanner cart later

**v1 = one scanned line.** It covers the counter case, keeps the payload trivially valid (XOR satisfied by construction, one line, no reordering), and ships in one checkpoint.

The design does not block a cart. Three deliberate choices keep the door open:

1. `buildQuickOrderPayload` already emits `items: [...]` — an array. A cart changes its input from one line to a list; the output shape is unchanged.
2. The line block is a self-contained section, so a cart becomes a list of that block plus a running total.
3. The backend already accepts up to **50 items** per order — no backend work would be needed for a cart, ever.

What a cart *would* additionally need, and why it is not v1: a scan-accumulation buffer on the hub, duplicate-scan merge rules (same product scanned twice → quantity += 1, or a second line?), per-line remove, and a cart-persistence decision across navigation. Those are real product questions, not plumbing.

---

## 9 · Test plan

All new tests follow the project's existing style: `renderToStaticMarkup` for component assembly (this project has **no jsdom** — see the note at [scanner-hub.page.test.tsx:25-30](../../frontend/src/pages/scanner/scanner-hub.page.test.tsx#L25-L30)), plus pure unit tests for the payload mapper, which is where the real coverage lives.

**`quick-order-payload.test.ts` (pure, the core suite)**

- one product → exactly one item, `productId` set, `manualProductName` null
- quantity defaults to 1; a changed quantity reaches the payload
- unit price seeded from `pricing.cashPrice` when `pricingAvailable`, else `netPrice`, else `price`
- `salesChannel === 'SHOP_DIRECT'` and `fulfillmentStatus === 'DELIVERED'`
- **no `deliveryDate` / `deliveryFee` / `deliveryAddressSnapshot` / `deliveryNotes` key is present at all**
- FULL → `paidAmount === total`, `debtDueDate === null`
- UNPAID → `paidAmount === '0.00'`, `debtDueDate` carried through
- PARTIAL → normalised paid amount, remaining computed correctly
- discount subtracts from the line total
- payload contains **no** key outside `CreateSalesOrderInput` (key-set assertion)

**`ScannerQuickOrderDialog` (static render)**

- renders product name, SKU, barcode, stock badge, price in the header
- renders quantity, unit price, payment chips, customer picker, notes, submit
- renders **no product search input** — assert the picker's `Search by name, model, SKU or barcode` hint is absent
- renders no "Add another item" and no "Use manual product"
- renders no `Step \d of 6` string anywhere
- renders no `type="password"` field
- admin + paid-in-full shows the "customer optional" hint; employee does not
- a backend error message renders inside a `role="alert"` region, verbatim
- issues no `api.post` during render

**`ScannerHubPage` (edits to the existing suite)**

- the hub renders the Quick Order action label
- the hub still renders Open Product and Receive Stock
- **existing test at line 106 must be revisited**: `scannerOrderRouteState` becomes fully dead once Make Order stops navigating. Decide with the user — delete the helper and its assertions, or keep both. Keeping `salesOrderCreateUrl` is required regardless (the wizard route still consumes `?productId=`).
- the existing "touches no ledger, payment, debt, or stock-mutating endpoint on render" test must still pass — the dialog must not mount its queries until opened

**Regression (must all still pass, unchanged)**

- the whole 6-step wizard suite in `sales-orders.components.test.tsx`, including `starts the creation wizard with payment`, `opens a prefilled creation wizard on Items with the scanned product visible at quantity one`, and `seeds only the scanned product, quantity one, and the server-derived price`
- `sales-orders.page.test.ts` — the `?productId=` / route-state prefill helpers, untouched
- every backend sales test — **zero backend files change, so zero backend tests change**
- `supplier-receiving.frontend.test.tsx` — receiving hand-off untouched
- full suite green (baseline: 251 files, 2080 passed, 10 skipped, 0 failed) and both typechecks clean

---

## 10 · Implementation checkpoints

| CP | Deliverable | Gate |
|---|---|---|
| **CP-SQO1** | Review current scanner ↔ sales flow. **← this document. Complete.** | User approves the design below before any code |
| **CP-SQO2** | `ScannerQuickOrderDialog` UI shell — header, line, payment, customer, notes, footer. Renders, submits nothing. | Static-render tests pass |
| **CP-SQO3** | `quick-order-payload.ts` + its unit tests; wire submit through the existing `useCreateSalesOrder`. | Payload suite green; no backend file modified |
| **CP-SQO4** | Scanner Hub action rename + dialog wiring; success panel with Open order / Scan next. | Hub tests green; Open Product and Receive Stock unchanged |
| **CP-SQO5** | Full test + regression sweep; both typechecks. | 0 failures; wizard suite untouched and green |
| **CP-SQO6** | Release review — **only on explicit user request.** | Nothing bumped, built, staged, or pushed before then |

---

## 11 · Decisions — locked 2026-08-22

Settled before the build prompt was issued. The build prompt is
[`Prompts/scanner-quick-order-codex-prompt.md`](Prompts/scanner-quick-order-codex-prompt.md).

| # | Decision | Resolution |
|---|---|---|
| 1 | Payment default | **Paid in full**, visible and one tap to change. The wizard's own default. |
| 2 | Discount field | **Omitted in v1.** The backend accepts `discountAmount`, but the wizard deliberately does not expose it and `sales-orders.components.test.tsx:73` asserts its absence. Parity wins. |
| 3 | `scannerOrderRouteState` | **Deleted**, along with its test assertions. It is already dead code — nothing calls it. `salesOrderCreateUrl` stays. |
| 4 | Fate of Make Order | **Replaced outright** by Quick Order on the preview panel. Two buttons that both create sales orders would confuse more than the step counter did. The wizard stays reachable from `/sales-orders → Add Order`. |
| 5 | Refresh safety | **Modal-only for v1**, accepting the §7 caveat. The `/sales-orders/quick-create` route wrapper stays cheap to add later. |
| 6 | Notes | **One order-level note.** The line note stays absent. |
| 7 | Partial payment | **Included.** The wizard already supports it and the mapping is a single `paidAmount` value, so the "only if it maps safely" condition is met. Bounds mirror `CreateSalesOrderDialog.tsx:63`. |
| 8 | Save draft | **Excluded.** A counter sale is not a draft; the wizard keeps that path. |

**Still open, deliberately deferred:** the scanner cart (§8) and the
`/sales-orders/quick-create` route (§7). Neither blocks v1.

---

## Appendix · Out-of-scope defect noticed during review

Not part of this feature and **not fixed here** — recording it so it is not lost.

[sales-orders.api.ts:26](../../frontend/src/features/sales-orders/api/sales-orders.api.ts#L26) calls `api.get('\sales-orders\summary', ...)` with **backslashes**. In a JavaScript string `\s` is not an escape sequence, so it collapses to `s` and the request URL becomes `sales-orderssummary` — no leading slash, no path separator. The summary cards on the Sales Orders page are therefore requesting a URL that cannot resolve to `GET /sales-orders/summary`. It is committed code (unchanged since v1.9.0) and `sales-orders.api.test.ts` has **no test for `summary`**. Worth a separate one-line fix plus a test, on its own checkpoint.
