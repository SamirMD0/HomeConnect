# Codex Build Prompt — Product Workflow Fixes and Grid View

Copy everything below the line into Codex.

---

You are implementing a product-workflow correction pass in the **HomeConnect** repository — a local Windows ERP for a single appliance shop. The Products section already works; this is targeted repair plus one UI addition, not a redesign.

## Before you start

Read `claude/plans/product-workflow-review-and-fix-plan.md` in full. It contains the traced root causes, the file-by-file change table (§11–§12) and the out-of-scope list (§15). This prompt is the execution order; the plan is the reference.

The root causes below were confirmed by reading the code, not inferred. **Verify each one in CP1 before changing anything, and tell me if any fails to reproduce** — do not silently work around a finding that turns out to be wrong.

## Standing conventions (do not violate)

- Money is Prisma `Decimal` in the database and an **API string** at the boundary (`moneyToApiString` / `parseMoney`). Never a JS number.
- Audit rows are written **inside** the same transaction as the mutation (`writeServiceAudit`, `runFinancialTransaction`).
- The account password is verified and discarded. Never store it, never log it, never put it in an audit snapshot or an error message.
- Relative imports. No new dependencies — JsBarcode, zod, TanStack Query and lucide-react are already present.
- Bilingual EN/AR labels in every user-facing string, matching the existing `English / العربية` pattern. `dir="auto"` on user text.
- Reuse existing UI primitives and the slate/emerald palette. No new design language.
- Do not modify an existing test to make it pass — extend it.

## Two decisions already made by the owner

1. **Pricing mode is derived, not stored.** Add `pricing.mode` to the serializer output. Do **not** add a `pricingMode` enum, column or migration.
2. **Existing products with a barcode get flipped to `AUTO`.** The CP4 migration updates rows where `labelBarcodeSource = 'SKU'` AND `barcode IS NOT NULL`. Rows without a barcode, and rows already set to `MANUFACTURER`, are left alone.

---

## CP1 — Confirm the root causes. Change nothing.

Verify each of these and report what you found:

1. `backend/src/features/service/products/products.service.ts:57-74` — the `ProductsRepository.create` payload has no `imageUrl` key, so a URL supplied at create time is silently discarded. The update path at `:484` does map it.
2. `backend/src/features/service/products/products.validator.ts:181-186` — `hasPricingConfiguration` special-cases only `installmentEnabled`, so `useCustomPricing: false` (always sent by the form, `ProductFormDialog.tsx:308-323`) makes every admin create demand a cost price.
3. `frontend/src/features/products/components/ProductFormDialog.tsx:108-114` — `productPricingPreviewOverridesSchema` validates fields that are only rendered when installment is on (`ProductFormPricingPanel.tsx:125-133`), so Save can fail with no visible error.
4. `ProductFormDialog.tsx:82` + `products.service.ts:593-594` — `pricingChanged` is computed for non-admins from fields the serializer exposes to everyone (`useCustomPricing`, `installmentEnabled`) while `configuration` is admin-only, so any employee editing a priced product is forced into the admin-only pricing endpoint.

Stop and report before CP2.

---

## CP2 — Image URL, installment-off, employee edits

The two bugs the shop hits daily. No schema change, no UI restructuring.

**Backend**

- `products.service.ts:57-74` — add `imageUrl: input.imageUrl ?? null` to the create payload. The create audit snapshot then records the real URL (`productSnapshot` already includes the field).
- `products.validator.ts:181-193` — rewrite the "is any pricing configured" predicate so `false` booleans do not count:
  ```ts
  const PRICING_VALUE_FIELDS = ['costPrice','pricingPresetId','customExpensePercent',
    'customProfitPercent','customDiscountBufferPercent','customInstallmentMarkupPercent',
    'customDownPaymentPercent','customInstallmentMonths','customCalculationMode'] as const;
  const hasPricingConfiguration =
    PRICING_VALUE_FIELDS.some((f) => values[f] != null) ||
    values.useCustomPricing === true || values.installmentEnabled === true;
  ```
  Keep the existing rule that `useCustomPricing === true` requires the three cash percents + calculation mode, and requires the installment trio **only when `installmentEnabled === true`** (already correct at `:187-192` — do not touch it).
- `products.service.ts:682-684` — apply the same fix to `hasProductPricingInput` so the admin gate on create agrees with the validator.
- `products.service.ts:217` and `:432` — pass `await ProductsRepository.findActiveDefaultPricingPreset(tx)` and `user.role === Role.ADMIN` to `serializeProduct`, matching `create`/`updatePricing`. Today a `PATCH` response claims `pricingAvailable: false, reason: 'NO_DEFAULT_PRESET'` for a perfectly priced product.
- `service-policy.ts:7-35` — add `installmentEnabled: true` to `PRODUCT_FIELD_POLICY`.

**Frontend**

- `ProductFormDialog.tsx:108-114` — run the preview-override schema only when `pricing.installmentEnabled` is true.
- `ProductFormDialog.tsx:82,148` — compute `pricingChanged` as `isAdmin && …` and never call `updatePricing` for a non-admin.
- `ProductFormPricingPanel.tsx:125-133` — when installment is off, render "Installments not offered / التقسيط غير متاح" in place of the override block. The cash-price preview stays visible.
- Toggling installment off must clear the three `preview*` state values so nothing stale travels in the payload.
- `utils/product-form-errors.ts` — any field error whose input is not currently rendered must surface in the dialog-level banner. A save must never fail silently.
- `ProductImageField.tsx:73-83` — "Remove" currently fires the delete mutation immediately, so Remove-then-Cancel destroys the saved image with no way back. Stage the removal in form state and apply it on submit.

**Do not** touch `calculatePricing`, `resolveProductPricing` or `assertCompleteCustomPricing`. Cash price is already independent of installment inputs; the bug is purely in the "is pricing configured" predicate.

**Tests (backend):** create with `installmentEnabled:false, useCustomPricing:false` and no cost price → 201; create with custom pricing + installment off requiring only the cash percents → 201; `imageUrl` persists on create (assert the response **and** a fresh `GET`); `imageUrl` persists on update and is untouched when absent from the payload; the create audit snapshot carries the URL; a `PATCH /products/:id` response carries a resolved pricing block for a default-preset product.
**Tests (frontend):** Add Product keeps the image URL after save+refetch; Edit keeps it when untouched; installment off hides the override fields and Save succeeds; a stale invalid preview value with installment off does not block Save; an employee editing notes on a product with `installmentEnabled: true` is not asked for a password and issues no pricing request; Remove-then-Cancel does not delete a saved image.

---

## CP3 — Pricing modes (PRESET / CUSTOM / MANUAL)

**Backend** — add a derived `mode` to the `pricing` block in `serializeProduct` (`products.service.ts:578-626`):

```
costPrice != null && useCustomPricing   -> 'CUSTOM'
costPrice != null && !useCustomPricing  -> 'PRESET'
costPrice == null && price != null      -> 'MANUAL'
otherwise                               -> 'NONE'
```

It is a read-time derivation only. It must **not** appear in `productSnapshot` or `changedSnapshot` — audit snapshots record raw columns.

**Frontend** — replace the implicit behaviour with an explicit three-way selector at the top of the pricing section. It writes only existing fields:

- `PRESET` — require `costPrice`, allow `pricingPresetId`, force `useCustomPricing: false`, clear every `custom*`.
- `CUSTOM` — require `costPrice` + the three cash percents + calculation mode (+ the installment trio only when installment is on).
- `MANUAL` — require `price`; send `costPrice: null`, `pricingPresetId: null`, `useCustomPricing: false`, `installmentEnabled: false`, all `custom*: null`. Never demand preset or cost fields.

Move the legacy manual price/discount inputs out of the collapsed `<details>` (`ProductFormDialog.tsx:202-208`) and make them the Manual mode body. Keep them visible read-only in the other modes so a stray legacy price is never hidden from an admin.

Also fix `ProductFormPricingPanel.tsx:42-44,129-131`: the preview inputs display computed fallbacks while writing to state keys that stay empty until edited, and `pricingConfigurationInput` reads that empty state. Seed the state from the effective preset in an effect so the displayed value is always the submitted value — today, if the presets query resolves after the user ticks "Use custom pricing", the backend rejects `customInstallmentMonths` while the field on screen shows `12`.

**Compatibility:** do not drop, rename or stop writing `price`/`discount`. `netPrice`, the details drawer, the table fallback and `ProductPicker` all read them. Keep the existing amber "manual differs from calculated" hint.

**Tests:** manual-mode create with `price` only → 201, `pricing.mode === 'MANUAL'`, price returned as a string; each of the four modes derives correctly; an existing preset-priced product still renders and saves unchanged; the mode selector submits the right null pattern.

---

## CP4 — Numeric barcode label source

**Schema and migrations.** Add `AUTO` to `enum LabelBarcodeSource` (`schema.prisma:222-225`) and make it the column default (`:640`).

Postgres will not let you *use* a new enum value in the transaction that added it, and Prisma runs each migration file in its own transaction. **Write two migration files**: the first adds the enum value only; the second sets the column default and runs the data flip:

```sql
UPDATE products SET "labelBarcodeSource" = 'AUTO'
 WHERE "labelBarcodeSource" = 'SKU' AND barcode IS NOT NULL;
```

The same constraint applies to the business-PC repair path, and more sharply: `RepairRunner.apply` (`backend/src/features/maintenance/repair-runner.ts:113-118`) executes **every statement of one repair inside a single transaction** so a failure rolls back cleanly. A repair that adds an enum value and then uses it therefore fails with SQLSTATE 55P04. Ship **two repairs** — `…-repair-product-label-auto-enum.sql` (the `ALTER TYPE` alone) and `…-repair-product-label-auto-apply.sql` (default + data flip) — listed in that order in the manifest, since `maintenance.service.ts:158-163` applies them sequentially and each gets its own transaction.

Add each with a `backend/prisma/repair/manifest.json` entry with `repairId`, `title`, `version`, `description`, `file`, real `sha256:` checksum of the file, `requiresBackup: true`, `idempotent: true`, `requiresSuperuser: false`, `affectedTables: ["products"]`, and detection/verification queries against `pg_enum` for the `AUTO` label. Never remove an existing manifest entry.

**Resolution** — `toLabelPayload` (`products.service.ts:508-536`):

```
AUTO         -> barcode if present, else SKU  (+ warning FALLBACK_TO_SKU)
MANUFACTURER -> barcode if present, else SKU  (+ existing MANUFACTURER_BARCODE_MISSING)
SKU          -> SKU always
```

`barcodeSource` in the payload stays the **resolved** source (`MANUFACTURER | SKU`) so the renderer's display rules remain a pure function of the payload. Add `FALLBACK_TO_SKU` to `ProductLabelWarningCode` in both `products.service.ts:492` and `frontend/.../types/product.types.ts:58-62`.

**Warnings must reach the single-label page.** `ProductsService.label` currently returns `toLabelPayload(...).payload` and throws the warnings away (`:307`). Return both and render them on `ProductLabelPage` / `ProductLabelPanel` the way `ProductLabelsPage` already does for the bulk sheet.

**Validation.** Keep `barcode` accepting `[A-Za-z0-9-]{4,64}` — some suppliers use alphanumeric codes; "prefer numeric" is a preference, not a restriction. Add a cross-field rule: `labelBarcodeSource === 'MANUFACTURER'` requires a non-null barcode. On update, evaluate it against `{...existing, ...input}` inside the service (same shape as `assertDiscountWithinPrice`, `products.service.ts:194-197`), because the barcode may be persisted rather than in the payload.

**Rendering** (`ProductLabel.tsx:12-13,37-46`). Choose symbology from the value: 13 digits with a valid checksum → `EAN13`; 12 digits → `UPC`; 8 digits → `EAN8`; otherwise `CODE128`. On a JsBarcode throw, retry once as `CODE128` before falling back to the plain-text line. `displayValue` stays tied to the resolved source, so the SKU is still never printed in the clear under the bars. Do not change `staffLabelCode`, and do not add the cash price to the label — the payload allow-list stays exactly as strict as it is.

**Form** (`ProductFormDialog.tsx:184`) — three options, default `AUTO` ("Numeric barcode when available / الباركود الرقمي عند توفره"), and show the resolved result inline: "Will print: 6291041500213" or "Will print: SKU — no barcode saved".

**Tests:** `AUTO` + numeric barcode → barcode value, source `MANUFACTURER`; `AUTO` + no barcode → SKU value **and** a `FALLBACK_TO_SKU` warning on both the single and bulk endpoints; `MANUFACTURER` with no barcode is rejected on create and on update against the persisted row; the existing label-payload key-set assertion stays green (no cost, profit, expense or installment keys ever).

---

## CP5 — Search across description and specifications

**Do not build a new search mechanism.** `backend/src/lib/search-query.ts` already provides parameterised, tokenised, Arabic-normalised, trigram-backed id lookup with a frozen identifier allowlist. Products were never registered as a target, even though `20260801092000_add_search_indexes` already created trigram indexes on `products.name/model/brand`.

1. Add a `product` entry to `SEARCH_TARGETS` (`:51-76`). `baseFilter: null` — `isActive` stays a Prisma filter. Text columns: `name`, `model`, `brand`, `sku`, `barcode`, `notes`, `"specificationNotes"`, `specifications::text`. Note the quoted camelCase identifiers — Prisma maps the model to `products` but does not snake_case field names. No phone columns.
2. Generalise the customer-only token behaviour (`:105-107,143`) into a per-target `tokenMode: 'AND' | 'PHRASE'` and give `product` the `AND` mode. That is exactly the requested semantics: every query word must match some searchable column, in any order, across different columns.
3. Add a unit-token rule so `"15kg washer"` matches a spec written `15 kg`: for a token matching `^(\d+(?:[.,]\d+)?)([a-z؀-ۿ]{1,6})$`, emit an OR of `%15kg%` and `%15 kg%`.
4. Wire it into `products.repository.ts:38-85`: call `findSearchMatchIds('product', params.search)`; `null` → no search filter, `[]` → return `{ items: [], total: 0 }`, otherwise add `{ id: { in: ids } }` to the existing `where`. Filtering, sorting, pagination, includes and serialization all stay in Prisma — the response shape must not change. Keep the exact SKU/barcode hoist that scan-to-focus depends on.
5. **Fix the pagination bug while you are in this function.** `:76-83` queries the remainder with the unchanged `skip` but `take: take - 1`, so when an exact match is hoisted on page 1 the 25th product is never shown on any page. Make the union of consecutive pages contain every product exactly once.
6. Add normalized trigram expression indexes mirroring the customer/supplier pattern — `hc_search_normalize(name)`, `model`, `brand`, `sku`, `barcode`, `notes`, `"specificationNotes"`, `specifications::text` — as `CREATE INDEX IF NOT EXISTS … USING gin (… gin_trgm_ops)`, plus `ANALYZE products;`. The existing plain-column indexes do not serve the normalized expressions. Add the repair-manifest entry as in CP4.

Hard rules: `Prisma.$queryRawUnsafe` must never appear; every identifier comes from the frozen allowlist and never from a request; terms stay bind parameters with `escapeLikePattern` + `ESCAPE '\\'`. Do not edit `hc_search_normalize` — the SQL function is append-only because indexes depend on it.

Expect the `%` similarity condition to rarely fire against long `notes`/`specifications` text (a short token against a long document scores below the 0.3 threshold). The normalized substring `LIKE` is what carries description matching. That is intended — do not raise the threshold or add ranking.

**Tests:** `"15kg washer"` matches name "washer" + specification "15 kg"; `"no frost fridge"` matches name "fridge" + description "no frost"; a query with one unmatchable token returns nothing; tokens satisfied across *different* fields still match; `%` and `_` in a term are treated literally; the exact SKU/barcode hoist still ranks first; page 1 ∪ page 2 contains every product exactly once. Also confirm `ProductPicker` and the sales-order `ProductLinePicker` still behave — they call the same endpoint.

---

## CP6 — Grid view

`ProductsTable` currently renders a table at ≥lg and stacked `ProductMobileCard`s below lg. Add a desktop grid without disturbing either.

- Extract `ProductCard.tsx` from `ProductMobileCard.tsx` with a `variant: 'list' | 'grid'` prop. `ProductMobileCard` becomes `variant="list"` — snapshot-test the list variant **before** the refactor so a mobile regression cannot slip through. Do not duplicate the pricing/badge logic.
- Add `ProductGrid.tsx`: responsive `grid` (`sm:2 lg:3 xl:4`), fixed `aspect-square` image box, `ProductImageView` with `fit="cover"` (it already handles URL vs upload, placeholder and broken-image states — reuse it, do not write new image handling).
- Add the toggle to `ProductsPage.tsx` with `?view=table|grid` in the URL, consistent with how `search`/`status`/`sortBy` already live in `useSearchParams`, and `localStorage` as the sticky default. **Table stays the default.**
- Card content matches the table: image, name, model · brand, SKU + barcode, cash price (calculated → manual → `—`), pricing-mode chip, status and stock badges, and View / Edit / Print label / Archive-Restore actions. Cost price stays behind `canAdmin`.
- Selection checkboxes and `ProductBulkActionsBar` must work identically in both views — bulk label printing depends on it.
- Reuse the existing loading / empty / error branches (`ProductsPage.tsx:113-116`) and add a skeleton grid so toggling does not flash a table-shaped spinner.
- Update the search placeholder in `ProductFilters.tsx:21` to say search now covers specifications and notes.

Also relabel the `price` sort option to "Manual price / السعر اليدوي" (`ProductFilters.tsx:33`, `products.validator.ts:149`) — it sorts the legacy column, which is null for preset-priced products, so "Price" is a lie today.

**Tests:** the toggle switches views, survives reload via `?view=`, and preserves selection; a card renders the image, the placeholder when there is none, and the broken-image tile on error.

---

## CP7 — Test backfill

Anything from the per-checkpoint lists not already shipped alongside its checkpoint. Confirm the pricing-preset suites and the label allow-list assertion are still green.

## CP8 — Docs

Update `claude/documentation/PRODUCT_PRICING_PRESETS.md` for the three pricing modes and the label-source behaviour. Move `claude/plans/product-workflow-review-and-fix-plan.md` to `claude/plans/Completed/`.

---

## Do not

- Do not add a `pricingMode` enum, column or migration — the mode is derived.
- Do not remove the installment feature, the SKU, or the legacy `price`/`discount` columns.
- Do not touch `calculatePricing`, `resolveProductPricing`, or the pricing preset service.
- Do not edit `hc_search_normalize` or the existing search migrations; add new indexes only.
- Do not add cost, profit, expense, installment or price fields to the label payload.
- Do not add inventory movement, stock adjustment, POS, checkout or order logic. Do not touch customers, debts, installments, suppliers, sales orders, maintenance jobs, the dashboard, or Electron packaging.
- Do not change admin-password policy, and do not add a fifth request to the form's save sequence.
- Do not bump the version, generate an installer, or create a release folder.
- Do not add dependencies.

## Verification

Run focused tests as you go. At the end, run the full suite once:

```
npm run lint
npm run typecheck
npm test
npm run build
npm run prisma:validate
npm run rehearse:migrations
```

All six must pass. Report the real output. If something fails, fix the cause — do not skip or weaken a test.

Manual checks a human must still run — list them as outstanding in your report:

- Create a product with an image URL; confirm the image survives the save with no second edit.
- Create a product with installment off and no cost price; confirm it saves and shows a cash price if one applies.
- Create a manual-price-only product.
- Search "15kg washer" and "no frost fridge".
- Toggle grid/table.
- Print a label for a product with a 13-digit barcode and **scan the printed sticker**; print one for a product with no barcode and confirm the fallback warning.
- Edit a note on a priced product while signed in as an employee.

## Reporting

Per checkpoint: what changed, which tests cover it, and whether the behaviour matched the predicted root cause. If a finding turns out to be wrong or already handled elsewhere, say so with evidence rather than making a change to be safe. Call out anything you had to decide that this prompt did not settle.
