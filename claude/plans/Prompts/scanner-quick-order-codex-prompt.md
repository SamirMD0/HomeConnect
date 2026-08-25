# Codex Implementation Prompt — CP-SQO2…CP-SQO5 / Scanner Quick Order

Copy everything below the line into Codex.

---

You are implementing the **Scanner Quick Order** workflow in the **HomeConnect** repository (Node/Express + Prisma/Postgres, React 19 + TypeScript, single root `package.json`, Vitest). This is **frontend-only work plus one one-line API URL fix.**

## Your source of truth

```
claude/plans/scanner-quick-order-workflow-plan.md
```

That document is the completed CP-SQO1 review. Read **§1** (what the code does today, with file:line evidence), **§4** (binding backend safety rules), **§5** (the payload mapping), and **§9** (the test plan). Implement **CP-SQO2 through CP-SQO5 in one pass.** Do not stop after one phase unless genuinely blocked by a contract issue.

## The problem

Scanner Hub detects the product correctly, then `Make Order` navigates to `/sales-orders?action=add&productId=<id>`, which opens the six-step Create Sales Order wizard **forced to step index 3** — the dialog header literally renders **"Step 4 of 6"**. Back walks into the three skipped steps, `Next` jumps the header 4 → 6, three defaults (`FULL`, `SHOP_DIRECT`, no customer) were never shown to the user, and the items step still renders a full product search picker for the product just scanned.

Replace that hand-off with a dedicated one-screen dialog. **Do not add a "scanner mode" to the wizard.**

---

## Non-negotiable rules

1. **No backend file changes.** Not the validator, not the service, not the repository, not the routes, not the schema. No migration. If you believe the backend must change, **stop and report it** — that is a contract issue, and the review concluded nothing blocks a quick order.

2. **One creation path.** Post the existing `CreateSalesOrderInput` to the existing `POST /sales-orders` through the existing `salesOrdersApi.create` / `useCreateSalesOrder`. **No new API client method, no new hook, no new order type, no `source: 'scanner'` marker.**

3. **Stock is never deducted at creation, and you must not add it.** Verified: `SalesOrdersService.create` writes no stock movement and no fulfillment. Deduction is a separate role-gated endpoint (`POST /sales-orders/:id/deduct-stock`, `requireRole([ADMIN, EMPLOYEE])`) driven from the order details page. **Quick Order must never call it.** Write a test asserting no request to any `deduct-stock` or `restore-stock` URL.

4. **Selling above stock must NOT be blocked.** The backend permits it — the existing picker says so in as many words (`ProductLinePicker.tsx:18`, "selling above stock is allowed"). The stock badge in Quick Order is **advisory**: it may warn, it may never disable Submit. A test must prove an over-stock quantity still submits.

5. **No duplicated business logic.** Compute only what is needed to *display* a running total. Every rule — customer requirement, debt terms, price > 0, product active, order-number allocation — stays server-side. Frontend mirroring exists to produce a bilingual message instead of a raw 400, never to decide.

6. **Do not change the six-step wizard's behaviour.** `CreateSalesOrderDialog` keeps every step, its prefill path, and its tests. The only edit permitted to it is the money-helper import in the refactor below.

7. **`/sales-orders?action=add&productId=<id>` must keep working.** It is still used by `ProductDetailsDrawer.tsx:84` and `ProductOverflowMenu.tsx:38`, and asserted by `product-catalogue.test.tsx:369`. Keep `salesOrderCreateUrl` and the page's prefill helpers exactly as they are. Only Scanner Hub stops using that route.

8. **This project has NO jsdom and NO @testing-library.** Check `vitest.config.ts` and the root `package.json` — neither is installed, and `test.environment` is unset. Every existing frontend test is either a **pure function test** or a `renderToStaticMarkup` string assertion (see the comment at `scanner-hub.page.test.tsx:25-30`). **Do not write `fireEvent`, `userEvent`, `render` from testing-library, or `screen.*`.** Do not add either dependency. Put the logic in exported pure functions and test those — this is the established pattern; `BrandFixDialog.tsx` exports `validateBrandFix`, `brandFixReducer`, and `brandFixErrorMessage` for exactly this reason. Follow it.

9. **Verify every identifier against the source before using it.** Type names, enum string members, hook names, and UI component props. A near-match invented from memory is a runtime failure this test setup will not catch. If an identifier named in this prompt does not exist, **stop and report it** rather than substituting something similar.

10. **Bilingual labels** in the existing `English / العربية` style, LTR layout, `dir="auto"` and `user-text` on product and customer names. Money always through `formatMoney`.

11. **No new dependencies. No new design primitives.** Reuse `Modal`, `Button`, `Card`, `Badge`, `FormField`, `Input`, `Select`, `Textarea` from `components/ui`, and `CustomerPicker`, `ProductImageView`, `ProductStockBadge` as they are.

12. **The working tree is already dirty** with uncommitted RW2–RW9 work across products, inventory, scanner and sales-orders files. **Do not revert, stash, or "clean up" anything you did not write.** Do not bump the version (stays `1.9.6`), do not build the installer, do not stage, commit, or push. Do not touch the business database.

---

## Verified backend contract — build to this, do not re-derive it

From `backend/src/features/sales/sales-orders/sales-orders.validator.ts` and `sales-orders.service.ts`:

| Field | Rule |
|---|---|
| `salesChannel` | required — `'SHOP_DIRECT' \| 'SHOP_DELIVERY' \| 'PHONE_ORDER'` |
| `orderDate` | required, `YYYY-MM-DD`, **must not be in the future** |
| `items` | required, 1–50 |
| `items[].quantity` | required, integer **1–999** |
| `items[].unitPrice` | required, money string, **strictly greater than zero** |
| `items[].productId` **XOR** `items[].manualProductName` | exactly one — enforced in the validator *and* again in `prepareItems` |
| `fulfillmentStatus` | optional, defaults `CONFIRMED`; **`DELIVERED` is legal only when `salesChannel === 'SHOP_DIRECT'`** |
| `paidAmount` | optional, defaults `'0.00'` |
| `customerId` | omittable **only** when remaining balance is zero **AND** the actor is `ADMIN` (`validateCustomerRequirement`, service:710-714) |
| `debtDueDate` | **required** when a balance remains and status ≠ `DRAFT`; **rejected** when paid in full; never before `orderDate` (`validateCreateDebtTerms`, service:676-682) |
| `deliveryDate`, `deliveryFee` | **REJECTED** when `salesChannel === 'SHOP_DIRECT'` — omit the keys entirely, do not send `null` |
| `notes`, `items[].notes` | optional, ≤ 1000 chars |
| `discountAmount` | supported by the backend but **out of scope — see Decision 1** |

Frontend types already exist and must be reused verbatim: `CreateSalesOrderInput`, `SalesOrderLineInput`, `SalesChannel` in `frontend/src/features/sales-orders/types/sales-orders.types.ts`.

---

## Locked decisions

**Decision 1 — no discount field in v1.** The backend accepts `discountAmount`, but the wizard deliberately omits it and `sales-orders.components.test.tsx:73` asserts its absence. Quick Order keeps parity. Do not add it, and do not send the key.

**Decision 2 — `Make Order` is replaced, not supplemented.** `ProductPreviewPanel`'s primary action becomes **`Quick Order / طلب سريع`** and opens the new dialog. There must not be two buttons on that panel that both create sales orders.

**Decision 3 — three payment modes, including partial.** `PAID` / `PARTIAL` / `DEBT`. Partial is included because the wizard already supports it and the mapping is a single `paidAmount` value — the condition the plan set for including it. Partial requires an amount greater than zero and strictly less than the total (mirroring `CreateSalesOrderDialog.tsx:63`), plus a due date.

**Decision 4 — no Save draft.** A counter sale is not a draft. The wizard keeps its draft path; Quick Order always creates a real order.

---

## Files

```
frontend/src/features/sales-orders/utils/sales-money.ts              // new — extracted money helpers
frontend/src/features/sales-orders/utils/quick-order-payload.ts      // new — state, rules, payload
frontend/src/features/sales-orders/utils/quick-order-payload.test.ts // new — the main suite
frontend/src/features/sales-orders/components/ScannerQuickOrderDialog.tsx      // new
frontend/src/features/sales-orders/components/scanner-quick-order.test.tsx     // new
frontend/src/features/sales-orders/components/ProductLinePicker.tsx  // edit — use shared price helper
frontend/src/features/sales-orders/components/CreateSalesOrderDialog.tsx // edit — import money helpers only
frontend/src/features/sales-orders/api/sales-orders.api.ts           // edit — summary URL defect
frontend/src/features/sales-orders/api/sales-orders.api.test.ts      // edit — summary URL test
frontend/src/features/products/components/ProductPreviewPanel.tsx    // edit — Quick Order action
frontend/src/features/products/components/ProductPreviewPanel.test.tsx // edit — renamed action
frontend/src/pages/scanner/ScannerHubPage.tsx                        // edit — open dialog, stop navigating
frontend/src/pages/scanner/scanner-hub.page.test.tsx                 // edit — new hand-off
frontend/src/shared/labels/business-labels.ts                        // edit — quick order labels
```

---

## CP-SQO3 · The pure core (build this first)

### `utils/sales-money.ts` — extraction, zero behaviour change

`CreateSalesOrderDialog.tsx:97-101` holds four private helpers — `toCents`, `fromCents`, `normalizeMoney`, and the two preview calculators. Quick Order needs the same arithmetic, and two copies of money code in one feature folder will drift.

Move `toCents`, `fromCents`, `normalizeMoney` into `sales-money.ts` **unchanged, algorithm for algorithm** (integer `bigint` cents, the same `/^(\d+)(?:\.(\d{0,2}))?$/` pattern, unparseable → `0n`, negative → clamped to zero), add `addMoney`, `subtractMoney`, `scaleMoney(value, wholeQuantity)`, `compareMoney`, `isPositiveMoney`, and have `CreateSalesOrderDialog` import them instead of declaring them. Leave `calculatePreview` and `subtractPreview` in the dialog. **The existing wizard tests must pass untouched — that is your proof the extraction changed nothing.**

### `utils/quick-order-payload.ts`

All pure, all exported, no React import:

- `type QuickOrderPaymentMode = 'PAID' | 'PARTIAL' | 'DEBT'`
- `interface QuickOrderFormState { quantity; unitPrice; paymentMode; partialAmount; debtDueDate; customerId; notes }`
- `productSellingPrice(product)` — `pricing.cashPrice` when `pricing.pricingAvailable`, else `netPrice ?? price ?? '0.00'`. **This is lifted from `salesLineForProduct` (`ProductLinePicker.tsx:9-12`); edit that function to call this one** so there is exactly one price derivation. Direction of dependency is component → utils, never the reverse.
- `initialQuickOrderState(product)` — quantity `1`, unit price from above, mode `PAID`, everything else empty.
- `quickOrderTotals(state)` → `{ lineTotal, total, paidAmount, remaining }`. `paidAmount` is the total for `PAID`, `'0.00'` for `DEBT`, the normalised entry for `PARTIAL`.
- `quickOrderCustomerOptional(state, isAdmin)` — true only when `isAdmin` and remaining is zero.
- `validateQuickOrder(state, { isAdmin, today })` → `QuickOrderErrors` keyed by field, each message bilingual. Mirror **exactly** the backend rules in the contract table: quantity range, unit price > 0, partial bounds, due date required when a balance remains and not before today, customer required when a balance remains or the actor is not admin.
- `buildQuickOrderPayload({ productId, state, today })` → `CreateSalesOrderInput`.
- `quickOrderStockAdvice(product, quantity)` → `{ tone, label, overSelling }`. **Advisory only** — nothing consuming it may disable Submit.
- `quickOrderErrorMessage(error)` — reads `error.response.data.error.message`, falling back to `error.response.data.message`, then a bilingual default. Match `brandFixErrorMessage` (`BrandFixDialog.tsx:81-83`).

The payload it emits, and nothing else:

```ts
{
  customerId: state.customerId || null,
  salesChannel: 'SHOP_DIRECT',
  orderDate: today,                 // use todayString() from utils/sales-order-dates
  fulfillmentStatus: 'DELIVERED',
  paidAmount,
  debtDueDate: state.paymentMode === 'PAID' ? null : state.debtDueDate || null,
  notes: state.notes.trim() || null,
  items: [{ productId, quantity: state.quantity, unitPrice: normalizeMoney(state.unitPrice) }],
}
```

**Keys that must be absent entirely** — not `null`, absent: `deliveryDate`, `deliveryFee`, `deliveryAddressSnapshot`, `deliveryNotes` (the validator rejects them on `SHOP_DIRECT`), `discountAmount`, `items[].notes`, `items[].manualProductName`, `items[].manualProductModel`. Assert this with a key-set test, not a value test.

Use `todayString()` from `frontend/src/features/sales-orders/utils/sales-order-dates.ts` — it already exists and produces the local `YYYY-MM-DD` the wizard's private `today()` produces. Do not write a third date helper.

---

## CP-SQO2 · `ScannerQuickOrderDialog`

Props: `{ productId: string | null; isOpen: boolean; onClose: () => void }`. It owns its own `useProduct(productId)` and `useCreateSalesOrder()`; it must issue **no query while closed** (pass `''` to `useProduct` when not open — `useProduct` is `enabled: Boolean(id)`).

`Modal`, `size="lg"`, title **`Scanner Quick Order / طلب سريع من السكانر`**, with a `footer`. **The dialog must not render any "Step *n* of *m*" text anywhere** — a test asserts this.

**Header** — `ProductImageView`, product name, `model · brand`, SKU, barcode, `ProductStockBadge`, unit price. Loading, error-with-retry, and archived states reuse the wording already in `ProductPreviewPanel`.

**1 · Line** — quantity input (min 1, max 999) with `−`/`+` steppers, unit price input (`numeric`), live line total, and the advisory stock chip from `quickOrderStockAdvice`. `Badge` tones `'warning'` and `'info'` are both in use in this feature already.

**2 · Payment** — three selectable chips from `QUICK_ORDER_PAYMENT_LABELS`. Partial amount field appears for `PARTIAL`; debt due date field (`type="date"`, `min={todayString()}`) appears whenever a balance remains. Payment comes **before** customer, because the payment choice is what decides whether a customer is mandatory.

**3 · Customer** — `CustomerPicker` unchanged (it already has Quick create). Show the optional hint only when `quickOrderCustomerOptional` is true; otherwise show why a customer is needed.

**4 · Notes** — optional `Textarea`, `userText`.

**Footer** — `Total` and `Remaining` via `formatMoney`, then `Cancel / إلغاء` and `Create Sales Order / إنشاء طلب بيع`. Submit is disabled while `create.isPending`. Field errors render under their fields; the server message renders in a `role="alert"` region at the top of the body, **verbatim** — do not replace it with a generic toast the way `CreateSalesOrderDialog.tsx:79` does.

**Success state** — replace the form body with a confirmation naming the order number, and two actions: **`Open order / فتح الطلب`** (navigates to `/sales-orders/:id`, a route that already exists) and **`Scan next / مسح التالي`** (closes the dialog and returns to the hub). Reset all state on close so the next scan opens a clean form.

---

## CP-SQO4 · Scanner Hub integration

- `ProductPreviewPanel`: rename the prop `onMakeOrder` → `onQuickOrder` and the button label to **`Quick Order / طلب سريع`**, keeping the `disabled={!item.isActive}` archived-product gate and the existing icon. `Receive Stock` and `Open Product` are untouched.
- `ScannerHubPage`: replace `onMakeOrder={(id) => navigate(salesOrderCreateUrl(id))}` with state that opens `ScannerQuickOrderDialog` for that product. **The hub must not navigate away** — the scan box, preview panel and recent-scans list stay mounted, which is the entire point of the modal.
- Delete `scannerOrderRouteState` (`ScannerHubPage.tsx:30`) and its assertions in `scanner-hub.page.test.tsx:106-114`. It is dead code today — nothing calls it, only its test keeps it alive — and it becomes unreachable once Make Order stops navigating. **Keep `salesOrderCreateUrl` and the `salesOrderPrefillFrom*` helpers in `SalesOrdersPage`**; per rule 7 the product catalogue still uses that route.
- Remove the now-unused `salesOrderCreateUrl` import from `ScannerHubPage` if nothing else there needs it.
- Add the new bilingual strings to the `scanner` block in `business-labels.ts`, alongside the existing entries.

---

## CP-SQO5 · Tests, and the API defect

### The defect (fix it in this checkpoint)

`frontend/src/features/sales-orders/api/sales-orders.api.ts:26` reads:

```ts
(await api.get('\sales-orders\summary', { params: range })).data.data
```

Those are **backslashes**. In a JavaScript string `\s` is not an escape sequence, so it collapses to `s` and the request URL becomes `sales-orderssummary` — no leading slash, no separator. Fix it to `'/sales-orders/summary'`. It has been in the tree since v1.9.0 and `sales-orders.api.test.ts` has no `summary` test at all; add a focused one asserting the exact URL string and that the range params are forwarded. **Do not expand this into any other sales dashboard work.**

### Suites to write

**`quick-order-payload.test.ts`** — the core, and where most coverage belongs:
- one product → exactly one item, `productId` set
- quantity defaults to 1; a changed quantity reaches the payload and changes the total
- unit price seeded from `pricing.cashPrice`, then `netPrice`, then `price`, then `'0.00'`
- `salesChannel === 'SHOP_DIRECT'` and `fulfillmentStatus === 'DELIVERED'`
- **key-set assertion**: no delivery key, no `discountAmount`, no `manualProductName`, no `manualProductModel`, and no stock-related key anywhere in the payload
- `PAID` → `paidAmount === total` and `debtDueDate === null`
- `DEBT` → `paidAmount === '0.00'`, due date carried through, customer required
- `PARTIAL` → normalised amount, correct remaining, rejected at zero and rejected at ≥ total
- customer optional **only** for admin with zero remaining; required for a non-admin even when fully paid; required for anyone when a balance remains
- due date required when a balance remains; rejected before today
- unit price of `'0.00'` and `'0'` both blocked; quantity `0` and `1000` both blocked
- **over-stock quantity produces `overSelling: true` and still yields NO validation error** — this is the rule most likely to be broken by accident
- `quickOrderErrorMessage` prefers the server message and falls back cleanly

**`scanner-quick-order.test.tsx`** — `renderToStaticMarkup`, mocking `useProduct`, `useCreateSalesOrder`, `useAuth` and the customer hooks the way `ProductPreviewPanel.test.tsx` and `scanner-hub.page.test.tsx` already do:
- header renders name, SKU, barcode, stock badge, price
- quantity, unit price, payment chips, customer picker, notes and submit all render
- **no product search input** — assert the `ProductPicker` hint string `Search by name, model, SKU or barcode` is absent
- no `Add another item`, no `Use manual product`
- **no `Step` / `of 6` text**
- no `type="password"` field
- server error renders inside `role="alert"`
- issues no `api.post` on render, and no request to `deduct-stock` or `restore-stock`

**`scanner-hub.page.test.tsx`** — updated:
- the hub renders the `Quick Order / طلب سريع` label and no longer renders `Make Order`
- `Open Product` and `Receive Stock` still render, and `scannerReceivingRouteState` assertions stay
- the existing "touches no ledger, payment, debt, or stock-mutating endpoint on render" test still passes
- the `scannerOrderRouteState` block is removed, not weakened

**Regression — must pass unedited:**
- the whole `sales-orders.components.test.tsx` wizard suite, including `starts the creation wizard with payment`, `opens a prefilled creation wizard on Items with the scanned product visible at quantity one`, and `seeds only the scanned product, quantity one, and the server-derived price`
- `sales-orders.page.test.ts` prefill helpers
- `product-catalogue.test.tsx:369`, which asserts the catalogue still links to `salesOrderCreateUrl`
- `ProductPreviewPanel.test.tsx` — update only the renamed prop and label, change nothing else
- every backend sales test, which cannot change because no backend file changes

---

## Definition of done

- `npm test` green. Baseline before you start is **251 files, 2080 passed, 10 skipped, 0 failed** — run it first and report the real numbers if they differ.
- `npm run typecheck` clean — run it **separately**; vitest does not typecheck, and a green suite has hidden a type error in this project before.
- `npm run lint` clean for the files you touched.
- `git diff --check` clean.
- No existing test weakened or deleted to accommodate a change, except the `scannerOrderRouteState` block, which is removed because its subject is deleted.
- No backend file in the diff. No migration. Version still `1.9.6`. No installer. Nothing staged or committed. Business database untouched.

## In your final response

1. `git status --short` before you started, and which dirty RW files your work overlapped.
2. Files changed, split by checkpoint.
3. The exact `buildQuickOrderPayload` output for a paid-in-full single-item order, and for a debt order — as literal JSON.
4. How the customer / debt-due-date rules are mirrored, and the line proving they are mirrored rather than enforced client-side.
5. The name of the test that proves selling above stock still submits.
6. Confirmation that no `deduct-stock` call exists anywhere in the new code.
7. The summary URL before and after, and the name of the test covering it.
8. Test, typecheck, and lint output verbatim, including any failure.
9. Anything deferred, and why.
10. Confirmation: CP-SQO2–CP-SQO5 all implemented, no backend business logic changed, no stock deduction behaviour changed, no ledger or payment rules changed, no migration, no version bump, no installer, nothing staged or committed, business database untouched.
