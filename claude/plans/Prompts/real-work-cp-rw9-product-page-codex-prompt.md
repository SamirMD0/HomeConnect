# Codex Implementation Prompt — CP-RW9 / Product Page v2

Copy everything below the line into Codex.

---

You are finishing the product catalogue upgrade in the **HomeConnect** repository (React 19 + TypeScript + Tailwind v4 frontend, Express + Prisma 5.22 + PostgreSQL backend, Electron desktop shell).

A first pass of CP-RW9 has **already landed in the working tree**. Your job is to finish it: write the missing tests for what shipped, then build the four pieces that were scoped but not started. **Read §2 carefully — re-implementing work that already exists is the main way this task goes wrong.**

## Where this sits

| Checkpoint | State |
|---|---|
| CP-RW2 … CP-RW7 | ✅ In tree, uncommitted |
| CP-RW8A — release freeze audit | ✅ Complete |
| CP-RW8B — brand duplicate cleanup | ⛔ Separate task, do not touch |
| **CP-RW9 — product page v2** | 🔨 **You are here** — first pass landed, finishing it |

Source of truth for the release: `claude/plans/real-work-v2.0.0-release-plan.md`.

The tree is **dirty by design** — ~90 modified and untracked files from RW2–RW8 plus the CP-RW9 first pass, all uncommitted. This was an explicit decision by the repository owner. Do not clean, stash, reset, or commit anything.

---

## 1 · Verified baseline — this is green right now

**Run every command in this prompt from the repository root.** The repo path contains a space (`.../Documents/Home Connect`); prefer the `npm run …` scripts over hand-rolled tool invocations, because npm sets the working directory to the package root for you and relative paths then always resolve.

Before you change anything, confirm you are starting from this state:

```bash
npm run typecheck
#   -> clean, both projects, no output beyond the two script banners

npx vitest run frontend/src/features/products backend/src/features/service/products
#   -> Test Files 22 passed (22) | Tests 245 passed (245)

npm run lint
#   -> ✖ 89 problems (0 errors, 89 warnings)  — exit code 0
```

On `npm run lint`: **the 89 warnings are pre-existing and are not yours to fix.** They are `no-explicit-any` and `no-unused-vars` scattered across `services/`, `pages/Setup.tsx`, and others untouched by this work. The number that matters is **0 errors**, and the exit code must be 0. Do not treat the warning count as a mismatch, and do not "clean them up" — that is unrelated churn in a frozen release.

**If the code state is not what is described above, stop and report it** — something changed underneath this prompt.

If instead a *command itself* fails to run (tool not found, no files matched, wrong directory), that is a tooling problem, not a code-state problem: say so explicitly, confirm you are at the repository root, and re-run. Report it either way, but do not conclude the tree is broken because a command was invoked wrongly.

---

## 2 · Already done — DO NOT REBUILD

### Backend — stock-status filtering (read-only, no schema change)

`backend/src/features/service/products/product-stock.ts`
- `PRODUCT_STOCK_FILTERS` — `['IN_STOCK','LOW_STOCK','OUT_OF_STOCK','NOT_TRACKED','NOT_IN_INVENTORY']`
- `ProductStockFilter` type
- `isProductOutsideInventory({ trackStock, stockQuantity, movementCount })`

`backend/src/features/service/products/products.validator.ts`
- `productListQuerySchema.stockStatus` — `z.enum(PRODUCT_STOCK_FILTERS).optional()`
- `sortBy` enum gained `'stock'`

`backend/src/features/service/products/products.repository.ts`
- `productListInclude` (internal) — `productActorInclude` plus `_count: { select: { stockMovements: true } }`
- `ProductListRow` — exported payload type
- `productStockStatusWhere(status)` — exported; `LOW_STOCK` / `IN_STOCK` use **Prisma field references** (`prisma.product.fields.lowStockThreshold`), not raw SQL
- `productSortColumn` (internal) — maps `'stock'` → `'stockQuantity'`
- `list()` accepts `stockStatus`, applies the where fragment, uses `productListInclude`

`backend/src/features/service/products/products.service.ts`
- `list()` passes `query.stockStatus` through and adds `notInInventory` to each item via `isProductOutsideInventory`

**The where clauses mirror `deriveProductStockStatus` and the `/inventory/summary` SQL exactly. That correspondence is the whole point of the feature — a filter must never return a row whose badge says something else. Do not "simplify" it.**

### Frontend — shipped in the first pass

| File | What landed |
|---|---|
| `features/products/types/product.types.ts` | `notInInventory?`, `ProductStockFilter`, `ProductFilterPatch`, `stockStatus` on `ProductFilters`, `'stock'` in `ProductSortBy` |
| `features/products/hooks/useProducts.ts` | `isRefreshableProductQuery` + internal `refreshProducts` — **every** mutation now invalidates by predicate instead of the `['products']` prefix, so editing one product no longer re-downloads every visible image blob |
| `features/products/components/ProductFilters.tsx` | Full toolbar rewrite. Exports `productBrandFilterPatch`, `productFilterResetPatch`, `hasActiveProductFilters`, `PRODUCT_SORT_OPTIONS`, `productSortValue`, `productSortPatch`, `PRODUCT_STOCK_FILTER_OPTIONS` |
| `features/products/components/ProductStats.tsx` | **NEW.** Four tiles from `/inventory/summary` + list total. Exports `productStockStatPatch`, `productTrackedStatPatch` |
| `features/products/components/ProductIdentity.tsx` | **NEW.** Shared identity block. Exports `ProductIdentity`, `ProductNotInInventoryChip`, `ProductPricingModeChip` |
| `features/products/components/ProductCard.tsx` | Density rework; installment `<dl>` collapsed to one line; uses `ProductIdentity` |
| `features/products/components/ProductsTable.tsx` | Pricing-formula column folded into the price cell as a caption (9 → 8 columns, `min-w-250` → `min-w-225`); uses `ProductIdentity` |
| `features/products/components/ProductGrid.tsx` | Skeleton reshaped to match the new card |
| `features/products/components/ProductDetailsDrawer.tsx` | Focus trap / focus restore / body scroll lock; **Make Order** action; stock tracking + low-stock threshold in the Info section |
| `pages/products/ProductsPage.tsx` | `PageHeader`, `ProductStats`, `EmptyState` (3 variants), `SkeletonTable`, error+retry, reset, URL-backed `stockStatus`/`trackStock`/`pageSize`. Exports `ProductsEmptyState`, `resolveProductPageSize` |
| `hooks/useDialogFocus.ts` | **NEW** shared hook — focus into panel, Tab cycle, focus restore, scroll lock. Escape is left to the caller |
| `features/products/utils/product-labels.ts` | ~18 new bilingual labels |

### Tests already updated

- `products.components.test.tsx` — `testElements` now expands function components (via `expandComponent`, try/catch for hook-using components); card snapshot regenerated
- `brands.test.tsx` — the brand-normalize cache assertion now checks the **predicate** (lists/brands/details invalidate, image blobs do not)
- `product-stock.test.ts` — `PRODUCT_STOCK_FILTERS` shape, `isProductOutsideInventory` truth table

---

## 3 · Non-negotiable rules

1. **No migration.** No change to `backend/prisma/schema.prisma`. The stock filter works on existing columns by design.
2. **No financial logic.** Pricing calculation, money maths, installment maths, `ProductFormPricingPanel`, `ProductPricingSection`, `PricingPreviewCard`, `financial/domain/money` — read them, never edit them.
3. **No inventory movement logic.** Stock quantity changes only through `StockMovement`. The opening-count guard, `VerifyOpeningCountDialog`, `ProductInventoryPanel`, and everything in `backend/src/features/inventory/` that writes are out of scope.
4. **Do not weaken any audit rule.** Archive/restore keep the typed reason + admin password. Pricing edits keep the reason + password. SKU and stock settings stay admin-role with a server-generated reason.
5. **No new dependencies.** `lucide-react`, `@tanstack/react-query`, `zod`, `react-hot-toast`, `framer-motion`, `tailwind-merge`, `clsx` are all present.
6. **Use the existing design system.** `frontend/src/components/ui/index.ts` says it plainly: *"prefer a primitive over inline Tailwind."* Use `Button`, `IconButton`, `Card`, `Badge`, `Select`, `Input`, `Textarea`, `FormField`, `Skeleton`, `EmptyState`, `PageHeader`, `SectionHeader`, `Modal`. Colours come from `brand-*` tokens (`frontend/src/styles/index.css` — the brand scale *is* emerald, so this is a token change, not a visual one).
7. **Bilingual labels** in the existing `English / العربية` style. App layout stays LTR. User-entered text keeps `dir="auto"` and the `.user-text` / `.user-text-input` classes. Never put `dir="rtl"` on a container — only on an Arabic-only span (see `BilingualLabel.tsx` for why).
8. **Accessibility is not optional.** Every clickable region is a real `<button>` / `<Link>` with an accessible name. No nested interactive elements. Focus states must be visible.
9. **Do not bump the version** (stays `1.9.6`), **do not build an installer**, **do not stage, commit, or push**, **do not touch the business PC database**.
10. **Do not touch CP-RW8B territory**: `BrandFixDialog.tsx`, `pages/products/BrandsPage.tsx`, `products.normalize.*`, `backend/prisma/data-fixes/`.

---

## 4 · Work item A — backend tests for the stock filter

The code shipped without tests. Write them.

### A1 · `products.repository.test.ts` — `productStockStatusWhere`

Add a `describe` block. For each of the five filters, assert the returned `Prisma.ProductWhereInput` shape:

| Filter | Must produce |
|---|---|
| `NOT_TRACKED` | `{ trackStock: false }` |
| `OUT_OF_STOCK` | `{ trackStock: true, stockQuantity: 0 }` |
| `LOW_STOCK` | `trackStock: true`, `lowStockThreshold: { not: null }`, `stockQuantity: { gt: 0, lte: <field ref> }` |
| `IN_STOCK` | `trackStock: true`, `stockQuantity: { gt: 0 }`, `OR: [{ lowStockThreshold: null }, { stockQuantity: { gt: <field ref> } }]` |
| `NOT_IN_INVENTORY` | `{ trackStock: false, stockQuantity: 0, stockMovements: { none: {} } }` |

The file already mocks `../../../lib/prisma`; extend the mock so `prisma.product.fields.lowStockThreshold` resolves to a sentinel you can assert on.

**Add a correspondence test.** For a table of `{ trackStock, stockQuantity, lowStockThreshold }` rows, assert that `deriveProductStockStatus(row) === X` implies the row satisfies `productStockStatusWhere(X)` and no other filter — evaluated by a small local predicate helper in the test, not by hitting a database. This is the test that stops the badge and the filter from drifting apart. Include the boundaries: `qty === threshold` (LOW), `qty === threshold + 1` (IN), `qty === 0` with a threshold set (OUT, not LOW), and `threshold === null` with `qty > 0` (IN).

### A2 · `products.repository.test.ts` — `list()` wiring

- `stockStatus` reaches the `where` passed to both `prisma.product.count` and `prisma.product.findMany`
- `sortBy: 'stock'` produces `orderBy: [{ stockQuantity: <order> }, { id: 'asc' }]`
- every other `sortBy` still orders by its own column name
- `stockStatus` combines with `search` (both the id-list filter and the stock fragment present) rather than replacing it
- the exact-match hoist still works with a stock filter applied

### A3 · `products.validator.test.ts`

- `productListQuerySchema` accepts each of the five `stockStatus` values
- rejects an unknown one (e.g. `PENDING_ONBOARDING`, which is deliberately **not** a catalogue filter)
- accepts `sortBy: 'stock'`
- `stockStatus` is optional and absent when not supplied

### A4 · `products.service.test.ts`

- `list()` sets `notInInventory: true` for a row with `_count.stockMovements === 0`, `trackStock: false`, `stockQuantity: 0`
- sets `false` when any one of those three does not hold
- `notInInventory` is **absent** from the single-product `get()` response (the drawer reads the fuller onboarding status from the inventory endpoint — do not add it there)

### A5 · `products.routes.test.ts`

- `GET /products?stockStatus=LOW_STOCK` returns 200 and the query reaches the service
- `GET /products?stockStatus=NONSENSE` returns 400

---

## 5 · Work item B — frontend tests for the first pass

Follow the existing style in `products.components.test.tsx`: `renderToStaticMarkup` for markup, direct component invocation + `testElements` for interaction, plain calls for pure helpers. Put new page-level tests in a **new file** `frontend/src/features/products/product-catalogue.test.tsx` rather than growing the 500-line component test further.

### B1 · Toolbar helpers (pure)

- `hasActiveProductFilters` — false for `{}` + empty search; true for each of search / brand / hasBarcode / trackStock / stockStatus / non-default sort; **false** for the explicit defaults `sortBy: 'name'`, `sortOrder: 'asc'`
- `productFilterResetPatch` — every toolbar key present and `undefined`; `isActive` and `view` **absent** (resetting must not throw away the archived tab or the table/grid choice)
- `productSortValue` — round-trips each option; falls back to `'name:asc'` for an unknown pair
- `productSortPatch` — returns the matching `sortBy`/`sortOrder` and always `page: 1`
- `productBrandFilterPatch` — unchanged behaviour (already covered in `brands.test.tsx`, do not duplicate)

### B2 · Toolbar render

- renders the search box, brand select, stock-status select, sort select
- the clear (✕) button appears only when `search` is non-empty, and calls `onSearchChange('')`
- the spinner renders only when `isFetching`
- **Reset** renders only when `hasActiveProductFilters` is true, and calls `onReset`
- the result count renders `N products` and is inside an `aria-live="polite"` region
- **More filters** toggles the advanced row (`aria-expanded`, `aria-controls`); the advanced row starts open when `hasBarcode` or `trackStock` is already set
- the advanced row exposes barcode, tracking, and page size
- every select has an accessible name
- the search input carries **no** `autoFocus` — the page owns focus (`ProductsPage` focuses it when no dialog is open, and the scanner-mode key handler refocuses it). Two owners is the bug this replaced.

### B3 · `ProductStats`

- `productStockStatPatch` — applies the status when different; **clears it when already applied** (tiles toggle); always clears `trackStock` and sets `page: 1`
- `productTrackedStatPatch` — same toggle behaviour, clears `stockStatus`
- the applied tile renders `aria-pressed="true"`
- the "Showing" tile is a `<div>`, not a button (it is not a filter)
- tiles render a `Skeleton` while the summary query is loading

### B4 · Page states

- `resolveProductPageSize` — `'25'|'50'|'100'` pass through; `null`, `''`, `'7'`, `'999'`, `'abc'` all fall back to `25` (a hand-edited URL must not become a 400 against the backend's cap of 100)
- `ProductsEmptyState` — three distinct renders:
  - filters active → "No products match these filters" + a **Reset filters** button wired to `onReset`
  - no filters, active tab → "No products yet" + an **Add Product** button wired to `onAdd`
  - no filters, archived tab → "Nothing archived", **no** action button
- table loading renders a `SkeletonTable`, grid loading renders `ProductGridSkeleton` (the old table branch was a bare text line)
- the error branch renders `role="alert"` and a retry button

### B5 · `ProductIdentity` and the not-in-inventory chip

- brand renders on its own line, uppercase, **only when present**
- name is a `<button>` that calls `onView`
- model renders on its own line
- SKU and barcode share one monospace line; the barcode separator is absent when there is no barcode
- `ProductNotInInventoryChip` renders **only** when `product.notInInventory === true` — nothing for `false` and nothing for `undefined` (the single-product read never sets it)

### B6 · Drawer

- the action row contains a **Make Order** link pointing at `salesOrderCreateUrl(product.id)` — assert the same URL string the scanner uses; there must remain exactly **one** definition of that URL in the codebase
- the Info section shows stock tracking and the low-stock threshold, and shows `—` for the threshold when tracking is off
- the existing "anchors Inventory to Stock" test still passes

### B7 · `useDialogFocus` — refactor for testability, do not add a DOM

**There is no DOM test environment in this repository.** `vitest.config.ts` sets no `environment`, so everything runs in `node`; `jsdom` and `happy-dom` are not installed and `@testing-library/*` is not used anywhere. Every existing test is either a pure-function call or `renderToStaticMarkup`. Adding jsdom would be a new dependency plus a config change — **rule 5 forbids it, and this is not the task to change that on.**

So do not write a DOM test. Instead make the part worth testing pure:

Extract the Tab-wrap decision out of the hook into an exported pure function alongside it, roughly:

```ts
export function nextDialogFocusIndex(
  input: { count: number; activeIndex: number; shiftKey: boolean; activeInsidePanel: boolean }
): number | null   // index to focus, or null to let the browser handle it
```

`useDialogFocus` then does DOM work only: collect focusables, find the active index, call the pure function, and `preventDefault()` + `focus()` when it returns an index. Behaviour must not change.

Test the pure function:

- forward Tab from the last index wraps to `0`
- Shift+Tab from index `0` wraps to the last
- Tab from the middle returns `null` (the browser already does the right thing)
- focus outside the panel returns `0` regardless of direction
- `count === 0` returns `null`

Leave the DOM wiring untested and say so in your report — that matches `Modal.tsx`, which carries the same logic untested today. **If you think the DOM behaviour genuinely needs coverage, say so in the report as a recommendation with the cost (jsdom + config); do not act on it.**

---

## 6 · Work item C — product form UX (NOT STARTED)

`frontend/src/features/products/components/ProductFormDialog.tsx` (452 lines) is the last unimproved surface. It works and is well tested — **this is a presentation and clarity pass, not a behaviour change.**

### C1 · Give it real sections

Today it is a flat stack: a heading, one `grid sm:grid-cols-2` of fields, then stock, specs, image, duplicates, pricing, and the reason/password box. Group it with `SectionHeader` into:

1. **Product identity / هوية المنتج** — SKU (read-only on edit), name, model, brand, barcode, label barcode source
2. **Inventory / المخزون** — the existing `ProductStockSection`, unchanged
3. **Image / الصورة** — the existing `ProductImageField`, unchanged
4. **Specifications / المواصفات** — the existing `ProductSpecificationsEditor`, unchanged
5. **Pricing / التسعير** — admin only, the existing `ProductFormPricingPanel`, unchanged

Notes move to the end of section 1. The duplicate warning stays directly above the submit row where it currently is — it is a last-chance check and must not scroll out of view above the fold.

### C2 · Replace the local `Field` with the shared primitives

The local `Field` component (line ~254) reimplements `FormField` + `Input` + `Textarea`. Switch to the shared ones. Two things it currently does that you must preserve:

- the `feedback` slot below the control (used by `ProductDuplicateInlineError` on barcode)
- `.user-text-input` on free-text inputs, and **not** on barcode (bidi reordering can split a code — this is why `dir="ltr"` is set on barcode today)

### C3 · Required fields

Today required-ness is a literal `*` concatenated into the label string (`` `${businessLabels.product.name} *` ``). Make it a proper `required` prop on `FormField` with a consistent marker and `aria-required`, and mark: name, model, and — when tracked — nothing extra (quantity is not a form field, by design). In the pricing-reason box, reason and account password are required only when pricing actually changed; keep that conditional.

### C4 · Validation messages

- Field errors already render under their control — keep that, add `aria-invalid` and `aria-describedby` wiring.
- The "no changes" case currently surfaces as a red server-error banner (`'No product changes were entered / لم يتم إدخال أي تعديل'`). It is not an error — render it as a neutral/info note.
- `firstUnrenderedProductFieldError` exists so a server error on a field the current role cannot see is not swallowed. Do not break it — if you move a field between sections, update `renderedProductFields` to match, and add a test.

### C5 · Opening-count help text

`ProductStockSection` already warns at create time and the post-create toast offers "Verify opening count now". Do not change that flow. Add one clarifying line in edit mode explaining that switching tracking **on** for an existing product will require an opening count before stock actions — today the operator only learns this after saving.

**Preserve exactly:** the create-then-upload image ordering, `changedInput` diffing, the pricing reason + password gate, the employee notes-only restriction, blocking submit on a taken barcode, and every existing test in `products.components.test.tsx`.

---

## 7 · Work item D — duplicate and brand awareness gaps

### D1 · Brands cleanup link

`BrandCombobox` shows a "Did you mean *X*?" hint when the typed brand differs only by case/whitespace from a known one. When `useProductBrands()` reports the chosen brand's summary has **more than one spelling** (`brand.spellings.length > 1`), add a quiet inline link to `/products/brands` — wording along the lines of *"This brand has N spellings — Fix in Brands / لهذه الماركة عدة تهجئات"*.

**Do not implement merging here.** That is CP-RW8B. This is a link and a count, nothing more.

### D2 · Model-only duplicate awareness — INVESTIGATE, DO NOT BUILD

The original brief asked for a warning while typing **model**. Current backend behaviour (`ProductsRepository.findDuplicates`) supports:

- `SAME_NAME_MODEL` — name + model
- `SAME_MODEL_BRAND` — model + brand
- `BARCODE_TAKEN`, `SKU_TAKEN` — blocking

and `productDuplicateQuerySchema` requires *(name **and** model)*, or barcode, or SKU. So a model typed on its own never queries.

Work out what a model-only check would cost — how many rows a bare model matches in a 400+ product catalogue, whether it would be noise, and what the query would look like. **Report your finding. Do not change the backend for it without explicit approval.**

---

## 8 · Work item E — token consistency sweep

`brand-*` and `emerald-*` are the same colour scale (`frontend/src/styles/index.css` lines 14–23). `ProductCard`, `ProductsTable`, `ProductGrid`, and `ProductsPage` were converted in the first pass; these still use raw emerald:

```
features/products/components/BrandCombobox.tsx            (1)
features/products/components/ProductBulkActionsBar.tsx    (4)
features/products/components/ProductDetailsDrawer.tsx     (5)
features/products/components/ProductFormDialog.tsx        (2)
features/products/components/ProductFormPricingPanel.tsx  (1)
features/products/components/ProductOverflowMenu.tsx      (1)
features/products/components/ProductPicker.tsx            (5)
features/products/components/ProductPreviewPanel.tsx      (2)
features/products/components/ProductPricingSection.tsx    (1)
features/products/components/ProductRestoreDialog.tsx     (1)
features/products/components/ProductSearchInput.tsx       (1)
features/products/components/ProductSkuEditDialog.tsx     (1)
features/products/components/ProductSpecificationsEditor.tsx (1)
pages/products/ProductLabelPage.tsx                       (1)
pages/products/ProductLabelsPage.tsx                      (1)
```

Convert **class names only**. Three carve-outs:

- **`ProductStockBadge.tsx` and `ProductStatusBadge.tsx` — leave alone.** Their emerald means "in stock" and "active" — a status signal, not brand identity. Recolouring them would fold a semantic colour into the brand colour and make the two indistinguishable in intent, even though they render the same hex today. If the brand scale is ever retuned, these must not move with it.
- **`BrandsPage.tsx` and `BrandFixDialog.tsx` — leave alone.** CP-RW8B owns those files.
- **`ProductPicker.search.test.tsx`** is a test asserting on class strings; update it only if a file it covers actually changes.

Zero visual change is the acceptance criterion. `ProductLabel*` files print to paper — verify the label snapshot tests still pass, and if a label uses emerald deliberately for print, leave it and say so.

---

## 9 · Work item F — drawer polish

`ProductDetailsDrawer.tsx` is `max-w-xl` at every size.

- Widen on large screens (`lg:max-w-2xl xl:max-w-3xl` or similar) — nine sections in a 36rem column is a lot of scrolling on a desk monitor.
- Give the missing-value cases real empty states rather than a bare `—`: no image (the image block is simply omitted today — show a placeholder), no barcode, no brand, no model. `ProductImagePlaceholder` already exists in `ProductImageView.tsx`.
- The backdrop is currently a full-screen `<button aria-label="Close product details">`. It works, but a screen reader announces a page-sized button. Consider matching `Modal.tsx`, which uses a plain `<div>` with an `onClick` that compares `event.target` to the overlay ref. Keep a keyboard route to close (the header ✕ and Escape both already exist).

---

## 10 · What NOT to do

- Do not add a `Brand` table, `brandId`, or any migration. Deferred by decision — see §9 of the release plan.
- Do not add `PENDING_ONBOARDING` to the catalogue stock filter. It belongs to the onboarding worklist (`/inventory/onboarding/pending`), and adding it here would need a per-row opening-balance lookup on every list request.
- Do not add `notInInventory` to the single-product read.
- Do not virtualise the list. Pagination is server-side with a 100-row cap; 400 products across 25-row pages needs no windowing.
- Do not restructure `ProductsPage`'s scanner integration (`useScannerEvents`, `useScannerLookup`, `shouldRefocusScanInput`, scanner mode). It is CP-RW2 work in daily use.
- Do not change the `/sales-orders?action=add&productId=…` URL string.
- Do not blanket-run `vitest -u`. Snapshots may legitimately change in §6 — review each diff and say in your summary what changed and why.

---

## 11 · Validation

Run before you start:

```bash
git status --short
```

Run when you finish — all must pass:

```bash
npm run typecheck
npx vitest run frontend/src/features/products         # incl. your new product-catalogue.test.tsx
npx vitest run backend/src/features/service/products
npx vitest run frontend/src/features/inventory        # form and drawer touch inventory components
npx vitest run frontend/src/pages/scanner             # scanner shares ProductPreviewPanel and the order URL
npm run lint                                          # must stay 0 errors; 89 pre-existing warnings are fine
npm test                                              # full suite, if practical
git diff --check                                      # no whitespace errors
```

Note: there are **no** test files under `frontend/src/pages/products/`, and vitest exits non-zero when a path matches nothing. Page-level tests for `ProductsPage` go in `frontend/src/features/products/product-catalogue.test.tsx` (§5, B4), importing the page's exported helpers — that is the pattern the existing `productFocusSearchParams` test already follows from `products.components.test.tsx`.

Confirm at the end: **no version bump** (`package.json` stays `1.9.6`), **no installer**, **nothing staged or committed**, **no migration**, **no business database touched**.

---

## 12 · Report format

1. Baseline `git status --short` and whether §1 was green as described.
2. Files changed, grouped by work item (A–F).
3. Backend tests added and what each one guards.
4. Frontend tests added and what each one guards.
5. Form changes — what moved, what you deliberately left alone.
6. Brand link behaviour, and your **finding** on model-only duplicate detection (with numbers, not a guess).
7. Token sweep — files converted, and any you skipped with the reason.
8. Drawer changes.
9. Every command from §11 with its actual output. Paste failures verbatim; do not summarise them as "passing".
10. Any snapshot you regenerated, with what changed and why it is correct.
11. Anything you chose **not** to do, and why.
12. Confirmation of the §11 closing checklist.

If any instruction here contradicts what you find in the code, **stop and report the contradiction** rather than guessing which one is right. The first pass of this work was written against the tree as it stood on 2026-08-22; if something has moved since, say so.
