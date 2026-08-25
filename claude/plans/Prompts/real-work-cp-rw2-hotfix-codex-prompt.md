# Codex Implementation Prompt — CP-RW2 / v1.9.7 Hotfix

Copy everything below the line into Codex.

---

You are fixing two P0 bugs in the **HomeConnect** repository (Node/Express + Prisma/Postgres backend, React 19 + TypeScript frontend, Electron desktop shell). Both were found in real business use after three days of live operation.

## Your source of truth

Read this file first and treat it as the specification:

```
claude/plans/real-work-bugfix-product-inventory-workflow-plan.md
```

You are implementing **CP-RW2 only** — the v1.9.7 hotfix. That is sections **§4.A**, **§4.B**, **§7**, and **§8** of the plan. Everything else in that document (batch inventory onboarding, product page UX, duplicate detection, brands) is a **later release. Do not build it.**

**The root cause of both bugs is already diagnosed in §2.A and §2.B, with exact file and line references. Do not re-investigate. Do not redesign.** If you believe a diagnosis is wrong, stop and say so before writing code — do not silently deviate.

## What you are fixing

**Bug A — Add Product cannot enable stock tracking.** The stock section renders only when editing. Create has no stock field at any of four layers, so every product ever created was written `trackStock = false`. This is the cause of the 309-product inventory backlog.

**Bug B — Scanner Hub → Make Order looks like it prefilled nothing.** The product *is* carried into the sales order correctly. The product picker simply cannot display a selection it did not make itself, so the counter sees an empty search box and searches again.

## Non-negotiable rules

1. **No Prisma migration.** `trackStock`, `stockQuantity`, and `lowStockThreshold` already exist on `products` (`schema.prisma:701-703`). If you think you need a schema change, stop and report it.

2. **`stockQuantity` must remain unreachable from the create endpoint.** Add `trackStock` and `lowStockThreshold` to `createProductSchema`. **Do not add `stockQuantity`.** Every quantity in this system traces to a `StockMovement` row, and create writes none. The schema is `.strict()`, so a posted `stockQuantity` must stay a 400.

3. **Do not add stock fields to `updateProductSchema`.** Stock settings have their own admin-only endpoint (`PATCH /products/:productId/stock` → `updateProductStockSchema`). That endpoint is correct and stays as it is. `updateProductSchema` is `.strict()` on purpose — read the comment at `products.validator.ts:128-133` before touching it.

4. **Do not weaken the opening-count guard.** A product created with `trackStock: true` must still land in `PENDING_ONBOARDING` with every stock action blocked until an admin runs Verify Opening Count. `InventoryRepository.setVerifiedOpeningCount` already sets `trackStock: true`, so nothing about that path changes.

5. **No backend change at all for Bug B.** Sales-order validation, `SalesOrderStockFulfillment`, debt creation, and price derivation are untouched. Bug B is entirely frontend.

6. **Do not modify the business database.** Do not run `backend/prisma/data-fixes/2026-08-21-normalize-product-brands.sql`. It is written, verified, and deliberately not executed — it is not part of this checkpoint.

7. **Do not bump the version, build an installer, or commit.** That is CP-RW8. Leave `package.json` at `1.9.6`.

8. **Bilingual labels throughout**, matching the surrounding code: `English / العربية` in one string. Do not convert anything to RTL. User-entered text keeps `dir="auto"`.

9. **No new dependencies.**

10. **Existing tests must pass untouched.** In particular do not edit `frontend/src/pages/sales-orders/sales-orders.page.test.ts` or the route-state assertions in `frontend/src/pages/scanner/scanner-hub.page.test.tsx` to make your change pass — route state stays a supported fallback (see Bug B, step 4).

---

## Bug A — create-time stock tracking

### A1 · `backend/src/features/service/products/products.validator.ts`

Add to `createProductSchema` only:

```ts
trackStock: z.boolean().optional(),
lowStockThreshold: z.number().int('Low stock threshold must be an integer').min(0).nullable().optional(),
```

Reuse the shape already proven in `updateProductStockSchema` (line 148). Do not touch `productValues`, which is shared with `updateProductSchema`.

### A2 · `backend/src/features/service/products/products.service.ts` — `ProductsService.create`

Write both fields in the `ProductsRepository.create` call:

```ts
trackStock: input.trackStock ?? false,
lowStockThreshold: input.lowStockThreshold ?? null,
```

`stockQuantity` is not passed; the Prisma default of `0` stands.

**Permission gating — mirror the pricing pattern that is already there.** `POST /products` has no `requireServiceAdmin` on the route; instead `create` gates conditionally at line 69-70:

```ts
const includesPricing = hasProductPricingInput(input);
if (includesPricing) assertServiceAdmin(user);
```

Stock settings are admin-only everywhere else (`PATCH /:productId/stock` is `requireServiceAdmin`). So gate them the same way: if the caller supplied `trackStock` or `lowStockThreshold`, `assertServiceAdmin(user)`. An employee creating a plain product is unaffected.

**Surface this in your summary as a decision.** The alternative — letting any authenticated user set `trackStock` at create — is defensible, because the flag alone grants no capability while the opening count still gates every action. The conditional assert is chosen because it matches the existing convention and widens no permission. Say which you implemented.

**No audit work is needed.** `productSnapshot` (`products.service.ts:740-741`) already emits `trackStock`, `stockQuantity`, and `lowStockThreshold`, so the existing CREATE audit records the tracking intent for free. Do not add a second audit write.

### A3 · `frontend/src/features/products/types/product.types.ts`

Add to `CreateProductInput`:

```ts
trackStock?: boolean;
lowStockThreshold?: number | null;
```

`UpdateProductInput` is derived from `CreateProductInput` via `Partial<Omit<…>>`. Confirm the two new fields do **not** leak into it — if they do, exclude them explicitly, because sending them to `PATCH /products/:id` is a 400 by design.

### A4 · `frontend/src/features/products/components/ProductStockSection.tsx`

Add a `mode: 'create' | 'edit'` prop (default `'edit'`, so no existing call site changes).

In `'create'` mode:
- Hide the "Current quantity" `<output>` entirely — there is nothing to show.
- Keep the Track stock checkbox and the Low-stock threshold field exactly as they are.
- When `trackStock` is on, render a persistent note:
  `Stock tracking enabled. The opening count must be verified before any stock action. / تم تفعيل تتبع المخزون. يجب تأكيد الجرد الافتتاحي قبل أي حركة مخزون.`

In `'edit'` mode the component must render **byte-identically to today**. It has snapshot coverage in `products.components.test.tsx` — do not regenerate that snapshot to accommodate a change.

### A5 · `frontend/src/features/products/components/ProductFormDialog.tsx`

- Line 193 currently reads `{product && <><ProductStockSection …/>…</>}`. Render the section in both modes, passing `mode={product ? 'edit' : 'create'}`.
- `toCreateInput` (line 247) must include `trackStock` and `lowStockThreshold` from the `stock` state. Send `lowStockThreshold` only when tracking is on; send `null` otherwise.
- The existing `stockChanged` / `updateStock` logic for edit mode is correct — leave it alone.
- After a successful create with `trackStock: true`, give the user a way to finish the job. Either a toast action or an inline banner, linking to Verify Opening Count for the new product. The product id comes back from `create.mutateAsync`. This step is the difference between "I ticked the box and nothing happened" and a completed workflow — do not skip it.

### A6 · Tests

- `products.validator.test.ts` — create accepts `trackStock` / `lowStockThreshold`; **rejects `stockQuantity`**; rejects a negative or non-integer threshold.
- `products.service.test.ts` or `products.routes.test.ts` — a product created with `trackStock: true` persists it and still has `stockQuantity === 0`; the conditional admin gate behaves as implemented.
- An inventory-side assertion that such a product reports `onboardingStatus: 'PENDING_ONBOARDING'` and that a stock movement against it is still refused.
- `products.components.test.tsx` — the Add form renders the stock section; toggling Track stock enables the threshold and shows the note; edit mode is unchanged.

---

## Bug B — scanner → sales order prefill

### B1 · `frontend/src/features/products/components/ProductPicker.tsx` — the actual bug

`CatalogProductPicker` resolves its selection like this (lines 39-41):

```ts
const selected = selectedProduct?.id === props.selectedProductId
  ? selectedProduct                                                  // null on mount
  : products.find((p) => p.id === props.selectedProductId) ?? null;   // first 10 by name
```

`products` is the **default unfiltered search page**. A scanned product is almost never in it, so `selected` is `null` and the green confirmation card at line 49 never renders.

Add a third resolution step: when `selectedProductId` is set but resolves to nothing locally, fetch it with `useProduct(needsHydration ? props.selectedProductId : '')`. The hook is already `enabled`-gated on a non-empty id, so it costs nothing when not needed.

Resolution order must be: **local state → current search page → fetched by id.**

Render a loading row while the fetch is in flight and a retry affordance if it fails — a silent empty box is the bug you are fixing.

Two things not to break:
- `LegacyProductPicker` wraps `CatalogProductPicker` for the service-job flow. It must keep working.
- `OpeningCountProductResult` already calls `useProductInventory` per visible row. Your hydration must be **one** fetch for the selected product, not a per-row fetch.

A hydrated product may be archived, since the picker searches `isActive: true`. That is an acceptable edge case — Make Order is already disabled for archived products at the scanner preview (`ProductPreviewPanel.tsx:141`).

### B2 · `frontend/src/features/sales-orders/components/ProductLinePicker.tsx`

Local `const [product, setProduct] = useState<Product | null>(null)` (line 17) is cold for a prefilled line, so the "In stock: N" badge never renders. Take the badge's product from the picker's resolved selection instead of this local state.

### B3 · `frontend/src/features/sales-orders/components/CreateSalesOrderDialog.tsx`

The prefill effect (lines 47-53) is correct — leave the `appliedPrefillId` ref logic intact. Change one thing: when a prefill is present, open at **step 3 (Items)** rather than `setStep(0)`, so the scanned product is the first thing on screen. With no prefill, the dialog still opens at step 0. Back must still walk to Payment / Customer / Channel.

### B4 · `frontend/src/pages/sales-orders/SalesOrdersPage.tsx` and `frontend/src/pages/scanner/ScannerHubPage.tsx`

Route state is cleared on mount with `navigate(…, { state: null })`, so a hard refresh loses the prefill silently. Move the handoff to a query param:

```
/sales-orders?action=add&productId=<uuid>
```

`action=add` is already read at `SalesOrdersPage.tsx:29`, so this is a small extension. Read `productId` from the query string **first**, route state **second**. Strip the param after applying it, exactly as the page already does for route state.

**Keep `salesOrderPrefillFromRouteState` and `scannerOrderRouteState` exported and working.** `sales-orders.page.test.ts` and `scanner-hub.page.test.tsx:107-108` assert their exact shape, including `Object.keys(state)`. Route state stays a supported fallback; you are adding a path, not replacing one.

### B5 · Tests

- `ProductPicker.search.test.tsx` — a `selectedProductId` absent from the search results is hydrated and its summary card renders; loading and error states render.
- `sales-orders.components.test.tsx` — a prefilled dialog opens at step 3 and shows the product; an unprefilled one opens at step 0 with an empty line.
- `sales-orders.page.test.ts` — query-param prefill is read, applied, and stripped; existing route-state tests still pass.
- `scanner-hub.page.test.tsx` — Make Order navigates to the query-param URL.

---

## Definition of done

- `npm test` green across backend and frontend. No existing test edited to accommodate a change.
- TypeScript clean.
- No migration, no version bump, no installer, nothing committed.
- Manual verification, stated explicitly in your summary:
  1. Add a product with Track stock on → it saves tracked, quantity 0, and offers the opening-count follow-through.
  2. That product reports "needs a verified opening count" and refuses stock actions until verified.
  3. Barcode scan → Make Order → the product is **visible on screen** without searching, quantity 1.
  4. SKU scan → same.
  5. Hard refresh on the prefilled URL → still prefilled.
  6. Manual "Add Order" with no prefill → step 0, one empty line, unchanged.

## In your final response

1. Files changed, grouped by bug.
2. Which permission model you implemented for `trackStock` at create (§A2), and why.
3. Anything in the plan's diagnosis you found to be wrong.
4. Test results, verbatim — including any failure.
5. Confirmation: no migration, no version bump, no installer, nothing staged or committed, business database untouched, brand SQL not executed.
