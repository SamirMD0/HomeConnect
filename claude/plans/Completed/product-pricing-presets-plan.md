# Product Pricing Presets / صيغ التسعير — Planning Document

**Status:** Planning only — no code, no migrations, no version bump.
**Target release:** v1.1.0 (current repo version is `1.0.8`; `v1.0.9-postgres-pgtrgm-search-plan.md` is already queued and should land first or be explicitly re-sequenced).
**Author role:** architecture + release planning.

---

## 1. Version goal

Introduce a **reusable pricing formula system** so that a product's selling prices (cash and installment) are *derived* from its real supplier cost instead of being typed by hand.

In scope for this version:

1. `PricingPreset` — named, reusable percentage formulas (صيغ التسعير), one per product type/family.
2. Product cost price + optional link to a preset + optional per-product custom percentages.
3. A **Decimal-safe pricing calculator** on the backend that produces: cash price, installment price, down payment, remaining, monthly payment.
4. **Pricing preview** UI inside product create/edit/details, and a standalone Pricing Presets management page.
5. Admin password + reason + audit on every sensitive pricing change, reusing the existing service/product policy.

Explicit non-goal: this version **does not sell anything**. It produces numbers a human reads. No debt, no installment plan, no checkout is created.

---

## 2. Business pricing workflow

Worked example (AC / مكيف, supplier cost `$300`, preset `AC`):

| Step | Formula | Value |
|---|---|---|
| Supplier / real cost | input | `300.00` |
| + expenses 10% | `300 × 1.10` | `330.00` |
| + profit 7% | `330 × 1.07` | `353.10` |
| + discount buffer 7% | `353.10 × 1.07` | `377.817` *(raw)* |
| **Cash price / سعر نقدي** | rounded 2dp | **`377.82`** |
| × installment markup 20% | `377.82 × 1.20` | **`453.38`** |
| Down payment 40% | `453.38 × 0.40` | **`181.35`** |
| Remaining | `453.38 − 181.35` | **`272.03`** |
| Monthly × 3 months | `272.03 / 3` | **`90.67`** (last month `90.69`) |

> **Corrected arithmetic.** `300 × 1.10 × 1.07 × 1.07 = 377.817`, which rounds to `377.82`. The earlier `377.55` value was inconsistent with the formula. **Decision: do not round between steps.** Compound the raw Decimal chain end-to-end and round once at the cash-price boundary.

The user-facing flow:

1. Admin creates presets once (AC, Fridge, Air Fryer, Lamp, Custom).
2. Admin creates/edits a product, enters **Real Cost Price**, picks a **Pricing Preset** (or switches on **Use Custom Pricing**).
3. The product form shows a live **Pricing Preview** panel with the full breakdown.
4. Sales staff read the preview when quoting a customer. Nothing is committed.

---

## 3. Why presets are needed (and not one global setting)

A single global percentage block fails immediately in this business:

- Margins differ by product family. A `$4` lamp and a `$300` AC cannot share a profit percent.
- Installment markup depends on how long money is tied up, which differs per product class.
- Down payment percent is a *risk* decision — higher for cheap, easily-resold goods.
- One-off deals need a per-product override without polluting the shared formula.

Presets also give three properties a global setting cannot:

- **Auditability** — "why is this product priced this way" resolves to a named preset + audit trail.
- **Bulk change** — editing the AC preset re-derives every AC preview at once (previews are computed on read, not stored — see §6).
- **Safe experimentation** — archive a preset instead of deleting; products holding the archived preset keep working with a visible warning.

`productType` on the preset is a **human label only in v1** (free text, `dir="auto"`, e.g. `مكيف / AC`). It does **not** auto-match products by category — there is no product-category table yet, and silent auto-selection would be a surprising source of wrong prices. Selection stays explicit.

---

## 4. Pricing formula decisions

Canonical definitions the whole codebase must agree on:

```
expensePercent          e   — overhead loading on cost
profitPercent           p   — target margin
discountBufferPercent   b   — headroom so a later discount does not eat profit (NOT a discount)
installmentMarkupPercent m  — uplift for paying over time
downPaymentPercent      d   — share of installment price paid up front
installmentMonths       n   — number of monthly payments
```

**Terminology, enforced in code and UI:** the `b` value is `discountBufferPercent` / **هامش الخصم**. It is *added* to the price. It is never called `discount`. The existing `Product.discount` column is a *different, real* subtractive discount (`netPrice = price − discount`) and must not be conflated with it — see §6.

**Pipeline (single source of truth, backend):**

```
cashPrice        = round( applyIncreases(cost, [e, p, b], mode) )
installmentPrice = round( cashPrice × (1 + m/100) )
downPayment      = round( installmentPrice × d/100 )
remaining        = installmentPrice − downPayment          // subtraction, never (1-d)%
monthlyPayment   = truncate2( remaining / n )
lastPayment      = remaining − monthlyPayment × (n − 1)    // absorbs the residual cent
```

Two deliberate choices:

- `remaining` is computed by **subtracting the rounded down payment**, never as `installmentPrice × (1 − d)`. This guarantees `downPayment + remaining == installmentPrice` exactly, at 2dp, always.
- The monthly payment **floors** and the **last month absorbs the remainder** (`90.67 × 2 + 90.69 = 272.03`). Never emit `n` equal payments that fail to re-sum to `remaining`. This also matches how a future InstallmentPlan feature will have to schedule rows, so the rule is decided now rather than re-litigated later.

The calculator returns the intermediate *amounts* too (expenses amount, profit amount, buffer amount) because the UI must show them. In COMPOUND mode these are the per-step deltas of the raw chain (`300→330` ⇒ expensesAmount `30.00`; `330→353.10` ⇒ profitAmount `23.10`; `353.10→377.817` ⇒ bufferAmount `24.72`), each rounded for display only. They are presentation values, and the doc/tests must say so: their rounded sum may differ from `cashPrice − cost` by up to one cent.

---

## 5. COMPOUND vs SIMPLE

Both modes ship; `COMPOUND` is the default and the business's actual behaviour.

```
COMPOUND: cash = cost × (1 + e/100) × (1 + p/100) × (1 + b/100)
SIMPLE:   cash = cost × (1 + (e + p + b)/100)
```

With `300 / 10% / 7% / 7%`: COMPOUND → `377.82`, SIMPLE → `372.00`. The gap is the cross-terms; it widens as percentages grow. SIMPLE exists because some suppliers/staff reason additively and will otherwise "correct" the system's numbers. Both are ~3 lines in the same pure function, so shipping both is cheaper than a later migration + backfill.

Stored on the preset as `calculationMode` enum (`COMPOUND | SIMPLE`), default `COMPOUND`.

### Rounding

- All arithmetic in `decimal.js` (already a transitive dep via Prisma `Decimal`). **No `number` arithmetic anywhere on the money path.**
- Rounding happens **only at output boundaries**: `cashPrice`, `installmentPrice`, `downPayment`, `monthlyPayment`. Never between compounding steps.
- Default `ROUND_HALF_UP` to 2 decimals.
- `roundingMode` enum on the preset: `NONE | NEAREST_0_50 | NEAREST_1 | CEIL_1`, default `NONE` (= plain 2dp). It applies to `cashPrice` and `installmentPrice` only; the derived down payment / remaining / monthly then follow from the already-rounded installment price.

**Recommendation:** define all four enum values in the migration and implement all four in the pure function (it is a `switch` of ~10 lines, fully unit-testable), but have the preset form default to `NONE` and label the others as advanced. Adding enum values later is a migration; adding them now is free. If the reviewer prefers strict minimalism, the fallback is enum with `NONE` only — but then plan for a follow-up migration.

---

## 6. Product data changes

Current `Product` (`backend/prisma/schema.prisma:518-543`): `name, model, barcode, brand, price?, discount?, isActive, notes, createdBy/updatedBy, timestamps`. API serialises `price`, `discount`, and a derived `netPrice` as strings via `moneyToApiString` (`products.service.ts:268-272`).

### The `price` / `discount` question — recommendation

**Keep `price` and `discount` exactly as they are. Do not repurpose, do not backfill, do not drop.**

- `price` becomes, semantically, the **manual selling price / السعر اليدوي** — an override a human typed. It stays authoritative for labels, service jobs, and prepaid purchases, all of which already read it.
- `discount` stays the **real subtractive discount** feeding `netPrice`. It is unrelated to `discountBufferPercent`.
- The **calculated cash price is not stored** in v1. It is derived on read from `costPrice` + effective preset. This is the safe choice: no stale denormalised money, no backfill, no risk of a preset edit silently diverging from stored values.

Consequences to state plainly:
- A product can show both a manual `price` and a calculated `cashPrice`. When they disagree, the UI shows both with a "manual price differs from calculated" hint. It does **not** auto-overwrite.
- A "Copy calculated cash price into manual price" button is offered in the product pricing section (writes `price`, admin-gated like any price change). Human-triggered only.
- If later versions want stored/cached calculated prices, that is an additive column + backfill job, not a rework.

**Migration safety:** every new column is nullable or has a default. Zero rows change. Existing products with no `costPrice` and no preset keep working and report `pricingAvailable: false`.

### New columns on `Product`

| Field | Type | Notes |
|---|---|---|
| `costPrice` | `Decimal? @db.Decimal(12,2)` | real supplier cost; `> 0` if provided |
| `pricingPresetId` | `String? @db.Uuid` | FK → `PricingPreset`, `onDelete: Restrict` |
| `useCustomPricing` | `Boolean @default(false)` | |
| `customExpensePercent` | `Decimal? @db.Decimal(6,3)` | |
| `customProfitPercent` | `Decimal? @db.Decimal(6,3)` | |
| `customDiscountBufferPercent` | `Decimal? @db.Decimal(6,3)` | |
| `customInstallmentMarkupPercent` | `Decimal? @db.Decimal(6,3)` | |
| `customDownPaymentPercent` | `Decimal? @db.Decimal(6,3)` | |
| `customInstallmentMonths` | `Int?` | |
| `customCalculationMode` | `PricingCalculationMode?` | keeps custom mode a real override, not silently COMPOUND |

Indexes: `@@index([pricingPresetId])`.

`Decimal(6,3)` allows `0.000 – 999.999` — enough for a 500% markup, and the 3 decimals let a preset express e.g. `7.125%`.

---

## 7. Pricing preset data model

```prisma
enum PricingCalculationMode {
  COMPOUND
  SIMPLE
}

enum PricingRoundingMode {
  NONE
  NEAREST_0_50
  NEAREST_1
  CEIL_1
}

model PricingPreset {
  id                       String                 @id @default(uuid()) @db.Uuid
  name                     String
  productType              String?
  expensePercent           Decimal                @db.Decimal(6, 3)
  profitPercent            Decimal                @db.Decimal(6, 3)
  discountBufferPercent    Decimal                @db.Decimal(6, 3)
  installmentMarkupPercent Decimal                @db.Decimal(6, 3)
  downPaymentPercent       Decimal                @db.Decimal(6, 3)
  defaultInstallmentMonths Int
  calculationMode          PricingCalculationMode @default(COMPOUND)
  roundingMode             PricingRoundingMode    @default(NONE)
  isDefault                Boolean                @default(false)
  isActive                 Boolean                @default(true)
  notes                    String?                @db.Text
  archivedAt               DateTime?
  archivedReason           String?                @db.Text
  createdById              String                 @db.Uuid
  createdBy                User                   @relation("PricingPresetCreatedBy", fields: [createdById], references: [id], onDelete: Restrict)
  updatedById              String?                @db.Uuid
  updatedBy                User?                  @relation("PricingPresetUpdatedBy", fields: [updatedById], references: [id], onDelete: Restrict)
  createdAt                DateTime               @default(now())
  updatedAt                DateTime               @updatedAt

  products Product[]

  @@index([name])
  @@index([productType])
  @@index([isActive])
  @@map("pricing_presets")
}
```

This mirrors `Supplier` (`schema.prisma:634-659`) exactly — same archive fields, same actor relations, same naming — so it needs no new conventions.

**Single-default enforcement.** Two layers:

1. `POST /:id/set-default` runs in a transaction: clear `isDefault` on all rows, set it on the target.
2. A partial unique index, added as raw SQL in the migration. Note this schema does **not** use `@map` on columns, so Postgres column names are camelCase and must be quoted:

```sql
CREATE UNIQUE INDEX "pricing_presets_single_default"
  ON "pricing_presets" ("isDefault")
  WHERE "isDefault" = true AND "archivedAt" IS NULL;
```

Archiving the default preset must clear `isDefault` in the same transaction, otherwise the index is fine but products silently lose their fallback with no signal. The archive endpoint should refuse to archive the default preset unless another preset is promoted first — clearer than a silent clear. (Flagged in §18 as a decision, recommendation: **refuse**.)

### Audit

**Reuse `ServiceAudit`** (`schema.prisma:609-631`). It is already generic: `recordType`/`recordId` + nullable `serviceJobId` + `beforeValues`/`afterValues` JSON + reason + actor + `requestId`/`ipAddress`. Products already write to it.

Migration adds one enum value and one action:

```prisma
enum ServiceAuditRecordType {
  PRODUCT
  SERVICE_JOB
  PRICING_PRESET   // new
}

enum ServiceAuditAction {
  ... existing ...
  SET_DEFAULT      // new
}
```

`CREATE`, `UPDATE_DETAILS`, `CHANGE_PRICE`, `ARCHIVE`, `RESTORE` already exist and cover the rest. **No new audit table.** Product pricing-field changes audit as `recordType: PRODUCT, action: CHANGE_PRICE`, which is already the semantically correct bucket.

---

## 8. Backend API plan

Existing conventions observed: `/api/v1/<kebab-plural>`, `requireAuth` mounted in `app.ts`, `Router()` per feature, `validate(schema, 'query'|'params'|'body')` middleware, action verbs as `POST /:id/<verb>`, admin-only routes guarded with `requireServiceAdmin`.

### Feature placement

New top-level backend feature, mirroring `features/suppliers/`:

```
backend/src/features/pricing/
  index.ts
  domain/
    pricing-percent.ts          // percent parsing/validation, Decimal
    pricing-calculator.ts       // PURE function, no I/O, no Prisma
    pricing-calculator.test.ts
    pricing-errors.ts
    pricing-types.ts
  authorization/
    pricing-policy.ts           // PRICING_PRESET_FIELD_POLICY, requirePricingAdmin
    pricing-policy.test.ts
  presets/
    pricing-presets.controller.ts
    pricing-presets.repository.ts
    pricing-presets.routes.ts
    pricing-presets.routes.test.ts
    pricing-presets.service.ts
    pricing-presets.service.test.ts
    pricing-presets.validator.ts
    pricing-presets.validator.test.ts
  calculator/
    pricing-calculator.controller.ts
    pricing-calculator.routes.ts
    pricing-calculator.routes.test.ts
    pricing-resolution.ts       // product → effective config resolution
    pricing-resolution.test.ts
```

Product-scoped pricing endpoints live in the **existing** `features/service/products/` files so they reuse `PRODUCT_FIELD_POLICY`, product audit, and the product repository.

### Endpoints

**Presets** — `app.use('/api/v1/pricing-presets', requireAuth, pricingPresetsRoutes)`

| Method | Path | Guard | Notes |
|---|---|---|---|
| `GET` | `/` | auth | list; `?search=&productType=&isActive=&sortBy=&sortOrder=&page=&pageSize=` |
| `POST` | `/` | admin + reason | create |
| `GET` | `/:presetId` | auth | detail |
| `PATCH` | `/:presetId` | admin + reason + **password if sensitive** | partial update |
| `POST` | `/:presetId/archive` | admin + reason + password | refuses if `isDefault` |
| `POST` | `/:presetId/restore` | admin + reason + password | |
| `POST` | `/:presetId/set-default` | admin + reason + password | transactional |
| `GET` | `/:presetId/audit` | admin | mirrors `GET /products/:id/audit` |

Route ordering matters: `/:presetId/...` action routes must be registered before the bare `GET /:presetId`, matching `products.routes.ts`.

**Ad-hoc calculator** — `app.use('/api/v1/pricing', requireAuth, pricingCalculatorRoutes)`

| Method | Path | Guard | Notes |
|---|---|---|---|
| `POST` | `/calculate` | auth | stateless; body = `{ costPrice, presetId? , overrides?, installmentMonths? }`; no persistence, no audit |

`POST` (not `GET`) because the payload is a structured object with ~8 fields; it is still read-only and must not write anything.

**Product pricing** — extends existing `productsRoutes`

| Method | Path | Guard | Notes |
|---|---|---|---|
| `GET` | `/:productId/pricing-preview` | auth | `?installmentMonths=` optional override |
| `PATCH` | `/:productId/pricing` | admin + reason + password | writes cost/preset/custom fields only |

`PATCH /:productId/pricing` is separate from `PATCH /:productId` so the pricing field policy, password requirement, and audit action are unambiguous, and so the generic product update path is not widened.

### Response shape (money as strings, always)

```jsonc
// GET /api/v1/products/:id/pricing-preview
{
  "success": true,
  "data": {
    "pricingAvailable": true,
    "source": "PRESET",              // PRESET | CUSTOM | DEFAULT_PRESET
    "preset": { "id": "...", "name": "AC / مكيف", "isArchived": false },
    "calculationMode": "COMPOUND",
    "roundingMode": "NONE",
    "inputs": {
      "costPrice": "300.00",
      "expensePercent": "10.000",
      "profitPercent": "7.000",
      "discountBufferPercent": "7.000",
      "installmentMarkupPercent": "20.000",
      "downPaymentPercent": "40.000",
      "installmentMonths": 3
    },
    "breakdown": {
      "expensesAmount": "30.00",
      "profitAmount": "23.10",
      "discountBufferAmount": "24.45"
    },
    "cashPrice": "377.82",
    "installment": {
      "installmentPrice": "453.38",
      "downPayment": "181.35",
      "remaining": "272.03",
      "monthlyPayment": "90.67",
      "lastInstallmentPayment": "90.69",
      "installmentMonths": 3
    },
    "warnings": []                    // e.g. ["PRESET_ARCHIVED"]
  }
}
```

When pricing cannot be computed the endpoint returns `200` with `pricingAvailable: false` and a machine-readable `reason` (`MISSING_COST_PRICE` | `MISSING_PRESET` | `NO_DEFAULT_PRESET` | `INCOMPLETE_CUSTOM_PRICING`) — not a `404`/`400`. A product without pricing is a normal state, not an error, and the UI needs to render a specific message per reason.

---

## 9. Pricing calculator plan

`pricing-calculator.ts` exports **one pure function** with no Prisma, no I/O, no clock:

```ts
export interface PricingConfig {
  expensePercent: Decimal;  profitPercent: Decimal;  discountBufferPercent: Decimal;
  installmentMarkupPercent: Decimal;  downPaymentPercent: Decimal;
  installmentMonths: number;
  calculationMode: PricingCalculationMode;
  roundingMode: PricingRoundingMode;
}
export function calculatePricing(costPrice: Decimal, config: PricingConfig): PricingResult;
```

Rules it must encode:

1. Raw compounding chain, **no intermediate rounding**.
2. Round `cashPrice` once (2dp `ROUND_HALF_UP`, then `roundingMode`).
3. `installmentPrice` from the **rounded** cash price.
4. `remaining = installmentPrice − downPayment` (subtraction).
5. `monthlyPayment` floors; `lastInstallmentPayment` absorbs the residual.
6. `installmentMonths >= 1`; `n = 1` ⇒ `monthlyPayment == lastInstallmentPayment == remaining`.
7. `downPaymentPercent = 100` ⇒ `remaining = 0.00`, `monthlyPayment = 0.00`.
8. `costPrice = 0` is rejected upstream, but the function must still be total (return zeros, not `NaN`).

Money helpers: reuse `backend/src/features/financial/domain/money.ts` (`parseMoney`, `moneyToApiString`, `subtractMoney`, `compareMoney`). It currently has **no multiply/divide** — add `multiplyMoney` and `divideMoney` there (shared, tested in the existing money test file) rather than growing a second money vocabulary inside `pricing/`.

`pricing-resolution.ts` handles product → config:

```
if (product.useCustomPricing)            → CUSTOM        (all custom fields required)
else if (product.pricingPresetId)        → PRESET        (warn if archived)
else if (a default active preset exists) → DEFAULT_PRESET
else                                     → unavailable: NO_DEFAULT_PRESET
```

**Custom pricing is all-or-nothing.** When `useCustomPricing = true`, all six custom percents + months are required by the validator. Per-field fallback to the preset was considered and rejected: a half-filled override produces a price nobody can explain from the UI. To keep this frictionless, the product form **pre-fills all custom fields from the currently selected preset** the moment the toggle is switched on, so the user edits rather than types from scratch. (Alternative recorded in §18.)

An archived preset still calculates, with `warnings: ["PRESET_ARCHIVED"]`. Refusing would silently break existing products the moment a preset is archived.

---

## 10. Product integration plan

- `products.service.ts` gains `updatePricing()` and `getPricingPreview()`; the existing `toProductResponse` gains a nullable `pricing` summary object (`costPrice`, `pricingPresetId`, `presetName`, `useCustomPricing`, `cashPrice`) so list/table views can show a cash-price column **without an N+1 preview call per row**. The list repository query must `include` the preset and compute in-process from already-loaded rows.
- Full breakdown (installment section) is only fetched on the detail/edit view.
- `PRODUCT_FIELD_POLICY` in `service-policy.ts` gains all new pricing fields as `true` (sensitive): `costPrice`, `pricingPresetId`, `useCustomPricing`, and all `custom*` percents/months.
- Product archive/restore is unchanged. Deleting a preset is not offered — archive only, and the FK is `Restrict`.

---

## 11. Admin password / audit policy

Reuse `backend/src/lib/admin-verification.ts` (`verifyAdminPassword`) and `writeServiceAudit` — the exact pattern already used by `products.service.ts:9` and `service-jobs.service.ts:9`.

**Requires admin role + admin password + reason (min 5 chars):**

- creating or changing any percent on a preset
- changing `calculationMode` / `roundingMode` / `defaultInstallmentMonths`
- archiving / restoring / setting-default a preset
- changing a product's `costPrice`
- changing a product's `pricingPresetId` or `useCustomPricing`
- changing any product `custom*` pricing value

**Requires admin role + reason only (no password):** editing preset `name`, `productType`, `notes`.

**No admin gate at all (read-only):** `GET /pricing-presets`, `GET /:id`, `GET /products/:id/pricing-preview`, `POST /pricing/calculate`. Pricing *previews* must be readable by ordinary staff or the feature is useless at the counter.

Non-negotiables:
- The admin password is **never stored, never logged, never echoed**, never placed in `beforeValues`/`afterValues`, and must be listed in `backend/src/lib/redaction.ts` coverage for the new routes.
- Password verification and the mutation happen in the **same transaction**, matching the existing product flow.
- Every sensitive mutation writes exactly one `ServiceAudit` row with before/after values of the changed fields only.

---

## 12. UI/UX plan

### 12.1 Pricing Presets page

Route `/pricing-presets` in `App.tsx`, nav entry in `layouts/DashboardLayout.tsx` (grouped near Products). Page at `frontend/src/pages/pricing/PricingPresetsPage.tsx`.

Follows the existing Products page structure exactly: filters bar + responsive table + mobile card list + form dialog + archive/restore dialogs.

Table columns: Name · Product Type · Expenses % · Profit % · Buffer % · Installment % · Down Payment % · Months · Mode · Default badge · Status badge · Actions.
On narrow screens the table collapses to `PricingPresetMobileCard`, mirroring `ProductMobileCard`.

Filters: search (name/type), `isActive`, product type, sort.
Row actions: Edit · Set as default · Archive/Restore · View audit (admin).
Empty state: "No pricing presets yet / لا توجد صيغ تسعير" + primary create button.

### 12.2 Preset form dialog

Two-column responsive grid, percent inputs with a `%` suffix adornment, numeric-string values (never `type=number` float binding — string in, string out).

A **live mini-preview** inside the form: a sample cost input (defaults `100.00`) showing what the preset produces. This is the single highest-value UX element — it turns abstract percentages into a number the admin can sanity-check before saving. It calls `POST /api/v1/pricing/calculate` (debounced ~300ms), so it is backend-authoritative.

### 12.3 Product pricing section

New collapsible section inside `ProductFormDialog` and `ProductDetailsDrawer`:

- **Real Cost Price / السعر الحقيقي** (money input)
- **Pricing Preset / صيغة التسعير** (searchable select, archived presets shown greyed with a warning)
- **Use Custom Pricing / تسعير مخصص** (switch; enabling pre-fills the six custom fields from the selected preset)
- Custom percent fields (shown only when the switch is on)
- **Pricing Preview / معاينة السعر** card

Preview card layout — cost → additions → cash price → installment block:

```
Cost / التكلفة                     300.00
+ Expenses 10% / المصاريف           30.00
+ Profit 7% / الربح                 23.10
+ Discount Buffer 7% / هامش الخصم   24.45
─────────────────────────────────────────
Cash Price / السعر النقدي          377.82      ← emphasised
─────────────────────────────────────────
Installment Price / سعر التقسيط    453.38
Down Payment 40% / الدفعة الأولى   181.35
Remaining / المتبقي                272.03
Monthly × 3 / القسط الشهري          90.67      (last / الأخير 90.69)
```

Behaviour:
- Preview values always come from the backend. The frontend performs **no authoritative money arithmetic**.
- Debounced refetch on cost/preset/custom-field change; skeleton while loading; stale values dimmed rather than blanked (no layout jump).
- `pricingAvailable: false` renders a specific message per `reason`, with a "Create a pricing preset" link when `NO_DEFAULT_PRESET`.
- Months selector on the preview lets the user try 3/6/12 without saving.
- If manual `price` differs from calculated `cashPrice`, show an inline hint + "Use calculated price" button (admin-gated write).

### 12.4 Layout rules

- Do **not** convert the app to RTL. Layout stays LTR.
- `dir="auto"` on every input and display element that renders user-entered text: preset `name`, `productType`, `notes`, product `name`/`brand`/`notes`, and audit `reason`.
- Money and percent values are LTR numerals; never wrap them in `dir="auto"` (a leading Arabic label would flip the digits' visual order).
- Tables get `overflow-x: auto`; the page body never scrolls horizontally.

---

## 13. Arabic + English labels

Single source in `frontend/src/features/pricing/utils/pricing-labels.ts`, mirroring `products/utils/product-labels.ts`.

| Key | English | العربية |
|---|---|---|
| `pricingPresets` | Pricing Presets | صيغ التسعير |
| `presetName` | Preset Name | اسم صيغة التسعير |
| `productType` | Product Type | نوع المنتج |
| `expensePercent` | Expenses % | نسبة المصاريف |
| `profitPercent` | Profit % | نسبة الربح |
| `discountBufferPercent` | Discount Buffer % | هامش الخصم |
| `installmentMarkupPercent` | Installment Markup % | زيادة التقسيط |
| `downPaymentPercent` | Down Payment % | الدفعة الأولى |
| `installmentMonths` | Installment Months | عدد أشهر التقسيط |
| `calculationMode` | Calculation Mode | طريقة الحساب |
| `roundingMode` | Rounding | التقريب |
| `notes` | Notes | ملاحظات |
| `costPrice` | Real Cost Price | السعر الحقيقي |
| `cashPrice` | Cash Price | السعر النقدي |
| `installmentPrice` | Installment Price | سعر التقسيط |
| `downPayment` | Down Payment | الدفعة الأولى |
| `remaining` | Remaining | المتبقي |
| `monthlyPayment` | Monthly Payment | القسط الشهري |
| `useCustomPricing` | Use Custom Pricing | تسعير مخصص |
| `pricingPreview` | Pricing Preview | معاينة السعر |
| `isDefault` | Default | افتراضي |
| `compound` / `simple` | Compound / Simple | مركّب / بسيط |

Rendered as `English / العربية` in the same pattern the app already uses. Backend error messages stay English (matching every existing feature); the frontend maps error codes to bilingual copy.

---

## 14. Validation rules

Zod schemas in `pricing-presets.validator.ts`, following `products.validator.ts` (string-based money/percent regex, `emptyToNull` preprocess, `userTextSchema` for free text).

**Percent fields** — string input, regex `^(?:0|[1-9]\d*)(?:\.\d{1,3})?$`:

| Field | Range | Required |
|---|---|---|
| `expensePercent` | `0 – 999.999` | yes |
| `profitPercent` | `0 – 999.999` | yes |
| `discountBufferPercent` | `0 – 999.999` | yes |
| `installmentMarkupPercent` | `0 – 999.999` | yes |
| `downPaymentPercent` | `0 – 100` | yes |

`downPaymentPercent` is capped at 100 because `> 100` yields a negative remaining — a nonsense state, not a business case.

**Other preset fields:** `name` 1–200 (`userTextSchema`), unique among non-archived presets (case-insensitive, checked in service not DB, matching the product duplicate-check pattern); `productType` optional ≤ 120; `defaultInstallmentMonths` integer `1 – 120`; `notes` optional ≤ 2000; `calculationMode`/`roundingMode` native enums.

**Product pricing:** `costPrice` optional money string, `> 0` when present (`0.00` is rejected — a free product is a data-entry error, and it makes every derived price `0.00`); `pricingPresetId` valid UUID of a non-deleted preset; when `useCustomPricing = true`, all six custom percents + `customInstallmentMonths` required and range-checked identically; when `false`, custom fields may be retained (not cleared) so toggling back restores prior values.

**Cross-cutting:** reason `min 5, max 1000` via `userTextSchema` on all sensitive mutations; admin password required and never persisted; `installmentMonths` query override `1 – 120`.

---

## 15. Testing strategy

### Backend

`pricing-calculator.test.ts` (pure, fastest, highest value):
- **the canonical AC case pinned exactly**: `300.00 / 10 / 7 / 7 / 20 / 40 / 3` → `377.82, 453.38, 181.35, 272.03, 90.67, 90.69`
- COMPOUND vs SIMPLE divergence (`377.82` vs `372.00`)
- no intermediate rounding: assert `377.82`
- `downPayment + remaining === installmentPrice` (property-style over a table of inputs)
- `monthly × (n−1) + last === remaining` for n = 1, 2, 3, 6, 12, 36
- zero percents ⇒ cash price == cost
- `downPaymentPercent = 0` and `= 100` edges
- each `roundingMode` value
- **float-drift guard**: `0.1 + 0.2` style inputs (`cost = 0.07, expense = 33.333`) produce exact Decimal results, and `typeof result.cashPrice === 'string'`

`pricing-presets.service.test.ts` / `.routes.test.ts`:
- create / reject out-of-range percents / reject `downPaymentPercent > 100` / reject `months < 1`
- duplicate name rejected
- set-default clears the previous default (transactional)
- archive refuses when preset is default
- archive/restore round trip
- non-admin rejected; wrong admin password rejected; missing reason rejected
- audit row written with correct `recordType`/`action`, and **password absent from audit JSON and from logs**
- all money/percent fields serialise as strings

`pricing-resolution.test.ts`:
- product with preset uses preset
- `useCustomPricing` overrides preset
- no preset falls back to default preset
- no default ⇒ `pricingAvailable: false, reason: NO_DEFAULT_PRESET`
- no cost ⇒ `MISSING_COST_PRICE`
- archived preset still calculates with `PRESET_ARCHIVED` warning

Products regression: existing `products.routes.test.ts` must pass untouched — proof that the migration is non-breaking.

### Frontend

- Pricing Presets page: renders, loading / empty / error states
- Preset form: validation messages, percent-range errors, submit payload shape
- Preset form mini-preview updates after editing a percent
- Product pricing section renders inside product form and details drawer
- Preview updates after selecting a preset (mocked API)
- Custom pricing toggle pre-fills from preset and shows custom fields
- `pricingAvailable: false` renders the right message per reason
- Arabic + English labels present
- `dir="auto"` asserted on preset name / notes / product free-text inputs

### Final verification (once, at the end of implementation)

```
npm run lint
npm run typecheck
npm test
npm run build
npm run prisma:validate
```

---

## 16. Out of scope

Not in this version, by explicit decision:

- automatic debt creation · automatic installment plan creation · product sale checkout
- delivery fees · installation fees · inventory/stock · supplier purchase orders
- profit/loss reports · tax/VAT
- **real discount at sale time** (the buffer exists so this can be added later)
- ecommerce sync · multi-currency · cost history / effective-dated pricing
- bulk re-pricing jobs · preset cloning · price change approval workflow
- auto-matching a preset to a product by category

Two of these are worth naming as the natural next version: **real discount at sale time** (consumes the buffer) and **cost history**, since today a cost edit rewrites the past with no dated record — the same tradeoff already accepted in v1.0.4 corrections.

---

## 17. Implementation checkpoints for Codex

Reordered from the suggested list: audit/admin protection moves **into** the API checkpoints rather than being bolted on at CP9. Retrofitting `verifyAdminPassword` after routes exist means rewriting every route test; wiring it as each route is written costs nothing extra.

| CP | Scope | Done when |
|---|---|---|
| **CP1** | Confirm gaps: read `Product` model, `products.*` backend files, `features/products/*` frontend, `service-policy.ts`, `money.ts`. No code. | Written confirmation that `price`/`discount` semantics and the audit reuse plan hold. |
| **CP2** | Prisma: `PricingPreset`, two new enums, two `ServiceAudit` enum values, `Product` pricing columns, partial unique index (raw SQL). One migration. | `prisma:validate` passes; migration applies to a copy of prod data with zero row changes. |
| **CP3** | `pricing-calculator.ts` + `pricing-percent.ts` + `multiplyMoney`/`divideMoney` in `money.ts`, all with tests. **Pure, no I/O.** | The canonical AC case passes exactly; float-drift tests pass. |
| **CP4** | Preset API: validator, repository, service, controller, routes, `pricing-policy.ts`. Admin password + reason + audit wired in from the start. Mount in `app.ts`. | Route tests green including auth/password/audit cases. |
| **CP5** | `pricing-resolution.ts`, `GET /products/:id/pricing-preview`, `POST /pricing/calculate`, `PATCH /products/:id/pricing`, product response `pricing` summary. | Resolution tests green; existing product tests still green. |
| **CP6** | Frontend `features/pricing/`: types, zod schemas, api client, `usePricingPresets` / `usePricingPreview` hooks. | Typecheck passes; hooks unit-tested against mocked API. |
| **CP7** | `PricingPresetsPage` + table + mobile card + form dialog (with mini-preview) + archive/restore/set-default dialogs + route + nav entry. | Page tests green. |
| **CP8** | Product pricing section + `PricingPreviewCard` in `ProductFormDialog` and `ProductDetailsDrawer`; cash-price column in products table. | Component tests green. |
| **CP9** | Bilingual labels file, `dir="auto"` audit across new inputs, responsive/overflow polish, empty/loading/error states. | Label + `dir` tests green. |
| **CP10** | Docs: README section, `claude/` feature doc, preset seeding guidance for the five example presets. | Docs reviewed. |
| **CP11** | Final verification (§15) + version bump + release notes. Only after all above are green. | All five commands pass. |

Each CP is one commit. No CP is merged with a failing test.

---

## 18. Risks and open decisions

**Risks**

1. **Rounding disputes.** The single likeliest source of "the system is wrong" complaints is a one-cent difference from a hand calculation. Mitigation: the no-intermediate-rounding rule is pinned by an exact test, and the preview shows every intermediate amount so any disagreement is locatable.
2. **Preset edits silently move prices.** Since previews are derived, editing the AC preset changes every AC product's displayed price instantly, with no per-product audit trail. Mitigation: preset edits are audited, and the preview shows which preset produced the number. Accepted for v1 — it is the point of presets. Flag it in the UI copy on the preset edit dialog.
3. **Two prices on one product** (manual `price` vs calculated `cashPrice`) will confuse staff. Mitigation: explicit divergence hint + one-click copy; never auto-overwrite. Revisit in the version that adds sale-time discount.
4. **N+1 previews in the product list.** Mitigated by computing list-level cash price in-process from an included preset relation (CP5), not by calling the preview endpoint per row.
5. **Percent precision.** `Decimal(6,3)` caps at `999.999%`. Adequate, but a hard ceiling — note it, do not silently truncate on input.
6. **Migration ordering vs v1.0.9 pg_trgm plan.** Both touch products/schema. Sequence them; do not develop in parallel on the same tables.

**Open decisions for the reviewer**

| # | Decision | Recommendation |
|---|---|---|
| D1 | All four rounding modes now, or `NONE` only? | **All four** — trivial in the pure function, avoids a later enum migration. |
| D2 | Custom pricing all-or-nothing, or per-field fallback to preset? | **All-or-nothing**, with form pre-fill from the selected preset. Predictability beats flexibility on money. |
| D3 | Archiving the default preset: refuse, or auto-clear the flag? | **Refuse** — force explicit promotion of a replacement. |
| D4 | Store a cached `calculatedCashPrice` column? | **No** in v1. Derive on read. Additive later if list performance demands it. |
| D5 | Is `productType` free text or an enum/table? | **Free text** in v1. A product-category table is its own feature. |
| D6 | Should ordinary (non-admin) staff see cost price? | **Open — needs a business answer.** Recommendation: staff see cash/installment prices, cost price is admin-only in the API response. This affects the response shape, so decide before CP5. |
| D7 | Seed the five example presets on migration? | **No auto-seed.** Ship a documented manual setup; auto-seeded percentages would be guesses presented as configuration. |

D6 is the only one that changes the API contract; the rest are internal.

---

## 19. Exact files likely to change

**New — backend**

```
backend/src/features/pricing/index.ts
backend/src/features/pricing/domain/pricing-types.ts
backend/src/features/pricing/domain/pricing-errors.ts
backend/src/features/pricing/domain/pricing-percent.ts
backend/src/features/pricing/domain/pricing-percent.test.ts
backend/src/features/pricing/domain/pricing-calculator.ts
backend/src/features/pricing/domain/pricing-calculator.test.ts
backend/src/features/pricing/authorization/pricing-policy.ts
backend/src/features/pricing/authorization/pricing-policy.test.ts
backend/src/features/pricing/presets/pricing-presets.validator.ts
backend/src/features/pricing/presets/pricing-presets.validator.test.ts
backend/src/features/pricing/presets/pricing-presets.repository.ts
backend/src/features/pricing/presets/pricing-presets.service.ts
backend/src/features/pricing/presets/pricing-presets.service.test.ts
backend/src/features/pricing/presets/pricing-presets.controller.ts
backend/src/features/pricing/presets/pricing-presets.routes.ts
backend/src/features/pricing/presets/pricing-presets.routes.test.ts
backend/src/features/pricing/calculator/pricing-resolution.ts
backend/src/features/pricing/calculator/pricing-resolution.test.ts
backend/src/features/pricing/calculator/pricing-calculator.controller.ts
backend/src/features/pricing/calculator/pricing-calculator.routes.ts
backend/src/features/pricing/calculator/pricing-calculator.routes.test.ts
backend/prisma/migrations/<ts>_add_pricing_presets_and_product_pricing/migration.sql
```

**Modified — backend**

```
backend/prisma/schema.prisma                                   // PricingPreset, 2 enums, ServiceAudit enum values, Product columns, User relations
backend/src/app.ts                                             // mount /api/v1/pricing-presets, /api/v1/pricing
backend/src/features/financial/domain/money.ts                 // multiplyMoney, divideMoney
backend/src/features/financial/domain/money.test.ts
backend/src/features/service/authorization/service-policy.ts   // PRODUCT_FIELD_POLICY + pricing fields
backend/src/features/service/authorization/service-policy.test.ts
backend/src/features/service/products/products.validator.ts    // pricing update + preview query schemas
backend/src/features/service/products/products.validator.test.ts
backend/src/features/service/products/products.repository.ts   // include preset, pricing field writes
backend/src/features/service/products/products.service.ts      // updatePricing, getPricingPreview, response pricing summary
backend/src/features/service/products/products.controller.ts
backend/src/features/service/products/products.routes.ts       // /:productId/pricing, /:productId/pricing-preview
backend/src/features/service/products/products.routes.test.ts
backend/src/lib/redaction.ts                                   // confirm adminPassword redaction covers new routes
```

**New — frontend**

```
frontend/src/features/pricing/types/pricing.types.ts
frontend/src/features/pricing/schemas/pricing.schemas.ts
frontend/src/features/pricing/api/pricing.api.ts
frontend/src/features/pricing/hooks/usePricingPresets.ts
frontend/src/features/pricing/hooks/usePricingPreview.ts
frontend/src/features/pricing/utils/pricing-labels.ts
frontend/src/features/pricing/utils/pricing-form-errors.ts
frontend/src/features/pricing/components/PricingPresetsTable.tsx
frontend/src/features/pricing/components/PricingPresetMobileCard.tsx
frontend/src/features/pricing/components/PricingPresetFormDialog.tsx
frontend/src/features/pricing/components/PricingPresetFilters.tsx
frontend/src/features/pricing/components/PricingPresetArchiveDialog.tsx
frontend/src/features/pricing/components/PricingPresetRestoreDialog.tsx
frontend/src/features/pricing/components/PricingPresetSetDefaultDialog.tsx
frontend/src/features/pricing/components/PricingPresetSelect.tsx
frontend/src/features/pricing/components/PricingPreviewCard.tsx
frontend/src/features/pricing/components/pricing.components.test.tsx
frontend/src/features/products/components/ProductPricingSection.tsx
frontend/src/pages/pricing/PricingPresetsPage.tsx
```

**Modified — frontend**

```
frontend/src/App.tsx                                              // /pricing-presets route
frontend/src/layouts/DashboardLayout.tsx                          // nav entry
frontend/src/features/products/types/product.types.ts             // pricing summary fields
frontend/src/features/products/schemas/product.schemas.ts
frontend/src/features/products/api/products.api.ts                // updatePricing, getPricingPreview
frontend/src/features/products/hooks/useProducts.ts
frontend/src/features/products/components/ProductFormDialog.tsx   // pricing section
frontend/src/features/products/components/ProductDetailsDrawer.tsx
frontend/src/features/products/components/ProductsTable.tsx       // cash price column
frontend/src/features/products/components/ProductMobileCard.tsx
frontend/src/features/products/components/products.components.test.tsx
frontend/src/features/products/utils/product-labels.ts
```

**Docs**

```
README.md
claude/plans/product-pricing-presets-plan.md   (this file)
```

---

*End of plan. No code was written, no tests run, no migration created, no version bumped.*
