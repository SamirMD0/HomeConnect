> # ⛔ CLOSED RECORD — DO NOT PLAN FROM THIS FILE
>
> **Archived 2026-08-22.** This document did its job: it diagnosed the six real-work
> issues, sized them against measured data, and drove CP-RW2 through CP-RW7 to
> completion. It is kept as the **historical record and evidence trail**, not as a
> live plan.
>
> **The live plan is [`../real-work-v2.0.0-release-plan.md`](../real-work-v2.0.0-release-plan.md).**
> Go there for current state and remaining work.
>
> **What in here is now out of date:**
>
> - **The four-release schedule in §5** (v1.9.7 → v1.10.0) **never happened.** Not one
>   of those versions was cut. RW2–RW7 all landed in a single uncommitted working
>   tree, and the installed version is still `1.9.6`. Everything now ships once, as
>   **`v2.0.0`**.
> - **§4, §7, §8, §9, §11 describe work that is now built.** They are design rationale,
>   not a to-do list.
> - **§10 stage 1 shipped, but read-only.** The Brands page detects duplicate spellings
>   and cannot fix them — the single open blocker. Its replacement design lives in the
>   live plan as **CP-RW8B**.
> - **§15 open decisions #7 and #8 are closed** (see below). #2 — the 100-row batch cap
>   — was accepted as-is.
>
> **What is still authoritative here, and worth reading:**
>
> - **§1 "Verified catalogue figures"** — the measured 404/308/309/zero numbers taken
>   from a local scratch restore of the 2026-08-21 backup. Still the best evidence in
>   the project about the real shape of the catalogue.
> - **§2** — root-cause diagnoses with file and line references, all confirmed against
>   the code.
> - **§12 safety rules** — carried forward verbatim into the live plan and still binding.
> - **The CP-RW8 audit section** at the end — the evidence behind the release freeze.

---

# Real-Work Bugfix Plan — Product, Inventory & Scanner Workflows

**Status:** Planning / review checkpoint only. No code implemented, no migration created, no version bump, no installer, no commit, no business database touched.
**Baseline:** `package.json` version **1.9.6** (`bf43347`).
**Date:** 2026-08-21 — after 3 days of real business use.
**Revised:** 2026-08-21 — catalogue figures replaced with measured values from a local scratch restore of `homeconnect-2026-08-21-151618-manual.backup` (backup unmodified, business database untouched, scratch database dropped). Open decisions **#7 and #8 are closed**; a verified-but-unexecuted brand cleanup script is recorded in §10, stage 0.

---

## 1. Real-work issue summary

| # | Reported issue | Confirmed? | Severity | Migration needed |
|---|---|---|---|---|
| 1 | Add Product cannot enable stock tracking | **Confirmed — by construction, all four layers** | P0 blocker | No |
| 2 | Scanner Hub → Make Order does not prefill the product | **Confirmed — display/hydration bug, state is actually passed** | P0 blocker | No |
| 3 | 500+ untracked products, onboarding is one-at-a-time | **Confirmed — measured at 308 untracked / 309 without an opening balance. Plus a second defect: the Untracked tab can only ever show 100 rows** | P1 | No |
| 4 | Product page UX: image not clickable, actions hidden | **Confirmed** | P2 | No |
| 5 | Brands typed free-hand, duplicates accumulate | **Confirmed — `Product.brand` is a free-text `String?`, no Brand model. Measured: 205 spellings for 179 real brands; 20 brands have 2–3 spellings each** | P3 | No (v1) |
| 6 | No live barcode/model/SKU duplicate detection | **Confirmed — only name+model+brand, on blur, create-mode only** | P2 | No |

The single most important structural finding: **issue 1 is the cause of issue 3.** Every product ever created through the Add Product form was written with `trackStock = false`, because the create path has never had a stock field at any layer. The backlog is not stale imported data — it is the catalogue growing through a form that cannot express inventory intent.

Second structural finding: **nothing in this plan requires a database migration.** Every fix uses existing tables, existing columns, and existing audit paths. That keeps the whole sequence low-risk for the business PC.

### Verified catalogue figures

Measured on 2026-08-21 by restoring `homeconnect-2026-08-21-151618-manual.backup` into a local scratch database (since dropped). **The business database was never touched, and the backup file was not modified.** These replace the earlier ~500 estimate throughout this document.

| Measure | Value |
|---|---|
| Total products | **404** (375 active · 29 archived) |
| Tracked (`trackStock = true`) | **96** |
| Untracked (`trackStock = false`) | **308** |
| Products with **no** `OPENING_BALANCE` movement | **309** — 280 active, 29 archived |
| Products **with** an opening balance | 95 |
| Untracked products with `stockQuantity > 0` | **0** |
| Onboarding backlog at 100/batch | **~3 batches** (4 including archived) |
| `stock_movements` rows | 114 — 95 `OPENING_BALANCE`, 17 `PURCHASE_RECEIPT`, 1 `MANUAL_ADD`, 1 `MANUAL_REMOVE` |
| Products with a brand | 402 of 404 |
| Distinct brand strings | **205** → **179** once case variants are merged |

The backlog is roughly 40% smaller than assumed, and the **zero** in that table is the load-bearing number: no untracked product carries a stray quantity, so batch onboarding has no legacy quantities to reconcile, migrate, or second-guess. It starts from a clean zero everywhere. This closes open decisions #7 and #8 (§15).

---

## 2. Exact current behaviour found

### A. Add Product stock tracking

The stock section is gated on edit mode:

```tsx
// frontend/src/features/products/components/ProductFormDialog.tsx:193
{product && <><ProductStockSection value={stock} onChange={setStock} />…</>}
```

`product` is `null` when adding. **In Add Product there is no track-stock control on screen at all** — not a disabled one, not a stuck one. The `stock` state exists ([ProductFormDialog.tsx:43](frontend/src/features/products/components/ProductFormDialog.tsx#L43)) and is initialised to `{ trackStock: false, stockQuantity: 0, lowStockThreshold: null }`, but it is never rendered and never sent.

The same absence repeats down the stack:

- **Types** — `CreateProductInput` ([product.types.ts:127-139](frontend/src/features/products/types/product.types.ts#L127-L139)) has no `trackStock` / `lowStockThreshold`.
- **Payload builder** — `toCreateInput` ([ProductFormDialog.tsx:247](frontend/src/features/products/components/ProductFormDialog.tsx#L247)) never reads `stock`.
- **Backend validator** — `createProductSchema` ([products.validator.ts:108](backend/src/features/service/products/products.validator.ts#L108)) is `.strict()` and lists no stock field. Sending one today would be a **400**, not a silent strip.
- **Backend service** — `ProductsService.create` ([products.service.ts:80-98](backend/src/features/service/products/products.service.ts#L80-L98)) never writes the columns.
- **Database** — Prisma defaults apply: `trackStock Boolean @default(false)`, `stockQuantity Int @default(0)`, `lowStockThreshold Int?` ([schema.prisma:701-703](backend/prisma/schema.prisma#L701-L703)).

**"The user can only change low-stock threshold"** describes what happens next, in the *edit* dialog. `ProductStockSection` renders current quantity as a read-only `<output>` and the threshold as the only editable number:

```tsx
// frontend/src/features/products/components/ProductStockSection.tsx:9-10
<output …>{value.stockQuantity}</output>   // read-only by design
<NumberField label="Low-stock threshold …" disabled={!value.trackStock} … />
```

The **Track stock** checkbox on line 7 *is* editable and *does* persist — `PATCH /products/:id/stock` → `ProductsService.updateStock` ([products.service.ts:410-432](backend/src/features/service/products/products.service.ts#L410-L432)). But that endpoint is settings-only, and says so in its own comment: *"this cannot write stockQuantity."* So after ticking the box the product sits at quantity 0 with every inventory action button disabled ([ProductInventoryPanel.tsx:32](frontend/src/features/inventory/components/ProductInventoryPanel.tsx#L32)) until an admin runs Verify Opening Count. From the counter it reads as "the toggle did nothing."

**Answers to the review questions:**

1. *Why stuck on 0/false?* Because create never sends or stores the fields; the DB default is `false`/`0`.
2. *Frontend state bug?* Partly — the control is not rendered in Add mode.
3. *Backend validator issue?* Yes — `.strict()` create schema has no stock fields, so a frontend-only fix would 400.
4. *Is create ignoring trackStock?* It never receives it.
5. *Is the UI intentionally preventing it because opening count is required?* **No.** The opening-count guard is real and correct, but it is a separate mechanism. `InventoryRepository.setVerifiedOpeningCount` already sets `trackStock: true` ([inventory.repository.ts:150-161](backend/src/features/inventory/inventory.repository.ts#L150-L161)), so the guard was never relying on create leaving the flag false. This is an omission, not a safeguard.
6. *Safest fix?* Option A below — carry the *intention* at create, keep the *quantity* behind opening-count verification.

### B. Scanner Hub → Sales Order prefill

The state chain is intact end to end. Every link works:

| Step | Location | Result |
|---|---|---|
| Make Order click | [ProductPreviewPanel.tsx:140](frontend/src/features/products/components/ProductPreviewPanel.tsx#L140) | `onMakeOrder(item.id)` ✅ |
| Navigate | [ScannerHubPage.tsx:155](frontend/src/pages/scanner/ScannerHubPage.tsx#L155) | `navigate('/sales-orders', { state: { prefillOrderProductId: id } })` ✅ |
| Page reads state | [SalesOrdersPage.tsx:27-37](frontend/src/pages/sales-orders/SalesOrdersPage.tsx#L27-L37) | sets prefill, opens dialog, clears state ✅ |
| Dialog fetches product | [CreateSalesOrderDialog.tsx:40,47-53](frontend/src/features/sales-orders/components/CreateSalesOrderDialog.tsx#L40) | `setItems([salesOrderLineFromPrefill(product)])`, quantity 1, unit price suggested ✅ |
| Line binds to picker | [ProductLinePicker.tsx:23](frontend/src/features/sales-orders/components/ProductLinePicker.tsx#L23) | `<ProductPicker selectedProductId={value.productId} …>` ✅ |
| **Picker renders selection** | [ProductPicker.tsx:35-52](frontend/src/features/products/components/ProductPicker.tsx#L35-L52) | ❌ **breaks here** |

The picker cannot resolve a product it did not select itself:

```tsx
// frontend/src/features/products/components/ProductPicker.tsx:36-41
const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
const search = useProductSearch({ isActive: true, sortBy: 'name', … limit: 10 });
const products = search.products.data?.items ?? [];
const selected = selectedProduct?.id === props.selectedProductId
  ? selectedProduct                                                   // null on mount
  : products.find((p) => p.id === props.selectedProductId) ?? null;   // first 10 A→Z
```

On mount `selectedProduct` is `null`, and the fallback searches only the **default first-ten-by-name page**. A scanned product is almost never in that page, so `selected` resolves to `null` and **the green confirmation card at line 49 never renders**. The picker looks byte-for-byte like an untouched search box.

The line data is genuinely there — two tells prove it: the manual name/model fields stay hidden (they render only `{!value.productId && …}`, lines 24-25) and the "Use manual product" button is present (line 29). But the user sees an empty search field, so they search again. This is a **hydration/display defect, not a state-passing defect**, which is why the existing route-state unit tests all pass.

Two aggravating factors:

- `ProductLinePicker`'s own `const [product, setProduct] = useState<Product | null>(null)` (line 17) is also cold, so the "In stock: N" badge on line 28 is missing for a prefilled line.
- The dialog opens at **step 0 (Payment)**; items are **step 3**. The user clicks Next three times before reaching the line, by which point the visual cue that a product was carried over is long gone.

**Route-state fragility (secondary):** `SalesOrdersPage` clears the state with `navigate(…, { replace: true, state: null })` on mount. A hard refresh, a back-navigation, or an Electron reload loses the prefill silently. It works today but it is not durable.

**Answers to the review questions:** 1. Yes, `productId` is passed correctly. 2. Yes, the page receives it. 3. Yes, the dialog consumes it and builds the line. 4. Route path is correct. 5. State is not lost by the dialog lifecycle. 6. **The picker cannot hydrate a selected product by id — this is the bug.** 7. Because the picker shows nothing, so the counter assumes nothing was carried.

### C. Inventory: the untracked backlog (measured: 308 untracked, 309 without an opening balance)

Current onboarding is strictly one product at a time:

Product drawer → Stock section → amber "needs a verified opening count" banner → **Verify Opening Count** (admin only) → dialog asking counted quantity + reason + note + **account password** ([VerifyOpeningCountDialog.tsx](frontend/src/features/inventory/components/VerifyOpeningCountDialog.tsx)) → `POST /products/:productId/opening-count` → `InventoryService.verifyOpeningCount` ([inventory.service.ts:51-105](backend/src/features/inventory/inventory.service.ts#L51-L105)), which inside one serializable transaction verifies the admin password, refuses if an opening balance already exists, sets `trackStock: true` + quantity, and writes one `OPENING_BALANCE` movement.

**309 products = 309 password entries.** At roughly 25 seconds per product that is over two hours of admin keyboard time, spread across 309 separate dialogs.

Measured state of those 309 (see the verified figures above): **308 are `NOT_IN_INVENTORY`** — untracked, zero quantity, no movements at all — and exactly **1 is `PENDING_ONBOARDING`**. None carries a non-zero quantity. So the backlog is uniform: 309 products that all start from a true zero, with no legacy quantities to reconcile.

**Second confirmed defect — the backlog is not even visible.** The Inventory page's Untracked tab filters client-side over one unpaginated page:

```tsx
// frontend/src/pages/inventory/InventoryPage.tsx:21,32
const products = useProducts({ search, pageSize: 100, sortBy: 'name' });
… (products.data?.items ?? []).filter((item) => … filter === 'UNTRACKED' ? !item.trackStock : true);
```

`productListQuerySchema` caps `pageSize` at 100 ([products.validator.ts:163](backend/src/features/service/products/products.validator.ts#L163)) and has **no `trackStock` filter**, and the page renders no pagination. So the Untracked tab shows at most 100 rows, always the same alphabetical first page. The user cannot enumerate the backlog today, let alone work through it.

**Answers to the review questions:**

1. *Why so many untracked?* Bug A — create has never set `trackStock`. Not stale imports. Measured: 308 of 404.
2. *Old products from before inventory?* Some, but the ongoing cause is the create path, so the backlog regrows daily until A is fixed.
3. *Fastest safe onboarding?* Batch verify-opening-count, design in §6.
4. *Multiple products from one screen?* Yes — no schema change needed; it is the same movement written N times in one transaction.
5. *CSV/import template?* Feasible, recommended **deferred** (see §6 and §15).
6. *"Mark selected as tracked with zero opening count" safely?* Yes. Zero is already a legitimate verified count — the existing dialog says so verbatim: *"Zero is valid for an empty shelf."* A zero opening balance still writes a real `OPENING_BALANCE` movement, so it is auditable, not silent.
7. *One password per batch, or per item?* **Per batch.** `verifyAdminPassword` ([admin-verification.ts:27](backend/src/lib/admin-verification.ts#L27)) does one bcrypt compare plus lockout bookkeeping per call. Calling it once for an atomic batch is the same security posture as one call for one atomic operation — the batch *is* the operation. Calling it 100× inside one transaction is slower and no safer.

**Useful existing foundations:**

- `InventoryRepository.stockIntegrity()` ([inventory.repository.ts:337-370](backend/src/features/inventory/inventory.repository.ts#L337-L370)) already computes `hasOpeningBalance` for every product in one raw query. This is the right basis for an onboarding worklist.
- Supplier receiving is the precedent for a safe batch: up to **100 line items** ([supplier-receivings.validator.ts:23](backend/src/features/inventory/receiving/supplier-receivings.validator.ts#L23)) posted in one `runFinancialTransaction` at `Serializable` isolation.

### D. Product page UX

| Observation | Evidence |
|---|---|
| Table: product **name** opens the drawer | [ProductsTable.tsx:72-79](frontend/src/features/products/components/ProductsTable.tsx#L72-L79) — a real button ✅ |
| Table: product **image** is inert and `alt=""` | [ProductsTable.tsx:65-70](frontend/src/features/products/components/ProductsTable.tsx#L65-L70) ❌ |
| Grid/list card: **neither** image nor name is clickable | [ProductCard.tsx:36-51](frontend/src/features/products/components/ProductCard.tsx#L36-L51) — the name is a plain `<span>` inside the checkbox `<label>`, so clicking it toggles selection ❌ |
| Grid card image is a full `aspect-square` tile — the largest, most obvious target on screen — and does nothing | [ProductCard.tsx:36-39](frontend/src/features/products/components/ProductCard.tsx#L36-L39) ❌ |
| No **Inventory** action anywhere on a row or card | Stock is reachable only via drawer → scroll to the Stock section |
| No **Make Order** action on a product row, although the scanner preview has one | [ProductPreviewPanel.tsx:137-159](frontend/src/features/products/components/ProductPreviewPanel.tsx#L137-L159) has Make Order / Receive Stock / Open Product; the catalogue has none of the three |
| Drawer is nine stacked sections in one scroll | [ProductDetailsDrawer.tsx:80-114](frontend/src/features/products/components/ProductDetailsDrawer.tsx#L80-L114): Info, Stock, Specifications, Label, Pricing, Notes, Record info, Related jobs, Audit |
| Brand filter is a free-text box labelled "All Brands" | [ProductFilters.tsx:23](frontend/src/features/products/components/ProductFilters.tsx#L23) — reads as a dropdown, behaves as an exact-match text field |

Search itself is fine: 300 ms debounce ([ProductsPage.tsx:44](frontend/src/pages/products/ProductsPage.tsx#L44)), server-side, with pg_trgm indexes from v1.0.9 and exact-match hoisting in the repository.

### E. Brands

- **No `Brand` model exists.** `schema.prisma` has 40 models; none is `Brand`.
- `Product.brand` is `String?` ([schema.prisma:682](backend/prisma/schema.prisma#L682)), indexed at line 725, validated as free text max 120 ([products.validator.ts:78](backend/src/features/service/products/products.validator.ts#L78)).
- The product form's brand field is a bare text input ([ProductFormDialog.tsx:187](frontend/src/features/products/components/ProductFormDialog.tsx#L187)) — no suggestions, no autocomplete, no datalist.
- No endpoint returns the distinct brand list. The filter sends a raw string to an exact backend match.
- The system already *assumes* brands collide: duplicate detection compares brand case-insensitively ([products.repository.ts:105-116](backend/src/features/service/products/products.repository.ts#L105-L116)).

### F. Barcode / model / SKU duplicate detection

Current behaviour:

- `checkDuplicate` fires only **on blur of Model or Brand**, and returns immediately in edit mode:
  ```tsx
  // frontend/src/features/products/components/ProductFormDialog.tsx:96-99
  const checkDuplicate = () => {
    if (product || !form.name.trim() || !form.model.trim()) return;   // edit mode → no check at all
    duplicate.mutate({ name, model, brand });
  };
  ```
- It matches **name AND model** (+brand if given), all case-insensitive, top 5 ([products.repository.ts:105](backend/src/features/service/products/products.repository.ts#L105)).
- **Barcode is never checked live.** It is `@unique` in the schema and rejected at create by `barcodeConflict()` ([products.service.ts:73-75](backend/src/features/service/products/products.service.ts#L73-L75)) — so the user finds out only when Save fails, after filling the whole form.
- **SKU is server-generated** at create (`generateProductSku`) so it cannot collide there. It becomes user-editable afterwards through the separate admin `PATCH /products/:id/sku` endpoint.
- Model alone is intentionally not unique — correctly, since variants share models. But "same model, different spelling of the name" is exactly the near-duplicate that happens at the counter.

The warning UI already exists and is good ([ProductDuplicateWarning.tsx](frontend/src/features/products/components/ProductDuplicateWarning.tsx)): it lists matches, links to each, and offers Continue Anyway. It is simply under-fed.

---

## 3. Root causes, consolidated

| Issue | Root cause | Layer |
|---|---|---|
| A | Stock fields absent from create at all four layers; UI section gated on `product` truthiness | Full stack — omission |
| B | `CatalogProductPicker` resolves the selected product only from local state or the current search page; cannot hydrate by id | Frontend, one component |
| C1 | Consequence of A | Full stack |
| C2 | No `trackStock` backend filter; Untracked tab filters client-side over one 100-row page with no pagination | Backend query + frontend page |
| C3 | Opening count is per-product by construction; no batch endpoint exists | Backend, missing capability |
| D | Image and card-name are not interactive; high-value actions (Inventory, Make Order) live only in the scanner preview | Frontend |
| E | `brand` is free text with no vocabulary source and no picker | Data shape + frontend |
| F | Duplicate check is create-only, blur-triggered, and covers name+model+brand only | Frontend trigger + backend query scope |

---

## 4. Recommended fixes

### A. Add Product stock tracking — **Option A (recommended)**

Carry the *intention* at create; keep the *quantity* behind opening-count verification.

1. Render `ProductStockSection` in Add mode, with `stockQuantity` hidden (there is nothing to show) and an inline explanation:
   > *Stock tracking enabled. Verify the opening count before stock actions / تم تفعيل تتبع المخزون. أكّد الجرد الافتتاحي قبل حركات المخزون*
2. Add `trackStock: boolean` (default `false`) and `lowStockThreshold: number | null` to `CreateProductInput` and to `createProductSchema`. **Deliberately do not add `stockQuantity`** — the create endpoint must stay incapable of writing a quantity.
3. `ProductsService.create` writes both fields. `stockQuantity` stays at the DB default of 0. The existing CREATE audit snapshot already captures the whole row, so tracking intent is audited for free.
4. After a successful create with `trackStock: true`, show a follow-through CTA — success toast plus an inline banner on the new product — linking straight to Verify Opening Count. This closes the "I ticked the box and nothing happened" gap.

**Why not Option B** (admin sets the opening count during creation): the codebase maintains a deliberate two-tier split — a relaxed tier (create/update, server-generated audit reason, no password) and a strict tier (pricing, archive, opening count: typed reason + admin password). The validators document this explicitly at [products.validator.ts:128-133](backend/src/features/service/products/products.validator.ts#L128-L133) and [:144-146](backend/src/features/service/products/products.validator.ts#L144-L146). Putting a password-guarded quantity write inside the create endpoint collapses that split for a saving of one click. Option A plus the CTA gets the same speed without the architectural cost. **Recommend A. If the user still wants B, it belongs in a later release, as a second call to the existing opening-count endpoint chained by the frontend — never as a new field on `createProductSchema`.**

### B. Scanner → Sales Order prefill

1. **Teach the picker to hydrate.** In `CatalogProductPicker`, when `selectedProductId` is set but resolves to nothing locally, fetch it: `useProduct(needsHydration ? selectedProductId : '')` (the hook is already `enabled`-gated on a non-empty id). Resolution order becomes: local state → current search page → fetched-by-id. Render a "Loading selected product…" state while it lands.
2. **Lift the badge.** `ProductLinePicker` should take its stock badge from the picker's resolved product (via the `onSelect` value plus the hydrated one) rather than its own cold `useState`.
3. **Open on the item.** When a prefill is present, `CreateSalesOrderDialog` should open at **step 3 (Items)** instead of step 0, so the counter immediately sees the scanned product with quantity 1. Back still walks to Payment/Customer/Channel. Without a prefill, behaviour is unchanged.
4. **Make the handoff durable.** Move the prefill from route state to a query param: `/sales-orders?action=add&productId=<uuid>`. The page already reads `action=add` ([SalesOrdersPage.tsx:29](frontend/src/pages/sales-orders/SalesOrdersPage.tsx#L29)), so this is a small extension. **Keep the route-state reader as a fallback** so nothing regresses, and keep the existing `salesOrderPrefillFromRouteState` tests green.
5. Nothing on the backend changes. Sales validation, stock deduction, and ledger writes are untouched.

### C. Inventory batch onboarding — full design in §6.

### D. Product page UX — full design in §9.

### E. Brands — full design in §10.

### F. Duplicate detection — full design in §11.

---

## 5. Version / checkpoint plan

Current: **1.9.6**.

| Version | Scope | Risk | Migration |
|---|---|---|---|
| **v1.9.7 — hotfix** | A: Add Product stock tracking · B: Scanner Make Order prefill | Low — one validator field pair, one service field pair, three frontend components | None |
| **v1.9.8** | C: Inventory batch onboarding (backend endpoint + Inventory Onboarding screen + `trackStock` list filter + paginated Untracked tab) | Medium — new write endpoint, must be right first time | None |
| **v1.9.9** | D: Product page UX cleanup · F: duplicate detection | Low–medium — mostly presentational plus one widened read endpoint | None |
| **v1.10.0** | E: Brands section (no-migration v1) · optional CSV import for onboarding | Low | None |

> **Superseded — see CP-RW8.** None of these four releases was ever cut; RW2–RW7 all landed in one uncommitted working tree and the installed version is still `1.9.6`. They now ship as a **single cumulative release, `v2.0.0`**. The scope rows above still describe what each checkpoint contains, but the release column is history, not a plan.

Ship v1.9.7 on its own. It is small, it unblocks daily work, and it stops the untracked backlog from growing while v1.9.8 is being built. Do **not** bundle the batch-onboarding write endpoint with anything else — it is the only genuinely new write path in this plan and it deserves an isolated release.

A later **v2 Brands migration** (real `Brand` table + `brandId` + backfill + a merge tool for near-duplicates) is explicitly out of scope for this sequence. Revisit once the no-migration v1 has been in use for a few weeks and the real duplicate rate is known.

---

## 6. Bulk inventory onboarding design

### Screen: Inventory → Onboarding

Reached from a new **"Onboard products / إدراج المنتجات في المخزون"** button on the Inventory page, and from a count badge on the Untracked tab.

**Worklist**
- Server-side list of products with **no `OPENING_BALANCE` movement**, paginated (25/50/100 per page), searchable by name, SKU, barcode, model and brand.
- Columns: select · name · model/brand · SKU · barcode · current `trackStock` · **Opening count** (number input, blank = not set).
- Filters: *Never onboarded* (default) · *Untracked* · *Tracked but no opening balance*.
- Row-level "already onboarded" rows are excluded server-side, never merely greyed out, so a stale page cannot submit one.

**Batch entry**
- Every opening-count field **starts blank**. It is never prefilled from `Product.stockQuantity` — and as of the 2026-08-21 measurement there is nothing to prefill from anyway: **zero untracked products carry a non-zero quantity** (decision #8, closed).
- Type a count per selected row, or use **"Set all selected to 0"** for the common empty-shelf case.
- Running counter: *"37 selected · 37 counts entered · 0 incomplete."*
- Hard cap **100 rows per batch**, matching the supplier-receiving cap and one serializable transaction's comfortable budget. The UI blocks selecting the 101st with a clear message.
- Real backlog is **309 products ≈ 3 full batches** (4 if archived products are included), so the whole catalogue can be onboarded in one sitting.

**Preview before submit (mandatory, no bypass)**
A dry-run call classifies each row and the screen shows the tally before any password field appears:

| Bucket | Handling |
|---|---|
| Valid | will write one `OPENING_BALANCE` movement |
| Already onboarded | listed and **excluded**; never overwritten |
| Product missing / archived | listed and excluded |
| Invalid count (negative, non-integer, over limit) | **blocks the whole submit** |
| Duplicate row (same product twice) | **blocks the whole submit** |

**Submit**
- One typed batch reason (min 5 chars, e.g. *"Initial shop-floor stock count, August 2026"*), applied to every movement in the batch.
- One optional per-row note.
- **One admin account password for the whole batch.**
- Admin only — route `requireServiceAdmin` plus a service-level `Role.ADMIN` check, exactly as `verifyOpeningCount` does today.

### Backend

`POST /api/inventory/onboarding/batch`

```
{
  reason: string,                    // min 5, max 1000
  accountPassword: string,
  dryRun?: boolean,                  // preview
  items: [{ productId: uuid, openingCount: int 0..LIMIT, note?: string }]   // 1..100, productIds unique
}
```

Service behaviour, inside **one** `runFinancialTransaction` at `Serializable`:

1. Assert authenticated + `Role.ADMIN`.
2. `verifyAdminPassword(…, { action: 'BATCH_VERIFY_OPENING_COUNT', recordType: 'PRODUCT_BATCH' })` — **once**.
3. Load all products in the batch; classify every row.
4. If any row is invalid or duplicated → throw, whole batch rejected, nothing written.
5. If any row already has an opening balance → excluded from the write, reported as `skipped`. **Never overwritten** — reuses the same guard as `InventoryService.verifyOpeningCount` ([inventory.service.ts:75-77](backend/src/features/inventory/inventory.service.ts#L75-L77)).
6. For each remaining row: `setVerifiedOpeningCount` (sets `trackStock: true`, `stockQuantity`, `updatedById`) then `createMovement` with `movementType: OPENING_BALANCE`, `quantityBefore: 0`, `quantityAfter: count`, `referenceType: 'MANUAL_BATCH'`, `referenceId: <batch correlation id>`, the batch reason and the row note.
7. Return `{ written: [...], skipped: [...], batchId }`.

`dryRun: true` runs steps 1–5 and rolls back without writing, returning the same classification. The password is still verified on dry run, so the preview cannot be used to probe the catalogue.

### Deliberate non-goals

- **No** endpoint that sets `stockQuantity` without a movement.
- **No** "mark tracked, figure out quantities later" mode — tracked with no verified opening balance is the exact limbo state that created this backlog.
- **No** SQL repair script as a normal workflow. `backend/prisma/repair/` stays for genuine migration repair, not for routine data entry.
- **No** employee submit path in v1.

### Answers to the Part 3 questions

1. **All-or-nothing** for the submitted batch. Partial success hides failures in a wall of 100 rows; a rejected batch with a named bad row is faster to fix. The one exception is *already-onboarded* rows, which are skipped-and-reported rather than fatal — they are the expected outcome of a stale page, not an error.
2. **100 rows** per batch. Same cap as supplier receiving, comfortable inside one serializable transaction, **~3 batches** for the measured 309-product backlog.
3. **Yes, zero is allowed.** The per-product dialog already states it. A zero opening balance still writes a real movement, so it is fully audited.
4. **Admin-only end to end in v1.** No persisted employee draft: it would need a new table and a new audit surface for a workflow the admin can complete in five sittings. Revisit only if the admin actually asks for it.
5. **CSV: defer past v2.0.0.** The select-and-type path clears the measured 309-product backlog in **three batches**, in one sitting. CSV adds file parsing, SKU/barcode row matching, encoding and Arabic-text handling, and a second error surface — all for the same one-off job that is now provably three batches long. The smaller measured backlog strengthens this recommendation rather than weakening it. If the user wants it sooner it is still a contained addition, because it feeds the identical preview/confirm path and the submit endpoint does not change at all.

---

## 7. Product creation workflow design

Restructure `ProductFormDialog` into labelled sections in this order:

**1 · Identity** — Name\*, Brand (combobox, §10), Model\*, Barcode, Label barcode source. SKU is server-generated and shown read-only after creation. Live duplicate detection runs across this whole section (§11), not just on Model blur.

**2 · Pricing** *(admin only, unchanged)* — cost, preset/custom mode, installment. Already well built; do not touch it in this pass.

**3 · Inventory tracking** *(new in Add mode)*
- **Track stock** toggle.
- **Low-stock threshold** (enabled only when tracking is on).
- Current quantity hidden in Add mode; shown read-only in Edit.
- Persistent explanatory note when tracking is on:
  > *Stock tracking enabled. The opening count must be verified before any stock action. / تم تفعيل تتبع المخزون. يجب تأكيد الجرد الافتتاحي قبل أي حركة مخزون.*
- In Edit mode, when the product is tracked but has no opening balance, show the existing amber banner with the **Verify Opening Count** button inline, rather than only inside the drawer's Stock section.

**4 · Image** — unchanged.

**5 · Specifications & notes** — unchanged.

**After create, when `trackStock` was on:** the success toast carries a **"Verify opening count now"** action that opens the dialog for the new product. This is the whole difference between "the toggle did nothing" and a finished workflow.

**Chosen option: A.** Create writes `trackStock` and `lowStockThreshold` only. `stockQuantity` remains unreachable from the create endpoint, and every quantity in the system continues to trace to a `StockMovement`.

---

## 8. Scanner-to-sales prefill fix design

**Target flow**

```
Scanner Hub → scan → preview → Make Order
  → /sales-orders?action=add&productId=<uuid>
  → CreateSalesOrderDialog opens at step 3 (Items)
  → line 1: scanned product resolved and shown, quantity 1, unit price suggested
  → user adjusts quantity, then walks Back to Payment / Customer / Channel, or Next to review
  → backend validates on save; no stock deduction and no ledger write before save
```

**Changes**

1. `CatalogProductPicker` — hydrate by id when the selection is not in local state or the current result page. Show a loading row while it resolves; show a retry affordance if the fetch fails.
2. `ProductLinePicker` — take the badge product from the resolved selection rather than local state.
3. `CreateSalesOrderDialog` — open at step 3 when a prefill is present; `setStep(0)` stays the default otherwise.
4. `SalesOrdersPage` — read `productId` from the query string first, route state second. Strip the param after applying it, as it already does for route state.
5. `ScannerHubPage` — `onMakeOrder` navigates to the query-param URL.

**Explicitly unchanged:** `salesLineForProduct` price derivation, sales-order validation, `SalesOrderStockFulfillment`, debt creation, all backend sales rules.

**Test matrix**

| Case | Expected |
|---|---|
| Barcode scan → Make Order | Line 1 shows the product, qty 1, suggested price |
| SKU scan → Make Order | Same |
| Product with an uploaded image | Resolves; image not required by the picker |
| Product out of stock (tracked, qty 0) | Prefills; "In stock: 0" badge; selling above stock stays allowed, as today |
| Product not tracked | Prefills; no stock badge |
| Archived product | Make Order stays disabled at the preview ([ProductPreviewPanel.tsx:141](frontend/src/features/products/components/ProductPreviewPanel.tsx#L141)) — no change |
| Hard refresh on the prefilled URL | Query param survives; dialog reopens prefilled |
| Direct navigation with a bogus `productId` | Error banner + Retry, dialog usable with an empty line |
| Manual "Add Order" with no prefill | Opens at step 0, one empty line — unchanged |

---

## 9. Product page UX cleanup design

**Make the obvious things clickable**
- Grid card image → opens the details drawer. Wrap it in a button; keep the selection checkbox as a separate overlay target with its own hit area.
- Grid/list card **name** → opens the drawer (move it out of the checkbox `<label>`, which currently steals the click).
- Table thumbnail → opens the drawer; give it a real `alt` and a title.

**Quick actions, consistently, on row and card**

| Action | Today | Proposed |
|---|---|---|
| View details | ✅ | ✅ |
| Edit | ✅ | ✅ |
| Print label | ✅ | ✅ |
| **Inventory** | ❌ drawer-only, requires scrolling | **New** — opens the drawer focused on the Stock section |
| **Make Order** | ❌ scanner-only | **New** — same `/sales-orders?action=add&productId=` link the scanner uses |
| Archive/Restore | ✅ admin | ✅ admin |

Six actions is too many buttons for a table row. Keep View · Edit · Inventory inline and move Print · Make Order · Archive into a compact overflow menu, so the row gets *shorter*, not busier.

**Drawer**
- Add a sticky section nav at the top of the scroll area (Info · Stock · Specs · Label · Pricing · Notes · History) so Stock is one click, not a scroll hunt. Tabs are a bigger change; a sticky anchor row is the cheap 80%.
- Surface stock status and quantity in the drawer **header**, next to the status badge, so it is visible before any scrolling.

**Filters**
- Replace the free-text brand box with a real brand picker once §10 lands. Until then, at minimum relabel it so it stops claiming to be "All Brands".

Explicitly out of scope for this pass: pricing panel layout, label panel, audit rendering. They work.

---

## 10. Brands section design

**Recommendation: two stages, and only stage 1 in this sequence.**

### Stage 0 — the existing mess, measured and scripted (ready now, not yet run)

Measured on the 2026-08-21 backup: **402 of 404 products carry a brand, in 205 distinct strings that collapse to 179** once case and spacing are ignored. **20 brands are stored under more than one spelling** (`kozano` / `Kozano` / `KOZANO`), affecting 136 products.

A one-off cleanup script exists:

**`backend/prisma/data-fixes/2026-08-21-normalize-product-brands.sql`** — *written and verified, deliberately not executed against the business database.*

| Property | Detail |
|---|---|
| Scope | `public.products.brand` only. One text column. |
| Effect | Updates **41 product rows**; distinct brand strings **205 → 179** |
| Transactional | Single `BEGIN`/`COMMIT`; a tripped guard aborts the whole thing |
| Idempotent | Verified — a second run reports `UPDATE 0` and leaves 179 brands |
| Safety guard | Aborts if more than 60 rows would change, i.e. if the live catalogue has drifted from the backup this map was derived from |
| Verification built in | Ends with a query that must return **zero rows**; returned zero on the scratch restore |
| Prerequisite | **A fresh backup before running. Non-negotiable.** |

**It is a data cleanup, not a migration repair, and it is deliberately outside `backend/prisma/repair/`.** That folder carries strict provenance semantics — its README states every file in it was actually run on a business PC and that none may be pruned — and it is wired to `repair-registry.ts`. A cosmetic text normalization does not belong in that lineage, so it lives in a separate `data-fixes/` folder and is not registered anywhere.

**Audit gap, stated plainly:** the script writes **no `service_audits` rows**, because the audit writer is application-layer (`writeServiceAudit`), not a database trigger. The change will not appear in the product audit history in the details drawer. That is an accepted trade for a cosmetic fix on 41 rows. **It must not be treated as a precedent.** Nothing touching money, stock, ledger balances, or any financial record may be corrected by direct SQL on this pattern — those paths keep their application-layer audit and their admin-password guards, per §12.

It also deliberately leaves `updatedAt` alone (Prisma's `@updatedAt` is ORM-applied, so a raw `UPDATE` does not bump it), so 41 products do not spuriously surface as "recently updated".

**Two manual review decisions, both flagged inline in the script:**

1. **`General pro` → `General Pro`.** The majority spelling is the lowercase-p form (4 of 7), but it reads as a typo, so Title Case is applied. This changes 6 rows instead of 3. **Acceptable as written** — but if the business prefers to follow the majority, set both canonicals to `General pro`.
2. **`SuperChef` + `SUPER CHEF` → `Super Chef`.** These differ by *spacing*, not just case, so no case-fold would ever merge them, and `Super Chef` exists in neither row today. **Review before running** — if the business considers these two separate brands, delete those two lines and nothing else changes.

House style for ties, applied throughout: **majority spelling wins; where there is no majority, Title Case wins** (`Kenwood`, `StarSat`, `Silver Crest`, `Moulinex`, `National Pro`, `Gebe`). Acronym brands keep their caps (`DSP`, `TCL`, `PLATINUM`, `ELEMENTS`, `GENERAL`) because those are genuine majorities.

**Never auto-merged** — verified to survive the script intact: `Mac` vs `MAC Styler`, `Hisense` vs `Hisense TV`, `GENERAL` vs `General Pro` / `General Gold` / `GENERAL OCEAN`. Matching is by exact equality, so none can be caught by accident.

Running stage 0 is optional and independent of the release sequence. Stage 1 is what stops the mess recurring.

### Stage 1 — v2.0.0, no migration

1. **`GET /api/products/brands`** — distinct non-null, non-empty `brand` values with product counts, normalised case-insensitively. For each case-insensitive group, the canonical display spelling is the most-used variant; the response also carries the variant list so the UI can show *"Samsung (43) · 2 spellings"*.
   Cheap: `brand` is already indexed ([schema.prisma:725](backend/prisma/schema.prisma#L725)).
2. **Brand combobox in the product form** — pick an existing brand or type a new one. Typing a case-variant of an existing brand shows an inline hint: *"Did you mean Samsung? / هل تقصد Samsung؟"* with one click to adopt the canonical spelling. This is where duplicates actually stop.
3. **Brand filter becomes a real dropdown**, fed by the same endpoint, with counts.
4. **Brands page under Settings** (read-only in stage 1): brand list, product counts, spelling variants, click through to the filtered catalogue. This is the screen that makes the mess visible and tells us whether stage 2 is worth it.

Stage 1 delivers "add once, pick from a dropdown, stop retyping" — the actual request — with zero schema risk.

### Stage 2 — later, only if stage 1 proves insufficient

A real `Brand` table with `id`, `name` (unique, case-insensitive), `isActive`; `Product.brandId String?` alongside the retained `brand` string during transition; a backfill migration; an admin **merge brands** tool (audited, admin-password guarded, since it rewrites many product rows); then a switch of reads to the relation and a later drop of the string.

Not now. It is a multi-step migration on the business PC to solve a data-entry problem that a combobox largely solves.

---

## 11. Duplicate detection design

**One endpoint, widened.** Extend `GET /products/check-duplicate` to accept `name?`, `model?`, `brand?`, `barcode?`, `sku?`, `excludeProductId?` and return typed matches:

```
{ matches: [{ id, name, model, brand, sku, barcode, isActive, reason }] }
reason: 'BARCODE_TAKEN' | 'SKU_TAKEN' | 'SAME_NAME_MODEL' | 'SAME_MODEL_BRAND'
```

- `BARCODE_TAKEN` / `SKU_TAKEN` come from the existing `findByBarcode` / `findBySku` unique lookups.
- `SAME_NAME_MODEL` is today's `findDuplicates`, unchanged.
- `SAME_MODEL_BRAND` is new — the near-duplicate the shop actually hits.
- `excludeProductId` makes the check work in **edit mode**, which it cannot do today.
- The response exposes only catalogue fields the Products page already shows. **No pricing, no cost, no stock.**

**Frontend**

- Debounced (400 ms) checks on change — not blur — for Name, Model, Brand, Barcode, and SKU (SKU in the edit dialog only, since create generates it).
- Inline, per-field feedback under the field that triggered it:
  - Barcode/SKU collision → **red, blocking**: *"Barcode already used by: {product name} — Open"*. Save is disabled until it is changed. This mirrors the DB unique constraint, so it converts a save-time 409 into an immediate answer.
  - Name+model or model+brand match → **amber, non-blocking**: the existing `ProductDuplicateWarning`, with Continue Anyway. Legitimate variants must still be creatable.
- In edit mode, the product's own row is excluded, so a product never flags itself.
- **The backend stays authoritative.** `barcodeConflict()` and the DB unique constraints remain the enforcement; the live check is a courtesy that prevents wasted typing, never the gate.

---

## 12. Safety rules (binding for every checkpoint)

These are constraints on the implementation, not aspirations.

1. **Backend is authoritative.** The frontend never computes stock, price, debt, or ledger truth. Duplicate hints, stock badges, and price suggestions are advisory; the server decides on write.
2. **Every quantity traces to a movement.** No code path may write `Product.stockQuantity` without a corresponding `StockMovement` row in the same transaction. The create endpoint must remain structurally incapable of setting a quantity.
3. **Opening count is never bypassed.** Batch onboarding uses the same rule as the single-product path: refuse if an `OPENING_BALANCE` already exists, and never overwrite one.
4. **High-risk stock work stays password-guarded.** Batch onboarding is admin-only with one account-password verification per atomic batch — the batch *is* one operation. Remove, damage/loss, and stock count keep their existing per-operation guards untouched.
5. **Low-risk work stays unguarded.** Product identity, notes, specifications, and stock *settings* keep the v1.8.1 posture: role-gated, server-generated audit reason, no password. Do not add friction where none exists today.
6. **Full audit, per product.** A batch writes one `OPENING_BALANCE` movement per product with the batch reason, actor, and a shared `referenceId` correlating the batch. One aggregate audit row for 100 products is not acceptable.
7. **All-or-nothing writes.** Batch onboarding runs in one `runFinancialTransaction` at `Serializable`. A failure writes nothing.
8. **No new bulk stock mutation.** Onboarding creates opening balances only. There is no batch add, batch remove, batch count, or batch adjust in this plan.
9. **No repair SQL as workflow.** `backend/prisma/repair/` is for migration repair. Routine data entry goes through the API. The one-off brand cleanup in `backend/prisma/data-fixes/` (§10, stage 0) is a bounded exception for a cosmetic text column, taken knowingly and with its audit gap documented. **It is not a precedent.** Money, stock, ledger balances, debts, and any financial record are corrected only through the application, where the audit rows and password guards live — never by direct SQL.
10. **Untouched by this plan:** inventory audit, financial audit, customer ledger, supplier ledger, sales-order validation, stock-movement rules, receiving void semantics.
11. **No migrations.** Every fix here uses existing columns. If any checkpoint discovers it needs a schema change, stop and re-plan rather than adding one mid-stream.
12. **Business PC untouched during development.** Test against a local database only.

---

## 13. Test plan

### v1.9.7 — hotfix

**Backend**
- `createProductSchema` accepts `trackStock` and `lowStockThreshold`; still rejects `stockQuantity` (strict); rejects a negative or non-integer threshold.
- `ProductsService.create` persists both fields; `stockQuantity` is 0 regardless of input; the CREATE audit snapshot includes them.
- Product created with `trackStock: true` reports `onboardingStatus: 'PENDING_ONBOARDING'` and every stock movement is refused until the opening count is verified.
- Product created with `trackStock: false` reports `NOT_IN_INVENTORY`, exactly as today.

**Frontend**
- Add Product renders the stock section; toggling Track stock enables the threshold field; the explanatory note appears.
- Create with tracking on → success toast carries the Verify-opening-count action.
- Edit Product is visually unchanged.
- `CatalogProductPicker` hydrates a `selectedProductId` that is absent from the search results and renders the green confirmation card.
- Picker shows a loading state during hydration and a retry on failure.
- `CreateSalesOrderDialog` opens at step 3 with a prefill and step 0 without.
- `salesOrderPrefillFromRouteState` tests stay green (route state remains a supported fallback).
- New: query-param prefill is read, applied, and stripped.

**Manual, on the real machine, before release**
- USB barcode scan → Make Order → confirm the product is visible without searching.
- SKU scan → same.
- Hard refresh on the prefilled URL → still prefilled.
- Add a product with tracking on → verify opening count → confirm stock actions unlock.

### v1.9.8 — batch onboarding

**Backend**
- Rejects non-admin; rejects a wrong password; respects the 5-attempt lockout.
- Rejects an empty batch, a batch over 100, duplicate `productId`s, negative counts, non-integer counts, counts over the limit.
- Skips-and-reports products that already have an opening balance; **asserts the existing balance and movement are unchanged**.
- Writes exactly one `OPENING_BALANCE` per written row, with correct `quantityBefore: 0` / `quantityAfter`, batch reason, actor, and shared `referenceId`.
- Sets `trackStock: true` and `stockQuantity` on every written row.
- A failure on row 50 of 100 leaves zero rows written and zero movements.
- `dryRun: true` writes nothing and returns the same classification.
- Concurrency: two overlapping batches containing the same product — one wins, the other reports skipped, and no product ends with two opening balances.
- Integration test at 100 rows completes inside the transaction timeout.

**Frontend**
- Worklist paginates and searches server-side; the 101st selection is blocked with a clear message.
- "Set all selected to 0" fills every selected row.
- Preview shows valid / skipped / invalid tallies; submit is disabled while any invalid or duplicate row exists.
- Success shows written and skipped counts and refreshes the worklist.
- Untracked tab paginates and reflects a true server-side count, not a 100-row client slice.

**Manual**
- Onboard a real batch of ~50 on a copy of production-shaped data; verify counts in the movement history and the integrity report.

### CP-RW5 – CP-RW7 (all ship in v2.0.0)

- Duplicate detection: barcode collision blocks save; name+model match warns and allows Continue Anyway; edit mode does not flag the product against itself; response carries no pricing or stock fields.
- UX: image click opens the drawer in both grid and table; card name click opens the drawer and does **not** toggle selection; Inventory and Make Order quick actions navigate correctly; existing component snapshots reviewed and updated deliberately.
- Brands: distinct endpoint groups case variants and returns correct counts; combobox offers existing brands; the near-match hint fires on a case variant; the filter dropdown filters correctly.

**Every release:** full `vitest` suite green, TypeScript clean, and the existing product/inventory/sales/scanner integration tests unchanged in intent.

---

## 14. Release strategy

For each release, in order:

1. Implement against a local database. Never point at the business PC.
2. Full test suite plus the manual checklist for that release.
3. Update `claude/plans/` with an implementation summary.
4. Version bump, changelog, build installer.
5. **Back up the business database before installing.** No migrations in this sequence, but the backup discipline does not bend for that.
6. Install; smoke-test the specific workflows the release touched.
7. Watch for two working days before starting the next release.

Ship **v1.9.7 first and alone.** It is small, it removes both daily blockers, and it stops the untracked backlog from growing while v1.9.8 is built. Do not bundle it with the batch endpoint.

**Rollback:** every release here is code-only with no schema change, so rollback is reinstalling the previous installer. Data written by v1.9.8 (opening balances) is legitimate business data and stays valid on any version — it is the same movement the single-product path has always written.

---

## 15. Open decisions for the user

1. **Opening count at product creation (Option B).** Recommendation is A: create sets the tracking intention only, with a one-click follow-through to verify the count. B would let an admin enter the count in the create dialog itself but collapses the relaxed/strict endpoint split the codebase maintains deliberately. **Confirm A, or accept the trade-off for B?**
2. **Batch size cap of 100.** Matches supplier receiving. The measured backlog of 309 = 3 batches at 100, or 7 at 50. **Accept 100, or should the cap be lower (50) for a slower, safer first run?**
3. **CSV import timing.** Recommendation is to defer past v2.0.0, after the onboarding screen has been used for real. **Accept, or is CSV needed in v2.0.0?**
4. **Employee-prepared drafts.** Recommendation is admin-only end to end in v1 — no persisted draft table. **Accept, or does an employee need to stage the counts?**
5. **Brands stage 2.** Recommendation is to stop at the no-migration combobox and revisit the `Brand` table only if duplicates persist. **Accept, or plan the migration now?**
6. **Product row action density.** Recommendation is View · Edit · Inventory inline, with Print · Make Order · Archive in an overflow menu. **Accept, or keep everything inline?**
7. ~~**Existing untracked products with a non-zero `stockQuantity`** — prefill the opening count from it, or always start blank?~~ **CLOSED 2026-08-21.** The question is moot: **zero untracked products have `stockQuantity > 0`**. There is nothing to prefill from. The screen starts every field blank, which was the recommendation anyway — a prefilled number is the number that gets accepted without counting, and the point of an opening count is that someone looked at the shelf.
8. ~~**Backlog size** — confirm the real number before sizing v1.9.8.~~ **CLOSED 2026-08-21.** Measured from the manual backup: **404 products, 308 untracked, 309 without an opening balance** (280 active / 29 archived). That is **~3 batches** at 100/batch, not 5. The batch onboarding table starts blank / default zero; it does **not** attempt to preserve or carry forward any existing `stockQuantity` for untracked products.

---

## Checkpoint plan

| CP | Scope | Deliverable | Release |
|---|---|---|---|
| **CP-RW1** | Repo review, bug confirmation | **This document** — complete | — |
| **CP-RW2** | Hotfix: create-time stock tracking + scanner prefill hydration | Types, validator, service, `ProductFormDialog`, `ProductPicker`, `ProductLinePicker`, `CreateSalesOrderDialog`, `SalesOrdersPage`, `ScannerHubPage` + tests | v1.9.7 |
| **CP-RW3** | Batch onboarding foundation | `trackStock` list filter, onboarding worklist query, batch validator + service + routes, backend tests. **No UI.** | v1.9.8 |
| **CP-RW4** | Batch onboarding UI | Inventory Onboarding page, preview/confirm flow, paginated Untracked tab, frontend tests | v1.9.8 |
| **CP-RW5** | Product page UX | Clickable image/name, quick actions, drawer section nav, header stock summary | v1.9.9 |
| **CP-RW6** | Duplicate detection | Widened `check-duplicate` endpoint + debounced per-field inline detection, blocking on unique fields | v1.9.9 |
| **CP-RW7** | Brands | `GET /products/brands`, form combobox with near-match hint, filter dropdown, read-only Brands page. *Superseded in part by CP-RW8B, which makes the page actionable.* | v2.0.0 |
| **CP-RW8** | Release review | Per-release: test sweep, version bump, changelog, installer, backup, install, smoke test | each |

Keep each checkpoint to one prompt. CP-RW3 and CP-RW4 are deliberately split so the new write endpoint is reviewed and tested before any UI is attached to it.

---

# CP-RW8 Release Freeze Review / Real-Work QA Findings

**Reviewed:** 2026-08-22, working tree on `main`, version `1.9.6`, nothing committed.
**Target release: `v2.0.0`** — one cumulative release covering RW2–RW7 plus CP-RW8B.
**Verdict: DO NOT cut it yet. One release blocker is open, plus release hygiene work.**

Every finding below names the file inspected. Where the repo could not confirm something, it says so.

## 1 · Current repo status

| Fact | Evidence |
|---|---|
| Version | `package.json` → `1.9.6`. **No bump has occurred.** |
| Branch | `main`, nothing staged, no release commit |
| Tests | `npm test` → **251 files, 2080 passed, 10 skipped**, 0 failed |
| Typecheck | `typecheck:frontend` and `typecheck:backend` both pass |
| Stash | `stash@{0}` — pre-existing "bucket-c" from v1.8.1, unrelated, leave alone |

RW2–RW7 are all implemented in the working tree as **uncommitted changes**. There is no feature commit yet.

## 2 · Implemented RW2–RW7 — confirmed against the code

| CP | Status | Evidence |
|---|---|---|
| **RW2·A** create-time stock tracking | **Implemented** | `createProductSchema` carries `trackStock` / `lowStockThreshold` (`products.validator.ts:111-112`); `stockQuantity` still absent, so create cannot write a quantity. `ProductsService.create:167-168` gates stock settings behind `assertServiceAdmin`. `ProductStockSection` has `mode?: 'create' \| 'edit'`, hides current quantity on create, and shows the opening-count notice. |
| **RW2·B** scanner → order prefill | **Implemented** | `CatalogProductPicker` now resolves local → search page → `useProduct` hydration (`ProductPicker.tsx:36-41`) with loading and retry states. `scannerOrderUrl` (`ScannerHubPage.tsx:30`) and `salesOrderPrefillFromNavigation` give a query-param handoff that survives reload; route state kept as fallback. |
| **RW3** onboarding backend | **Implemented** | `POST /inventory/onboarding/batch`, `GET /inventory/onboarding/pending`; skip vocabulary is exactly `ALREADY_ONBOARDED` / `PRODUCT_NOT_FOUND` / `PRODUCT_ARCHIVED` (`inventory.types.ts:106-109`). Dedicated tests: `inventory.onboarding.{auth,service,repository}.test.ts` + `inventory-onboarding-db.integration.test.ts`. |
| **RW4** onboarding UI | **Implemented** | `InventoryOnboardingPage.tsx` (169 lines), `InventoryOnboardingTable.tsx`, `InventoryOnboardingPreview.tsx`, `utils/onboarding-batch.ts`, `inventory-onboarding.frontend.test.tsx`. Route is ADMIN-gated (`App.tsx:76`). |
| **RW4** Untracked 100-row cap | **Fixed** | `InventoryPage.tsx` now uses the server `trackStock` filter with `pageSize = 25` and real pagination (`inventoryProductFiltersFor`, line 84), plus a backlog count badge from `pendingOnboarding.pagination.totalItems` (line 63). The old client-side slice of one 100-row page is gone. |
| **RW5** product page UX | **Implemented** | Grid image is a real button (`ProductCard.tsx:38-40`), list thumbnail too (line 47), product name is a button outside the checkbox label (line 49). `ProductOverflowMenu.tsx` added; `onInventory` prop threaded. `sales-order-links.ts` created, so the create-order URL has one definition. |
| **RW6** duplicate detection | **Implemented** | `productDuplicateQuerySchema` widened to `name`/`model`/`brand`/`barcode`/`sku`/`excludeProductId` with a `superRefine` requiring name+model, barcode, or SKU (`products.validator.ts:183-195`). Create now also does a case-insensitive barcode conflict check (`products.service.ts:171`). Tests in `product-duplicates.test.tsx`. |
| **RW7** brands | **Partial — see §3** | `GET /products/brands` registered above `/:productId` (`products.routes.ts:22-23`). `BrandCombobox.tsx`, `BrandsPage.tsx`, `brands.test.tsx` exist. **Read-only.** |

One contract defect was found and fixed during RW4: the batch endpoint originally required `accountPassword` for `dryRun: true`, which deadlocked the "preview before password" UI. `accountPassword` is now conditional (`inventory.validator.ts`), the dry run performs no password verification, and `inventory.onboarding.auth.test.ts` pins both halves.

## 3 · The one release blocker — Brands is read-only

**What the user sees:** the Brands page lists `General` and `GENERAL` as variants of one canonical row, flags it amber, and then says to go run a `.sql` file. There is no way to fix it from the UI.

**Confirmed, not guessed:**

- `BrandsPage.tsx` renders four read-only columns and a static amber notice (lines 18-21). There is no action control anywhere on the page.
- **No brand write endpoint exists.** `products.routes.ts` has exactly one brand route: `GET /brands`. A repo-wide search for `normalize` / `renameBrand` / `mergeBrand` in `backend/src` and `frontend/src` returns no product-brand write path.
- `Product.brand` is still a free-text `String?` (`schema.prisma:682`). **There is no `Brand` model** — the page groups strings returned by `ProductsRepository.groupBrandSpellings()`.

**Why:** this is built exactly to the CP-RW7 spec. §10 stage 1 scoped the page as read-only and deferred merge/rename to stage 2. **The specification was wrong for real business use, not the implementation.** Telling a shop owner to run a SQL file is not a workflow; it is a developer instruction leaking into the product.

**The script is a one-time artefact and cannot be the answer.** `2026-08-21-normalize-product-brands.sql` contains a **hardcoded** `VALUES` map derived from the 2026-08-21 backup, plus a guard that aborts if more than 60 rows would change. It is idempotent and safe, but it can only fix the 20 brand groups that existed on that date. A duplicate typed next Tuesday is not covered by it, and never will be. Even running it today leaves the business with no repeatable way to fix the next one.

### Recommended fix — CP-RW8B

Two endpoints, mirroring the dry-run/apply shape already proven by batch onboarding:

```
POST /api/products/brands/normalize-preview   (ADMIN)
  { sourceBrands: string[], targetBrand: string }
  → { targetBrand, affectedCount, products: [{ id, sku, name, brand }], warnings: [] }

POST /api/products/brands/normalize-apply     (ADMIN)
  { sourceBrands: string[], targetBrand: string, reason: string }
  → { targetBrand, updatedCount, products: [...] }
```

Behaviour:
- ADMIN only, route guard **and** service check.
- Exact-match `sourceBrands` only. **Never prefix, never fuzzy** — `Mac` / `MAC Styler`, `Hisense` / `Hisense TV`, `GENERAL` / `General Pro` / `General Gold` / `GENERAL OCEAN` are verified-distinct real brands and must survive untouched.
- Writes `products.brand` only. Never price, cost, stock, ledger, SKU, or barcode.
- One `runFinancialTransaction`; all-or-nothing.
- Idempotent — re-running updates 0 rows.
- `targetBrand` validated with the same `userTextSchema({ field: 'Brand', max: 120 })` the product form uses.
- Warn (do not block) when `targetBrand` is not among `sourceBrands` and does not already exist, since that creates a new spelling.

**Audit — and this is the part the SQL script cannot do.** Write one `ServiceAudit` row per affected product, `recordType: PRODUCT`, action `UPDATE`, with the batch reason and a before/after of the `brand` field. That is what makes the UI path strictly better than the script: the script's known, documented weakness is that it writes **no** `service_audits` rows.

**Password: not required. Recommended: ADMIN + typed reason.** Evidence: `PRODUCT_FIELD_POLICY` marks `brand: true` (`service-policy.ts:11`), so a single-product brand edit is admin-sensitive — but `ProductsService.update:343` enforces only `assertServiceAdmin(user)` with a server-generated audit reason. **No `verifyAdminPassword` is on that path.** Password in this codebase is reserved for pricing, archive/restore, and opening counts. Requiring one for brand cleanup would make the bulk path *stricter* than the single-product path it replaces, which is inconsistent. The mandatory preview, the typed reason, and per-product audit are the correct strengthening for a multi-row write.

Frontend: on the Brands page, each multi-spelling row gets **Fix spellings**, opening a dialog to choose the canonical target (defaulting to the majority spelling), preview affected products, type a reason, and apply. On success, refresh brands + products and the amber flag clears. **The UI never executes SQL.**

Once this ships, `BrandsPage`'s notice and the CP-RW7 line in the checkpoint table should stop pointing users at the script. The script remains on disk as the record of the one-time cleanup.

## 4 · Other areas — status

| Area | Status | Note |
|---|---|---|
| **A** Add Product stock tracking | **No blocker** | Works, admin-gated, opening-count guard intact. Not confirmed from repo inspection: whether the post-create "verify opening count" CTA is discoverable enough in real use — that is a UX judgement needing the user's eyes. |
| **B** Scanner → Make Order | **No blocker** | Hydration, query-param durability, quantity 1, no stock/ledger write before save. |
| **C** Batch onboarding | **No blocker** | Backend + UI + tests present. **Not yet exercised against real data** — see the QA checklist. |
| **D** Product page UX | **No blocker** | Image/name clickable, overflow menu, quick actions. |
| **F** Duplicate detection | **No blocker** | Barcode/SKU/model/name+model, `excludeProductId`, debounced. |
| **G** Product picker 100-cap | **Not a defect** | `ProductPicker` uses `useProductSearch({ limit: 10 })` — a **server-side** search window, not a client slice of the first 100. Typing narrows against the whole catalogue. The Inventory page's genuine 100-row cap was the real instance of this bug and is fixed. Remaining `pageSize: 100` call sites are pricing presets, prepaid, supplier receivings, and the supplier ledger dropdown — **out of scope for this plan**, but worth a look if any of those lists grows past 100. |

## 5 · Release hygiene — the working tree is not releasable as-is

Three distinct bodies of work are mixed in one uncommitted tree.

**(a) RW2–RW7 — the intended release.** Backend `inventory/` + `service/products/`, frontend `products/` + `inventory/` + `sales-orders/` + `scanner/`, `App.tsx`, `business-labels.ts`.

**(b) Unrelated WhatsApp / customer-communication feature — must not ride along.**

```
desktop/src/index.ts, preload.ts, preload.test.ts
desktop/src/whatsapp-link.ts, whatsapp-link.test.ts        (new)
frontend/src/features/customer-communication/               (new)
frontend/src/pages/customers/CustomerProfilePage.tsx
frontend/src/pages/customers/CustomerProfilePage.communication.test.tsx  (new)
frontend/src/features/backup/types/backup.types.ts
```

Verified **decoupled**: a search for `whatsapp` / `customer-communication` across `features/products`, `features/inventory`, `pages/products`, and `pages/inventory` returns nothing. It can be committed separately, before or after, with no effect on the RW work.

**(c) Housekeeping and artefacts.**

| Item | Action |
|---|---|
| `claude/plans/{reports-section,supplier-inventory-...}.md` deleted + re-added under `Completed/` | A move. Commit as housekeeping, separate from the feature. |
| `claude/plans/real-work-*.md`, `claude/plans/Prompts/real-work-*.md` | Commit with the feature — they are its specification. |
| `backend/prisma/data-fixes/` | **Must be committed.** The Brands UI currently names this path on screen; shipping a UI that points at an untracked file is a broken reference. |
| `homeconnect-2026-08-21-151618-manual.backup` (1.3 MB) | **Must never be committed.** It is untracked, not ignored. Add `*.backup` to `.gitignore` and move the file out of the repo root. |
| `stash@{0}` | Pre-existing v1.8.1 leftover. Out of scope — do not pop it as part of this release. |

## 6 · Pre-release checklist

Nothing below is optional, and none of it is a version bump.

- [ ] **CP-RW8B** — Brands normalize preview/apply, backend + UI + audit + tests.
- [ ] Update `BrandsPage` notice so it no longer instructs the user to run SQL.
- [ ] Add `*.backup` to `.gitignore`; move the backup file out of the repo root.
- [ ] Commit `backend/prisma/data-fixes/` (referenced by the UI).
- [ ] Separate the WhatsApp/customer-communication work into its own commit.
- [ ] Separate the `claude/plans` moves into a housekeeping commit.
- [ ] **CP-RW8D** — real-data QA: run one onboarding batch end to end; verify `OPENING_BALANCE` rows and movement history; re-submit the same batch and confirm every row skips with originals unchanged.
- [ ] Real-data QA: brand cleanup on `General` / `GENERAL`; confirm `General Pro`, `General Gold`, `GENERAL OCEAN` are untouched.
- [ ] Real-data QA: scanner → Make Order with a physical barcode scanner, including a hard reload on the prefilled URL.
- [ ] Real-data QA: create a product with tracking on, then verify its opening count.
- [ ] `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run prisma:validate` all clean.
- [ ] Only then: decide the version and follow `Prompts/real-work-cp-rw8-release-codex-prompt.md`.

## 7 · Recommendation

**No version bump now.** One blocker (Brands is read-only for a workflow the business needs weekly) plus release hygiene stand between the current tree and a professional release.

When it does ship, **one cumulative release is right** — RW2–RW7 have never been installed on the business PC, so shipping four separate installers now would be version spam for no benefit. **`v2.0.0`**, once CP-RW8B and the QA pass are done. This supersedes the four-release split in §5; that split assumed incremental shipping, which did not happen.

### Why 2.0.0 and not 1.10.0

The user's call, and a defensible one: this is the release where HomeConnect stops being a catalogue with a stock field bolted on and becomes an inventory-managed ERP — batch onboarding, an actionable brands section, duplicate prevention, and a reworked product surface, all landing at once after the first real weeks of live use. A major number marks that milestone in a way `1.10.0` would not.

**One thing the changelog must say explicitly:** this major bump carries **no breaking change and no migration**. The repo's own release runbook defines major as "breaking change to data or workflow", so a `2.0.0` that is schema-identical to `1.9.6` will otherwise read as a data-migration release to anyone upgrading — including future-you reading `git log`. State plainly that the schema is unchanged, no repair SQL is bundled, and the upgrade is install-over-the-top.

## 8 · Revised checkpoints

| CP | Scope | Gate |
|---|---|---|
| **CP-RW8A** | This audit. No code. | ✅ Complete |
| **CP-RW8B** | Brands normalize preview/apply — backend, UI, per-product audit, tests | Blocker |
| **CP-RW8C** | Release hygiene: `.gitignore`, commit separation, `data-fixes/` tracked | Blocker |
| **CP-RW8D** | Full regression + real-data business QA against a local restore | Blocker |
| **CP-RW8E** | Bump to **`v2.0.0`**, package, commit — **only after 8B–8D are closed and the user approves** | Gated on approval |
