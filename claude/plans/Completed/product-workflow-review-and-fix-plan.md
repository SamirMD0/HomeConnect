# Product Workflow Review and Fix Plan

Status: planning only — no code changed, no migration run, no version bump.
Reviewed: 2026-08-05 against `main` @ `5b347aa` (HomeConnect 1.3.0).
Scope: Products only (model, API, validators, pricing integration, form, details, list, search, labels, image). Inventory movement, POS, sales checkout and order logic are explicitly out of scope.

---

## 1. Review goal

Confirm root causes for the six reported product issues, find adjacent product-workflow defects, and produce an implementation plan small enough to be executed in reviewable checkpoints without destabilising pricing, labels or audit.

Every claim below was traced through the actual code path (form state → payload → validator → service → Prisma → serializer → UI). Line references are the evidence.

---

## 2. Current product workflow summary

**Data model** — `backend/prisma/schema.prisma:616-665`. One `Product` row carries three overlapping pricing concepts:

| Group | Fields |
|---|---|
| Legacy manual | `price`, `discount` (Decimal 12,2, both nullable) |
| Calculated | `costPrice`, `pricingPresetId`, `useCustomPricing`, `installmentEnabled`, `custom*Percent`, `customInstallmentMonths`, `customCalculationMode` |
| Identity / label | `sku` (unique, `PRD-…` style), `barcode` (unique, nullable), `labelBarcodeSource` enum `SKU \| MANUFACTURER` default `SKU` |

Plus `imageUrl` (external link) and a separate `ProductImage` table for uploaded bytes — a product has exactly one image source.

**Write paths** are deliberately split across four endpoints:

| Endpoint | Fields | Gate |
|---|---|---|
| `POST /products` | identity + legacy + specs + image URL + pricing | admin only if pricing present |
| `PATCH /products/:id` | identity, legacy price/discount, notes, specs, `imageUrl`, `labelBarcodeSource` | reason + account password when `containsSensitiveProductFields` |
| `PATCH /products/:id/pricing` | the 11 pricing fields only | admin + reason + password, always |
| `PATCH /products/:id/stock`, `/sku`, `/archive`, `/restore` | one concern each | admin + reason + password |

**Read path** — `serializeProduct` (`products.service.ts:578-626`) returns money as Decimal-safe strings and attaches a `pricing` block resolved through `resolveProductPricing` (`pricing-resolution.ts:12-54`). `costPrice` and the raw `configuration` are admin-only; `useCustomPricing` / `installmentEnabled` / `presetName` are visible to everyone.

**Frontend** — `ProductsPage` → `ProductFilters` + `ProductsTable` (table ≥lg, `ProductMobileCard` <lg) + `ProductDetailsDrawer` + `ProductFormDialog`. The form is one dialog that fans out to up to four mutations on save (`ProductFormDialog.tsx:146-153`).

**Labels** — `toLabelPayload` (`products.service.ts:508-536`) builds a strict allow-list payload; `ProductLabel.tsx` renders CODE128 via JsBarcode, printing digits only for a manufacturer barcode.

**Search** — the products list still uses Prisma `contains` over name/sku/model/brand + `startsWith` on barcode (`products.repository.ts:52-62`). Note: the v1.0.9 pg_trgm search upgrade (`claude/plans/Completed/v1.0.9-postgres-pgtrgm-search-plan.md`) built a shared, parameterised token-search engine in `backend/src/lib/search-query.ts` for customers, suppliers, supplier transactions and debts — **products were never registered as a target**, even though the migration already created trigram indexes on `products.name/model/brand`.

---

## 3. Known bugs from user — confirmed root causes

### B1. Saving fails when installment is off — **two independent causes, both confirmed**

**B1a (backend, primary).** `validateCustomPricing` (`products.validator.ts:181-186`):

```ts
const hasPricingConfiguration = Object.keys(productPricingValues)
  .some((field) => field === 'installmentEnabled' ? values[field] === true : values[field] != null);
if (hasPricingConfiguration && values.costPrice == null) → "Cost price is required for product pricing"
```

Only `installmentEnabled` is special-cased for the "a `false` boolean is not configuration" rule. `useCustomPricing: false` still satisfies `!= null`, so it always flips `hasPricingConfiguration` to `true`.

The frontend always sends both booleans for an admin: `pricingConfigurationInput` returns a fully-populated all-null/all-false object even when the cost price box is empty (`ProductFormDialog.tsx:308-323`), and it is spread into the create payload at `ProductFormDialog.tsx:132,257`.

Net effect: **an admin cannot create or re-price a product without a cost price** — the request is rejected with a cost-price error on a form where no pricing was entered. This is the error the user attributes to the installment toggle, and it is also what blocks the legacy-manual-price-only workflow (B2).

**B1b (frontend, secondary).** `productPricingPreviewOverridesSchema.safeParse(pricing)` runs unconditionally at `ProductFormDialog.tsx:108-114` and blocks submit, but the three fields it validates are only rendered inside `{value.installmentEnabled && …}` (`ProductFormPricingPanel.tsx:125-133`). Turn installment off after typing an invalid preview value and **Save does nothing with no visible error message**.

**Not a bug (verified):** cash price is mathematically independent of installment inputs — `calculatePricing` computes `cashPrice` from cost/expense/profit/buffer only, then derives the installment figures from it (`pricing-calculator.ts:14-35`). `resolveCustom` already neutralises installment inputs when the toggle is off (markup 0, down payment 100, months 1 — `pricing-resolution.ts:70-72`), and `serializeProduct` already omits the installment block (`products.service.ts:585-592`). So once B1a/B1b are fixed, "cash price still shows with installment off" works without touching the calculator.

### B2. Legacy manual selling fields

The fields, the storage and most of the UI already exist: `price`/`discount` columns, a "Legacy Manual Selling Fields" disclosure (`ProductFormDialog.tsx:202-208`), and a table cell that falls back to the manual price and flags divergence (`ProductsTable.tsx:202-229`). What is actually broken/missing:

1. B1a blocks saving a manual-only product as admin (cost price demanded).
2. There is no explicit *mode* — it is inferred from which columns happen to be set, so the UI cannot say "this product is priced manually on purpose" versus "someone forgot to configure pricing", and two prices can silently coexist with no rule about which is authoritative.

### B3. Image URL disappears after Save — **confirmed, single-line cause**

`ProductsService.create` builds the Prisma create payload at `products.service.ts:57-74` and **`imageUrl` is simply not in it**. The validator accepts it (`products.validator.ts:72`), the controller forwards it, the frontend sends it (`ProductFormDialog.tsx:253`) — the service drops it on the floor. The create audit snapshot consequently records `imageUrl: null` too.

The update path *does* map it (`productUpdateData`, `products.service.ts:484`), which is exactly why the user's workaround — reopen the product and retype the URL — sticks. Nothing is wrong with form state, the serializer (`products.service.ts:616-617`), query invalidation (`useProducts.ts:92`) or the image renderer.

### B4. Label barcode source should prefer the numeric barcode

Current behaviour: `labelBarcodeSource` defaults to `SKU` (`schema.prisma:640`), and `toLabelPayload` only uses the manufacturer barcode when the product explicitly opted in *and* a barcode exists (`products.service.ts:510-514`). So a product with a perfectly good 13-digit EAN still prints its `PRD-…` SKU unless someone edited that dropdown. Three further gaps:

- **No cross-field validation.** `labelBarcodeSource: 'MANUFACTURER'` with `barcode: null` is accepted by both schemas. The form only disables the option while the box is empty *at that moment* (`ProductFormDialog.tsx:184`); clearing the barcode later leaves a config that silently prints the SKU.
- **The single-label endpoint discards its warnings** — `ProductsService.label` returns `toLabelPayload(...).payload` and throws away `MANUFACTURER_BARCODE_MISSING` (`products.service.ts:307`). Only the bulk sheet surfaces it.
- **Format is hard-coded CODE128** (`ProductLabel.tsx:37-46`). CODE128 scans fine, but a real EAN-13/UPC-A prints and verifies better in its native symbology.

### B5. Search misses description / specifications

`products.repository.ts:52-62` searches five columns with a single un-tokenised phrase. `notes`, `specificationNotes` and the `specifications` JSON are not searched at all, and "15kg washer" is sent as one literal string, so it can only match if those exact 11 characters sit adjacent in one column. Both example queries fail by construction.

### B6. No grid view

`ProductsPage.tsx:115` renders `ProductsTable` unconditionally; `ProductsTable` shows a table at ≥lg and stacked `ProductMobileCard`s below lg. There is no view toggle and no card layout for desktop.

---

## 4. Additional bugs found by review

Ordered by severity. None of these were fixed — each has a concrete plan.

**A1 — Employees cannot edit any product that has pricing configured. (High)**
`pricingChanged` is computed for every user (`ProductFormDialog.tsx:82`), and `isProductPricingChanged` compares against `product.pricing.useCustomPricing / installmentEnabled`, which the serializer exposes to non-admins, while `configuration`/`costPrice` are admin-only (`products.service.ts:593-594`). For an employee the "next" value is always the empty pricing object, so any product with `useCustomPricing` or `installmentEnabled` true reports `pricingChanged === true`. The form then demands a reason + account password from an employee (`ProductFormDialog.tsx:216`) and, on submit, calls `PATCH /pricing` which is admin-only → `403`. An employee cannot update notes on a priced product.
*Fix:* gate the pricing diff and the pricing mutation on `isAdmin` (compute `pricingChanged` as `isAdmin && …`).

**A2 — Update and archive responses return a wrong `pricing` block. (Medium)**
`ProductsService.update` returns `serializeProduct(updated)` with no default preset and `isAdmin` defaulted to `false` (`products.service.ts:217`); `setActive` does the same (`:432`). A preset-priced product therefore comes back as `pricingAvailable: false, reason: 'NO_DEFAULT_PRESET'` with no `configuration`. Harmless today only because the UI refetches, but it is an inconsistent API contract and a trap for the next consumer.
*Fix:* pass `await ProductsRepository.findActiveDefaultPricingPreset(tx)` and `user.role === Role.ADMIN`, matching `create`/`updatePricing`/`updateStock`.

**A3 — Pagination silently drops one product per page when an exact match is hoisted. (Medium)**
`products.repository.ts:64-84` fetches the exact SKU/barcode match separately, then queries the remainder with the **unchanged `skip`** but `take: take - 1`. With `pageSize` 25 and an exact match on page 1, the list shows the exact row plus items 1-24, and page 2 starts at `skip: 25` → **item 25 is never displayed**.
*Fix:* when an exact match is hoisted, keep `take` at full page size and exclude the hoisted id from the count/offset consistently, or hoist only within the already-fetched page.

**A4 — "Remove" deletes a saved image before the user saves. (Medium, data loss)**
`ProductImageField.tsx:73-83` calls `onRemoveSaved()` immediately, which fires the `DELETE` mutation (`ProductFormDialog.tsx:156-162`). Clicking Remove and then Cancel has already destroyed the uploaded bytes irreversibly.
*Fix:* stage the removal in form state and apply it on submit, or confirm inline ("Remove now — this cannot be undone").

**A5 — Custom pricing can fail on fields that visibly show a value. (Medium)**
The preview override inputs display computed fallbacks (`ProductFormPricingPanel.tsx:42-44`) but write to state keys that stay empty until edited (`:129-131`). `pricingConfigurationInput` reads that empty state (`ProductFormDialog.tsx:343-345`). The seeding path `customValuesFromPreset` only runs if the presets query has already resolved when the user ticks the box (`ProductFormPricingPanel.tsx:61-67`). Lose that race and the backend rejects `customInstallmentMonths` as "Required when custom pricing is enabled" while the field on screen shows `12`.
*Fix:* make the fields controlled by real state (seed state from the effective preset in an effect) so displayed value === submitted value.

**A6 — `labelBarcodeSource: MANUFACTURER` with no barcode is accepted.** See B4; the validator has no cross-field rule (`products.validator.ts:99-128`).

**A7 — Sorting by "Price" sorts the legacy column.** `sortBy: 'price'` (`products.validator.ts:149`) orders by `Product.price`, which is null for preset-priced products, while the table shows the calculated cash price. The sort looks broken to the user. Calculated cash price is not stored, so it cannot be sorted in SQL — relabel the option "Manual price / السعر اليدوي" or remove it.

**A8 — Latent permission holes.** (a) `hasProductPricingInput` (`products.service.ts:682-684`) has the same `false !== null` flaw as B1a, so any future non-admin create that includes the booleans would be rejected as a pricing change. (b) `PRODUCT_FIELD_POLICY` has no `installmentEnabled` key (`service-policy.ts:7-35`), so `containsSensitiveProductFields(['installmentEnabled'])` is `false`. Harmless while installment only travels on the admin-gated pricing endpoint; a hole the moment that changes.

**A9 — Single-label print page cannot warn.** See B4; fold into CP4.

**Verified clean (do not churn):** money is Decimal-safe end-to-end (`moneyToApiString` in `serializeProduct`, `netPrice` derived server-side); the label payload is an allow-list that cannot leak cost/installment/profit (`products.service.ts:508-536`); broken external images already degrade to an `ImageOff` tile and missing images to a placeholder (`ProductImageView.tsx:29-68`); Arabic text uses `dir="auto"` + `.user-text` consistently in the table, card and drawer; `imageUrl` and `notes` are correctly non-sensitive in `PRODUCT_FIELD_POLICY`, so cosmetic edits do not demand an admin password.

---

## 5. Installment-off fix plan

**Backend — `backend/src/features/service/products/products.validator.ts`**

1. Replace the ad-hoc boolean test in `validateCustomPricing` with an explicit list of "value" fields:
   ```ts
   const PRICING_VALUE_FIELDS = ['costPrice','pricingPresetId','customExpensePercent',
     'customProfitPercent','customDiscountBufferPercent','customInstallmentMarkupPercent',
     'customDownPaymentPercent','customInstallmentMonths','customCalculationMode'] as const;
   const hasPricingConfiguration =
     PRICING_VALUE_FIELDS.some((f) => values[f] != null) ||
     values.useCustomPricing === true || values.installmentEnabled === true;
   ```
   `useCustomPricing: false` + `installmentEnabled: false` + everything null must mean "no pricing configured" and must not require a cost price.
2. Keep the existing rule that `useCustomPricing === true` requires the three cash percents + calculation mode, and requires the three installment fields **only when `installmentEnabled === true`** (already correct at `:187-192`).
3. Apply the same fix to `hasProductPricingInput` (`products.service.ts:682-684`) so the admin gate on create matches.
4. `assertCompleteCustomPricing` (`products.service.ts:712-719`) is already correctly gated on `installmentEnabled` — leave it.

**Frontend — `ProductFormDialog.tsx` / `ProductFormPricingPanel.tsx`**

5. Only run `productPricingPreviewOverridesSchema` when `pricing.installmentEnabled` is true (`ProductFormDialog.tsx:108-114`), so hidden stale values cannot block Save.
6. When `installmentEnabled` is false, render "Installments not offered / التقسيط غير متاح" in place of the preview block and keep the cash-price preview visible (`PricingPreviewCard` already receives `showInstallment={value.installmentEnabled}`).
7. Any pricing error whose field is not currently rendered must still surface in the dialog-level error banner — extend `normalizeProductError`/`product-form-errors.ts` handling so no validation failure can be invisible.
8. Toggling installment off must clear `previewInstallmentMonths/DownPaymentPercent/InstallmentMarkupPercent` state (or the submit builder must ignore them), so a stale value cannot travel in the payload.

Installment stays a per-product feature; nothing is removed.

---

## 6. Manual / legacy pricing mode plan

**Recommendation: derive the mode in the serializer first; do not add a DB enum in this pass.**

Rationale: every existing row maps cleanly to a mode from data it already has, so a derived value ships with zero migration risk and cannot break existing products. A persisted enum only earns its place once the business needs "manual price *overrides* the calculated price" as a contract other modules obey — and that touches sales orders, which are out of scope here (see Open Decision D1).

**Derivation** (add to `serializeProduct`, returned as `pricing.mode`):

| Condition | Mode |
|---|---|
| `costPrice != null && useCustomPricing` | `CUSTOM` |
| `costPrice != null && !useCustomPricing` | `PRESET` (preset or default preset) |
| `costPrice == null && price != null` | `MANUAL` |
| neither | `NONE` |

**Form** — replace the implicit behaviour with an explicit 3-way selector at the top of the pricing section: *Preset formula / Custom formula / Manual price*. The selector writes only existing fields:

- `PRESET` → require `costPrice`, allow `pricingPresetId`, force `useCustomPricing: false`, clear `custom*`.
- `CUSTOM` → require `costPrice` + the three cash percents + mode (+ installment trio only when installment is on).
- `MANUAL` → require `price`; send `costPrice: null`, `pricingPresetId: null`, `useCustomPricing: false`, `installmentEnabled: false`, all `custom*: null`. Manual discount and notes stay available. Never demands preset fields.

Take the legacy fields out of the collapsed `<details>` and show them as the Manual mode body; keep them visible read-only in other modes so a stray legacy price is never hidden from an admin.

**Compatibility guardrails**

- Do not drop, rename or stop writing `price`/`discount`. `netPrice`, the drawer, the table fallback and `ProductPicker` all read them.
- Keep the existing "manual differs from calculated" amber hint (`ProductsTable.tsx:210-214`, `ProductMobileCard.tsx:68-72`) — with an explicit mode it becomes actionable instead of ambient.
- Switching a product to `MANUAL` nulls pricing columns, which is a sensitive change: it already routes through `PATCH /pricing` with reason + password and is audited by `changedSnapshot`. No new audit plumbing needed.

---

## 7. Image URL persistence fix plan

**Root cause is confirmed; the fix is one line plus tests.**

1. `products.service.ts:57-74` — add `imageUrl: input.imageUrl ?? null` to the `ProductsRepository.create` payload, next to `notes`.
2. Consider tightening the type so this class of omission is caught: build the create payload from an explicitly typed `Prisma.ProductUncheckedCreateInput` object literal (it already is) — the real guard is the test in CP7, since Prisma's create input makes every optional field optional.
3. Confirm (no change expected) that after the fix the create audit snapshot records the URL — `productSnapshot` already includes `imageUrl` (`products.service.ts:647`).
4. No change needed on: validator (`:72`), controller, `productUpdateData` (`:484`), `serializeProduct`/`serializeProductImage` (`:565-576,616-617`), query invalidation (`useProducts.ts:92`), or form defaults (`ProductFormDialog.tsx:62`).
5. While here, apply A4 (staged image removal) so the image section as a whole behaves predictably.

**Trace checklist for CP1 verification** — form state ✅ holds URL → payload ✅ contains `imageUrl` → validator ✅ passes it → **service ✗ drops it** → Prisma create writes null → serializer returns null → refetch shows empty. One broken link, at the service.

---

## 8. Numeric barcode label-source plan

**Recommended approach: Option A (SKU fallback) with an explicit `AUTO` preference and a visible warning.** Rejecting the alternatives on record: Option B (block rendering) would make unbarcoded stock unprintable, which a local shop cannot accept; Option C (generate an internal numeric barcode) risks colliding with real GS1 ranges and duplicates what the SKU already does. If C is ever wanted, it must use the GS1 in-store range (prefix 20-29) — out of scope now.

**Model** — add `AUTO` to `enum LabelBarcodeSource` (`schema.prisma:222-225`) and make it the column default for new products. Additive enum value + default change; existing rows keep their stored value.

**Resolution** — in `toLabelPayload` (`products.service.ts:508-536`):

```
AUTO         → numeric/manufacturer barcode if present, else SKU  (+ warning FALLBACK_TO_SKU)
MANUFACTURER → barcode if present, else SKU (+ existing MANUFACTURER_BARCODE_MISSING)
SKU          → SKU, always
```
Keep returning `barcodeSource` in the payload as the **resolved** source (`MANUFACTURER | SKU`) so the renderer's display rules stay a pure function of the payload.

**Validation** (`products.validator.ts`)

- Keep `barcode` accepting `[A-Za-z0-9-]{4,64}` — some suppliers use alphanumeric codes; "prefer numeric" is a *preference*, not a restriction.
- Add a cross-field refinement: `labelBarcodeSource === 'MANUFACTURER'` requires a non-null barcode. On update this must consider the persisted value, so enforce it in `ProductsService.update` against `{...existing, ...input}` (same shape as `assertDiscountWithinPrice` at `:194-197`).
- Keep the barcode uniqueness conflict mapping (`mapProductError`) unchanged.

**Rendering** (`ProductLabel.tsx:37-46`)

- Choose symbology from the value: 13 digits + valid checksum → `EAN13`; 12 digits → `UPC`; 8 digits → `EAN8`; otherwise `CODE128`. On a JsBarcode throw, retry once as CODE128 before falling back to the plain-text line (`:12-13`).
- `displayValue` stays `source === 'MANUFACTURER'` — the resolved source. The SKU is still never printed in the clear under the bars, and `staffLabelCode` behaviour is untouched.
- Cash price on the label stays behind `includePrice`; nothing in this change alters what the label may expose.

**Warnings** — return `{ payload, warnings }` from `ProductsService.label` and surface them on `ProductLabelPage` / `ProductLabelPanel` the way `ProductLabelsPage` already does for the sheet. Add `FALLBACK_TO_SKU` to `ProductLabelWarningCode` in both `products.service.ts:492` and `product.types.ts:58-62`.

**Form** — replace the two-option select (`ProductFormDialog.tsx:184`) with three options, default `AUTO` ("Numeric barcode when available / الباركود الرقمي عند توفره"), and show the resolved value inline ("Will print: 6291041500213" / "Will print: SKU — no barcode saved").

**Migration decision (D2, needs user sign-off):** existing rows all say `SKU` because that was the column default, not because anyone chose it. A data migration flipping `SKU → AUTO` where the row was never explicitly changed would deliver the requested behaviour immediately; leaving them means editing each product. Recommended: flip rows whose `labelBarcodeSource = 'SKU'` **and** which have a non-null barcode, in the same migration, and note it in the release notes. Follow the existing in-place upgrade convention — add the SQL to `backend/prisma/repair/` and register it in `backend/prisma/repair/manifest.json`.

---

## 9. Product search improvement plan

**Do not build a new search mechanism — finish the v1.0.9 one.** `backend/src/lib/search-query.ts` already provides parameterised, tokenised, Arabic-normalised, trigram-backed id lookup with a frozen identifier allowlist, and `20260801092000_add_search_indexes` already created trigram indexes on `products.name/model/brand`. Products were simply never registered.

**Step 1 — register the target** in `SEARCH_TARGETS` (`search-query.ts:51-76`):

```ts
product: {
  table: Prisma.sql`products`,
  baseFilter: null,                     // isActive stays a Prisma filter
  textColumns: [
    Prisma.sql`name`, Prisma.sql`model`, Prisma.sql`brand`,
    Prisma.sql`sku`, Prisma.sql`barcode`, Prisma.sql`notes`,
    Prisma.sql`"specificationNotes"`,
    Prisma.sql`specifications::text`,   // JSON array of {label,value}
  ],
  phoneColumns: [],
}
```
Note the quoted camelCase identifiers — Prisma maps the model to `products` but does not snake_case field names.

**Step 2 — token AND semantics.** `findSearchMatchIds` currently tokenises only for `customer` (`:105-107,143`). Generalise to a per-target `tokenMode: 'AND' | 'PHRASE'` and give `product` the `AND` mode. That yields exactly the requested behaviour: `"no frost fridge"` → three tokens, each must match *some* searchable column, in any order, across different columns — `no`+`frost` from the specifications, `fridge` from the name.

**Step 3 — unit-token handling** so `"15kg washer"` works whether the spec says `15kg` or `15 kg`: for a token matching `^(\d+(?:[.,]\d+)?)([a-z؀-ۿ]{1,6})$`, emit an OR of `%15kg%` and `%15 kg%`. Small, deterministic, and it covers kg / l / w / kw / cm / inch / بوصة / كغ.

**Step 4 — wire into the repository** (`products.repository.ts:38-85`): call `findSearchMatchIds('product', params.search)`; `null` → no search filter (unchanged), `[]` → return `{ items: [], total: 0 }`, otherwise add `{ id: { in: ids } }` to the existing `where`. Filtering, sorting, pagination, includes and serialization all stay in Prisma, so nothing about the response shape changes. Keep the exact SKU/barcode hoist, but fix A3 while touching this code.

**Step 5 — indexes.** The new query calls `hc_search_normalize(col)`, which the existing *plain-column* product indexes do not serve. Add normalized expression indexes mirroring the customer/supplier pattern:
```sql
CREATE INDEX IF NOT EXISTS products_name_norm_trgm_idx ON products USING gin (hc_search_normalize(name) gin_trgm_ops);
-- model, brand, sku, barcode, notes, "specificationNotes", specifications::text
```
Additive and idempotent; add to `prisma/repair/` + manifest per the existing convention.

**Accuracy notes for the implementer**

- The `%` (similarity) condition is only added for tokens ≥3 chars (`supportsTrigramSearch`) and will rarely fire against long `notes`/`specifications` text — similarity between a short token and a long document is below the default 0.3 threshold. The substring `LIKE` on the normalized column is what carries description matching; that is intended and sufficient.
- Arabic works through `hc_search_normalize` (tashkeel stripped, alef/yeh/teh-marbuta folded) on both sides. Arabic-Indic digits (٠-٩) are **not** folded today — out of scope unless the user asks; note it rather than editing the append-only SQL function (a change there requires a `_v2` and index migration).
- `MAX_SEARCH_IDS` (2000) caps the `IN (…)` list; fine for a single-shop catalogue.
- No external search engine, no Meilisearch/Typesense, no `$queryRawUnsafe`.

**Side effect to check:** `ProductPicker` and sales-orders' `ProductLinePicker` call the same list endpoint. Broader recall is desirable there too, but confirm the pickers still rank exact SKU/barcode scans first (they rely on `exactMatch`).

---

## 10. Grid / ecommerce-style product page plan

**Layout target**

```
[Active | Archived]                                    [+ Add Product]
[ search ........ ][ brand ][ barcode ][ sort ][ order ]      [▤ | ▦]
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│  image   │ │  image   │ │  image   │ │  image   │   1-4 cols responsive
│ name     │ │          │ │          │ │          │
│ model·brand
│ SKU / barcode
│ cash price   [preset chip] [stock badge]
│ [view][edit][print][archive]
└──────────┘ …
```

**Components**

- `ProductGrid.tsx` (new) — responsive `grid` (`sm:2 lg:3 xl:4`), renders `ProductCard`.
- `ProductCard.tsx` (new) — extracted from `ProductMobileCard.tsx`, which already encodes the right content and safety rules (image, name/model/brand, SKU + barcode, cash-price-with-manual-fallback, manual-differs hint, preset/custom chip, admin-only cost, status + stock badges, view/edit/print/archive actions). Give it a `variant: 'list' | 'grid'` prop rather than duplicating the logic, and keep `ProductMobileCard` as `variant="list"` so the <lg breakpoint is unchanged.
- `ProductsTable.tsx` — unchanged; still the ≥lg default.
- `ProductsPage.tsx` — add a toggle in the filter row, `?view=table|grid` in the URL (consistent with how `search`/`status`/`sort` already live in `useSearchParams`) with `localStorage` as the sticky default. Table stays the default so admin efficiency is untouched.

**Rules**

- Selection checkboxes and `ProductBulkActionsBar` must work identically in both views (bulk label printing depends on it).
- Image: `ProductImageView` already handles URL vs upload, placeholder and broken-image states — reuse it, `fit="cover"`, fixed aspect box (`aspect-square`), never stretch.
- Price shown on a card is the same value the table shows: calculated cash price, else manual price, else `—`. Cost price stays admin-only (`canAdmin` prop), matching `ProductMobileCard.tsx:96-100`.
- Loading / empty / error states reuse the three existing branches in `ProductsPage.tsx:113-116` — add a skeleton grid for the loading branch so the toggle does not flash a table-shaped spinner.
- Keep the design restrained: same slate/emerald palette, same badge components, no new shadows or gradients.

---

## 11. Backend fix plan (file by file)

| File | Change |
|---|---|
| `products.service.ts:57-74` | **B3** — persist `imageUrl` on create |
| `products.service.ts:217, 432` | **A2** — pass default preset + admin flag to `serializeProduct` |
| `products.service.ts:302-308` | **B4/A9** — return label warnings from the single-label endpoint |
| `products.service.ts:508-536` | **B4** — `AUTO` resolution + `FALLBACK_TO_SKU` warning |
| `products.service.ts:578-626` | **B2** — add derived `pricing.mode` |
| `products.service.ts:682-684` | **A8a** — fix `hasProductPricingInput` boolean test |
| `products.service.ts` (update) | **A6** — assert `MANUFACTURER` ⇒ barcode present, against `{...existing, ...input}` |
| `products.validator.ts:181-193` | **B1a** — fix `hasPricingConfiguration` |
| `products.validator.ts:99-128` | **A6** — cross-field label-source refinement on create |
| `products.validator.ts:149` | **A7** — relabel/remove the `price` sort option |
| `products.repository.ts:38-85` | **B5** — id prefilter via `findSearchMatchIds`; **A3** — pagination fix |
| `lib/search-query.ts:51-76,105-107,143` | **B5** — `product` target + per-target token mode |
| `service-policy.ts:7-35` | **A8b** — add `installmentEnabled: true` |
| `schema.prisma:222-225,640` | **B4** — `AUTO` enum value + default |
| new migration + `prisma/repair/*` + `manifest.json` | **B4** enum/default (+ optional data flip, D2); **B5** normalized trigram indexes |

Expected API behaviour after these changes: `imageUrl` round-trips on create and update; installment-disabled payloads validate; a manual-priced product saves with no cost price; `pricing.mode` is present on every product; label payload resolves numeric barcode first and reports fallback; search covers description/specifications with token AND; money stays Decimal-safe strings; the label payload allow-list is unchanged.

## 12. Frontend fix plan (file by file)

| File | Change |
|---|---|
| `ProductFormDialog.tsx:82,148` | **A1** — gate pricing diff/mutation on `isAdmin` |
| `ProductFormDialog.tsx:108-114` | **B1b** — validate preview overrides only when installment is on |
| `ProductFormDialog.tsx:184` | **B4** — three-option label-source select, default `AUTO`, show resolved value |
| `ProductFormDialog.tsx:202-208, 308-348` | **B2** — explicit pricing-mode selector; manual mode sends null pricing |
| `ProductFormPricingPanel.tsx:42-44,125-133` | **B1b/A5** — controlled preview fields; "Not offered" state when installment is off |
| `ProductImageField.tsx:73-83` | **A4** — stage image removal until save |
| `utils/product-form-errors.ts` | surface errors for fields that are not currently rendered |
| `ProductsPage.tsx` | **B6** — `?view=` toggle, grid branch, skeleton |
| `ProductGrid.tsx`, `ProductCard.tsx` (new) | **B6** |
| `ProductMobileCard.tsx` | **B6** — become `variant="list"` of `ProductCard` |
| `ProductFilters.tsx:21` | **B5** — placeholder copy: search also covers description/specs |
| `ProductLabel.tsx:12-13,37-46` | **B4** — symbology by value shape, CODE128 retry |
| `ProductLabelPanel.tsx` / `ProductLabelPage.tsx` | **A9** — render label warnings |
| `types/product.types.ts:58-62,75` | **B4** — `AUTO`, `FALLBACK_TO_SKU`; **B2** — `pricing.mode` |
| `schemas/product.schemas.ts` | **B2** — manual mode requires `price` |

---

## 13. Admin / audit considerations

No policy change is proposed, and none is needed. Preserve exactly:

- Sensitive identity/pricing/label changes keep requiring reason + account password (`PRODUCT_FIELD_POLICY`, `verifyAdminPassword`).
- `imageUrl`, `notes`, `specifications`, `specificationNotes` stay non-sensitive so employees can maintain the catalogue.
- Pricing, SKU, stock, archive/restore stay on their admin-only endpoints, each writing a `ServiceAudit` row with before/after snapshots.
- The password is verified and discarded — it is never stored and never logged. Nothing in this plan puts `accountPassword` into state that outlives the request, into an audit snapshot, or into an error message.

Two additive adjustments:
1. `installmentEnabled: true` in `PRODUCT_FIELD_POLICY` (A8b) — closes a latent hole, changes no current flow.
2. A pricing-mode switch is already a pricing change and is already audited via `changedSnapshot`; ensure the derived `mode` is *not* written into the audit snapshot (snapshots must keep recording raw columns, not derived values).

---

## 14. Testing plan

**Backend** (`products.validator.test.ts`, `products.routes.test.ts`, `products.labels.test.ts`, `products.pricing.routes.test.ts`, `search-query.*.test.ts`)

1. Create with `installmentEnabled: false`, `useCustomPricing: false`, no cost price → 201, no cost-price error. *(B1a)*
2. Create with `useCustomPricing: true, installmentEnabled: false` and only the three cash percents + mode → 201; installment fields not required. *(B1)*
3. `PATCH /pricing` turning installment off on a product that had it on → 200; installment columns nulled; `assertCompleteCustomPricing` does not fire. *(B1)*
4. Manual mode: create with `price` only → 201, response `pricing.mode === 'MANUAL'`, `price` returned as a string. *(B2)*
5. `imageUrl` persists on create — assert the response body **and** a re-`GET`. *(B3)*
6. `imageUrl` persists on update and is unchanged when the field is absent from the payload. *(B3)*
7. Create audit snapshot records the submitted `imageUrl`, not null. *(B3/A8)*
8. Label with `labelBarcodeSource: AUTO` + numeric barcode → `barcodeValue` is the barcode, `barcodeSource: 'MANUFACTURER'`. *(B4)*
9. Label with `AUTO` + no barcode → SKU value **and** a `FALLBACK_TO_SKU` warning, on both the single and bulk endpoints. *(B4/A9)*
10. Reject `labelBarcodeSource: MANUFACTURER` with no barcode, on create and on update against the persisted row. *(A6)*
11. Search `"15kg washer"` matches a product whose name has "washer" and whose specifications contain "15 kg". *(B5)*
12. Search `"no frost fridge"` matches name "fridge" + description "no frost". *(B5)*
13. Token AND: a query where one token matches nothing returns zero rows; tokens satisfied across *different* fields still match. *(B5)*
14. Search terms with `%`/`_` are treated literally (`escapeLikePattern` regression). *(B5)*
15. Label payload key set unchanged — no `costPrice`, `installmentPrice`, profit or expense keys, and no `cashPrice` unless `includePrice=true`. *(existing assertion — must stay green)*
16. Pagination: with an exact SKU hoist on page 1, the union of page 1 and page 2 contains every product exactly once. *(A3)*
17. `PATCH /products/:id` response carries a resolved pricing block for a default-preset product. *(A2)*

**Frontend** (`products.components.test.tsx`, `ProductFormPricingPanel.test.tsx`, new `ProductCard`/grid test)

1. Add Product keeps the image URL after save + refetch. *(B3)*
2. Edit Product leaves the image URL intact when untouched. *(B3)*
3. Installment off → preview override fields hidden/disabled, "Not offered" shown, submit succeeds. *(B1b)*
4. A stale invalid preview value with installment off does not block submit. *(B1b)*
5. Manual pricing mode is selectable; selecting it hides preset/custom requirements and submits `costPrice: null`. *(B2)*
6. An employee editing notes on a product with `installmentEnabled: true` is not asked for a reason/password and no pricing request is issued. *(A1)*
7. Grid/table toggle switches views, survives reload via `?view=`, and preserves selection. *(B6)*
8. Card renders image, placeholder when absent, and the broken-image tile on error. *(B6)*
9. Label source select offers `AUTO` and shows the resolved printed value. *(B4)*
10. Label preview stays English-only (current print rule) and still hides the cash price unless enabled. *(regression)*
11. Clicking Remove then Cancel does not delete a saved image. *(A4)*

**Manual smoke (Windows app)** — create with image URL; edit without touching it; create with installment off; create manual-price-only; search "15kg washer" and "no frost fridge"; toggle grid/table; print a label for a product with an EAN and scan it; print a label for a product with no barcode and confirm the warning; edit notes as an employee.

---

## 15. What is out of scope

Inventory management and stock movement; POS, sales checkout, order logic; customers, debts, installment plans, suppliers, sales orders, maintenance jobs, dashboard, Electron packaging, unrelated financial logic; any external search engine; removal of the installment feature, the SKU, or the legacy `price`/`discount` columns; changes to admin password policy; a repository-wide refactor; version bump, installer, release notes.

---

## 16. Codex implementation checkpoints

**CP1 — Confirm, do not change.** Verify each asserted root cause in the running app: `imageUrl` absent from the create payload (`products.service.ts:57-74`); `hasPricingConfiguration` true for `useCustomPricing: false`; the hidden preview-override validation blocking submit; `pricingChanged` true for a non-admin. Report any that do not reproduce **before** writing code.

**CP2 — Image URL + installment-off + employee edit.** B3, B1a, B1b, A1, A2. No schema change, no UI restructuring. Ship with tests 5, 6, 1-3, and frontend tests 1-4, 6.

**CP3 — Pricing modes.** B2 derived `pricing.mode`, explicit mode selector, manual mode payload, A5 controlled preview fields, A8 policy/gate fixes. Verify existing products of all four shapes still render and save unchanged.

**CP4 — Numeric barcode label source.** Schema `AUTO` + default (migration + repair entry), resolution, cross-field validation (A6), warnings on the single-label endpoint (A9), symbology selection, form select. D2 (data flip for existing rows) must be answered before this lands.

**CP5 — Search.** Register the `product` target in `search-query.ts`, per-target token mode, unit-token rule, repository id prefilter, A3 pagination fix, normalized trigram index migration + repair entry. Verify the sales-order/product pickers still behave.

**CP6 — Grid view.** Extract `ProductCard`, add `ProductGrid`, toggle + URL/localStorage persistence, skeleton, selection parity. `ProductsTable` untouched.

**CP7 — Tests.** Backfill anything not shipped alongside its checkpoint; confirm the label allow-list assertion and the pricing preset suites are still green.

**CP8 — Docs and verification.** Update `claude/documentation/PRODUCT_PRICING_PRESETS.md` for pricing modes, note the label-source behaviour, run the manual smoke list, then move this plan to `claude/plans/Completed/`.

Each checkpoint is independently releasable. CP2 alone fixes the two bugs the user hits daily.

---

## 17. Risks and open decisions

**D1 — Is a persisted `pricingMode` enum needed? → DECIDED 2026-08-05: derive it.** The mode is computed in the serializer (§6); no enum, column or migration. Revisit only if a manual price must *override* a calculated one for downstream consumers (sales orders, prepaid purchases) — that is a separate, out-of-scope change.

**D2 — Flip existing rows to `AUTO`? → DECIDED 2026-08-05: yes, for rows that have a barcode.** The CP4 migration runs `UPDATE products SET "labelBarcodeSource" = 'AUTO' WHERE "labelBarcodeSource" = 'SKU' AND barcode IS NOT NULL`. Rows without a barcode, and rows already set to `MANUFACTURER`, are untouched. Note for the implementer: Postgres forbids *using* a newly added enum value in the transaction that added it, and Prisma runs each migration file in its own transaction — so this needs two migration files (add value; then default + update).

**D3 — Arabic-Indic digits in search.** Not folded today. Fixing it means a `hc_search_normalize_v2` plus index migration (the SQL function is append-only by design). Recommend deferring unless the user reports it.

**Risks**

- *Pricing regression* is the main one: `validateCustomPricing`, `assertCompleteCustomPricing`, `resolveProductPricing` and the preset suites interlock. CP2 changes only the "is any pricing configured" predicate — do not touch the calculator.
- *Search behaviour change* — moving from `contains` to normalized `LIKE` + trigram broadens recall. It is a superset of today's matching, so nothing that matched before stops matching, but scan-to-focus depends on the exact-match hoist: keep and test it.
- *Enum migration* — adding `AUTO` is additive; changing the column default is not reversible by a rollback of application code alone. Ship it with the repair-manifest entry the in-place Windows upgrade path expects.
- *Card extraction* — `ProductMobileCard` is used at <lg today; refactoring it into `ProductCard` risks a silent mobile regression. Snapshot-test the list variant before the refactor.
- *Two mutations per save* — the form already fires up to four requests sequentially (`ProductFormDialog.tsx:146-153`); a mid-sequence failure leaves a partial save. Not introduced by this plan and not fixed here, but do not make it worse by adding a fifth call.

---

## 18. Exact files likely to change

**Backend**
```
backend/prisma/schema.prisma                                   (AUTO enum value, column default)
backend/prisma/migrations/<new>/migration.sql                  (enum + default + normalized trgm indexes)
backend/prisma/repair/<new>.sql + repair/manifest.json         (in-place upgrade path)
backend/src/features/service/products/products.service.ts      (B3, B4, B2, A2, A6, A8a, A9)
backend/src/features/service/products/products.validator.ts    (B1a, A6, A7)
backend/src/features/service/products/products.repository.ts   (B5, A3)
backend/src/features/service/authorization/service-policy.ts   (A8b)
backend/src/lib/search-query.ts                                (B5 product target, token mode)
backend/src/features/service/products/products.routes.test.ts
backend/src/features/service/products/products.validator.test.ts
backend/src/features/service/products/products.labels.test.ts
backend/src/features/service/products/products.pricing.routes.test.ts
backend/src/lib/search-query.product.test.ts                   (new)
```

**Frontend**
```
frontend/src/pages/products/ProductsPage.tsx                             (B6)
frontend/src/pages/products/ProductLabelPage.tsx                         (A9)
frontend/src/features/products/components/ProductFormDialog.tsx          (B1b, B2, B4, A1)
frontend/src/features/products/components/ProductFormPricingPanel.tsx    (B1b, A5)
frontend/src/features/products/components/ProductImageField.tsx          (A4)
frontend/src/features/products/components/ProductsTable.tsx              (grid/table split only)
frontend/src/features/products/components/ProductMobileCard.tsx          (→ ProductCard variant)
frontend/src/features/products/components/ProductCard.tsx                (new)
frontend/src/features/products/components/ProductGrid.tsx                (new)
frontend/src/features/products/components/ProductFilters.tsx             (B5 copy, view toggle host)
frontend/src/features/products/components/ProductLabel.tsx               (B4 symbology)
frontend/src/features/products/components/ProductLabelPanel.tsx          (A9)
frontend/src/features/products/types/product.types.ts                    (B2, B4)
frontend/src/features/products/schemas/product.schemas.ts                (B2)
frontend/src/features/products/utils/product-form-errors.ts              (hidden-field errors)
frontend/src/features/products/components/products.components.test.tsx
frontend/src/features/products/components/ProductFormPricingPanel.test.tsx
```

**Docs**
```
claude/documentation/PRODUCT_PRICING_PRESETS.md
claude/plans/product-workflow-review-and-fix-plan.md   (this file → Completed/ at CP8)
```
