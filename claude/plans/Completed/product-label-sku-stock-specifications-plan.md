# Product Label, SKU, Stock & Specifications — Planning Document

**Status:** Plan only. No code written, no migrations, no version bump.
**Target version:** v1.0.7 (or v1.2.0 if shipped after the dashboard rebuild — the two features share no files and can ship in either order)
**Author role:** Product architecture / ERP planning / label-printing workflow
**Date:** 2026-08-01

---

## 0. What already exists (verified in repo)

A targeted inspection was done before planning. Everything below was read, not assumed.

| Area | Reality today |
|---|---|
| Product model | `prisma/schema.prisma:534` — has `barcode String? @unique`, `price`, `costPrice`, `discount`, `pricingPresetId`, `useCustomPricing`, custom percent fields, `isActive`, `notes`. **No `sku`, no stock fields, no specifications.** |
| Label component | `frontend/src/features/products/components/ProductLabel.tsx` — **already exists**, already renders a CODE128 barcode via `JsBarcode` |
| Label payload | `products.service.ts:279-290` returns `{ id, name, model, brand, barcode, price }` |
| Label CSS | `frontend/src/styles/*.css:53-78` and `:113-114` — 50mm label grid, Tahoma, `@media print` block already in place |
| Pricing calculator | `backend/src/features/pricing/domain/pricing-calculator.ts` — `rawCashStages()` computes `afterExpenses` → `afterProfit` → `cashRaw` |
| Pricing result | `PricingResult` returns `cashPrice`, `installmentPrice`, `expensesAmount`, `profitAmount`, `discountBufferAmount` — all decimal strings |
| Barcode validation | `products.validator.ts:15` — 4–64 chars, `/^[A-Za-z0-9-]+$/`, `emptyToNull` preprocessing |
| Product search | `products.repository.ts:36-42` — searches `name`, `model`, `brand` (contains) and `barcode` (**startsWith**). No SKU. |
| Admin policy | `service-policy.ts` — `PRODUCT_FIELD_POLICY` is a per-field boolean map; `true` = requires admin password + reason |
| Audit | `ServiceAudit` model, `ServiceAuditRecordType.PRODUCT` already exists; `ServiceAuditAction` has `CREATE`, `UPDATE_DETAILS`, `CHANGE_PRICE`, `ARCHIVE`, `RESTORE`, `SET_DEFAULT` |
| Label routes | `GET /:productId/label` already registered above `GET /:productId` |
| JSON precedent | `ActivityLog.details Json` already in the schema — Json is safe here |

### The three findings that change this plan

**Finding 1 — `priceWithoutDiscountBuffer` already exists, unnamed.**
In `rawCashStages()`, COMPOUND mode computes `afterProfit = cost × (1+exp%) × (1+profit%)` and *then* applies the buffer. That intermediate value **is exactly** the "price without discount buffer" this feature needs. SIMPLE mode's equivalent is `cost + expensesRaw + profitRaw`. This is not new math — it is a value that already flows through the calculator and simply isn't returned. Adding it to `PricingResult` is a ~6-line change with zero risk to the pinned rounding behavior, *provided nothing is re-derived and no intermediate rounding is introduced*.

**Finding 2 — the current label already leaks the price, at the payload level.**
`ProductLabel.tsx:19` renders `{product.price && <p className="product-label-price">…</p>}`, and the backend `label()` handler *sends* `price`. Removing the JSX line alone is not a fix — the price would still be in the network response and in any print-to-PDF debugging. **The field must be removed from the label payload**, not hidden in the UI.

**Finding 3 — the current label is bilingual and `dir="auto"`.**
`ProductLabel.tsx` uses `businessLabels.product.model` (a bilingual label source) and puts `dir="auto"` on the article and on the name. The new requirement is English-only stickers. The label component needs its own hardcoded English strings and no `dir` attributes — it must stop importing `businessLabels` entirely. This is a small change but easy to half-do.

---

## 1. Version goal

Turn Product records from a catalogue entry into a **shelf-ready, scannable, inventory-prepared** record:

- A stable auto-generated **SKU** that identifies the product and never encodes price.
- A **professional English-only printed label** showing brand, name, model, SKU, and a scannable barcode — and showing **no price of any kind**.
- An optional **internal price code** on the label that helps staff recall the pre-buffer price without exposing any real figure.
- A **basic stock field** (quantity, threshold, tracking flag) that stores state but drives no automation.
- **Flexible specifications** stored per product for future inventory and sales use.
- **Scanner-driven lookup** by SKU or barcode.

**Definition of done:**
- A physical label prints, scans with the real scanner, and finds the product.
- No customer looking at a sticker can determine cost, cash price, installment price, or any percentage.
- Every existing product has a SKU, and no existing product broke.
- `products.routes.test.ts` and `products.pricing.routes.test.ts` pass untouched.

**Explicit non-goal:** stock movements, deductions, or history. This version prepares the fields; it does not manage inventory.

---

## 2. Business workflow

### 2.1 New product intake

```
Staff creates product
   → name, model, brand entered
   → SKU auto-generated (HC-000124) — not editable at create time
   → manufacturer barcode entered IF the box has one (optional)
   → cost price + pricing preset selected
   → pricing preview shows: cash, installment, price-without-buffer, internal code
   → stock: trackStock toggled on if the item is stocked; quantity entered
   → specifications added as key/value rows (capacity, color, warranty…)
   → save
   → open Label tab → preview → print → stick on the box
```

### 2.2 Shop-floor lookup (the scanner path)

```
Customer brings a boxed item to the counter
   → staff scans the HomeConnect label
   → scanner types "HC-000124" + Enter into the focused search field
   → exact SKU match → product opens directly
   → staff reads the internal code (P353) and quotes the price from it
```

### 2.3 Price recall without exposure

```
Sticker shows:  Code: P353
Staff knows:    P = price code prefix, 353 = pre-buffer price rounded
Customer sees:  a meaningless code
```

The internal code is a **memory aid, not an identifier**. Multiple different products can legitimately share the code `P353` if their pre-buffer prices round to the same figure. This must be stated explicitly in code comments so nobody later adds a unique constraint to it — that would be a silent, hard-to-diagnose bug.

---

## 3. Label design requirements

### 3.1 Content

```
┌──────────────────────────────┐
│ SHARP                        │  ← brand, uppercase, bold, 8pt
│ Sharp Fridge                 │  ← product name, 12pt
│ Model: SJ-PV69G              │  ← 8pt
│ SKU: HC-000124               │  ← 8pt, monospace
│                              │
│ ▊▎▊▊▎▊▎▎▊▊▎▊▊▎▊▎▊▎▊▊▎▊      │  ← CODE128, encodes SKU
│      HC-000124               │  ← human-readable line (JsBarcode displayValue)
│                              │
│ Code: P353                   │  ← optional, 8pt, right-aligned
└──────────────────────────────┘
```

### 3.2 Hard rules

**Must show:** brand (if present), product name, `Model:`, `SKU:`, barcode image with human-readable text, and — only when explicitly enabled — `Code:`.

**Must never show:** cost price, cash price, installment price, down payment, monthly payment, profit %, expenses %, discount buffer %, supplier cost, stock quantity, specifications.

**Must be:** English only. No `businessLabels` import. No Arabic. No `dir` attribute anywhere in the label subtree.

The reason for the last rule is subtle and worth stating: a `dir="auto"` on a label containing an Arabic product name would flip the whole line's rendering, which can reorder `Model: X` into `X :Model` on the printed sticker. Since product *names* may legitimately be Arabic, the correct handling is to render them LTR-forced on the label and accept imperfect Arabic shaping there, rather than let direction flip the layout. Flag as open decision **D5**.

### 3.3 What is deferred

Stock on the label — no. Specifications on the label — no. Both are explicitly deferred; a 50mm sticker has no room and the requirement says customer-facing labels stay minimal. The label payload should not even carry them.

---

## 4. SKU strategy

### 4.1 Format

**Recommendation: `HC-000124`** — prefix + 6-digit zero-padded sequence.

Rejected: `HC-2026-000124`. The year adds five characters to every barcode (making the CODE128 symbol ~30% wider on a 50mm label), conveys nothing the `createdAt` field doesn't already hold, and creates an annual "does the counter reset?" question with no good answer. The plain sequence is cleaner and matches the flat, non-hierarchical style of the existing schema.

- Prefix `HC-` is a config constant, not a hardcoded literal.
- 6 digits = 999,999 products. Adequate; the format degrades gracefully to 7 digits rather than failing.
- Uppercase, `A-Z0-9-` only, max 32 chars — mirroring the existing `barcodeSchema` character rule so both are scanner-safe by the same standard.

### 4.2 Generation — use a Postgres sequence, not `MAX(...) + 1`

This is the most important technical decision in the feature.

The obvious implementation — read the highest existing SKU, add one — has a race condition: two concurrent product creations read the same maximum and produce the same SKU. One fails on the unique constraint, the other succeeds, and the failure surfaces as an opaque 500 to whichever user lost. This is exactly the kind of bug that appears rarely in testing and constantly in a shop with two terminals.

**Use a dedicated Postgres sequence**, created in the migration:

```sql
CREATE SEQUENCE product_sku_seq START WITH 1 INCREMENT BY 1;
```

SKU generation becomes `SELECT nextval('product_sku_seq')` inside the create transaction, formatted to `HC-` + 6-digit pad. `nextval` is atomic and concurrency-safe by construction.

Sequence gaps on rolled-back transactions are expected and harmless — a SKU is an identifier, not an audit trail, and gaps carry no meaning.

### 4.3 Backfill of existing products

Three steps inside **one** migration:

1. `ALTER TABLE products ADD COLUMN "sku" TEXT;` (nullable)
2. Backfill every existing row deterministically, ordered by `"createdAt", "id"` so the assignment is stable and reproducible — the oldest product becomes `HC-000001`.
3. `setval('product_sku_seq', <count>)`, then add the unique index and set `NOT NULL`.

Step 2's ordering matters: an unordered backfill assigns SKUs by whatever order Postgres returns rows, which differs between the dev machine and the shop's database. Deterministic ordering means the same product gets the same SKU everywhere.

### 4.4 Mutability

- SKU is **generated at create** and never supplied by the client on create.
- SKU is **admin-editable** via a dedicated action requiring admin password + reason (§14) — not through the general product PATCH.
- **Regenerating** a SKU is a separate, explicit admin action, not a side effect of editing anything else.
- Changing a SKU invalidates every printed label for that product. The UI must warn about this before confirming. This is a real operational cost, not a hypothetical.

### 4.5 Fields NOT added — a deliberate deviation

The brief proposes `skuGeneratedAt` and `skuUpdatedAt`. **Recommend dropping both.** `ServiceAudit` already records who changed what and when for `PRODUCT` records, and the create timestamp is `Product.createdAt`. Two more columns that duplicate the audit trail will drift out of sync with it the first time someone writes an update path that forgets them. If SKU history is needed, query the audit — that is what it is for.

---

## 5. Barcode scanning strategy

### 5.1 Three distinct concepts, kept distinct

| Concept | Field | Meaning |
|---|---|---|
| **SKU** | `sku` (new, unique, required) | HomeConnect's internal product identity. Stable. Never encodes price. |
| **Manufacturer barcode** | `barcode` (existing, unique, optional) | The EAN/UPC printed on the box by the maker. Untouched by this feature. |
| **Label barcode source** | `labelBarcodeSource` (new, enum, default `SKU`) | Which of the two gets encoded on the HomeConnect sticker. |

### 5.2 Why a source enum, not a stored value — a deliberate deviation

The brief proposes `labelBarcodeValue String?` holding the actual value to print. **Recommend `labelBarcodeSource` (`'SKU' | 'MANUFACTURER'`) instead.**

Storing a *copy* of the value creates a synchronization bug: change the manufacturer barcode, and `labelBarcodeValue` still holds the old one — so labels print a barcode that scans to nothing. Storing the *choice* and resolving it at read time cannot desynchronize. The resolution is one line:

```
effectiveLabelBarcode = source === 'MANUFACTURER' && barcode ? barcode : sku
```

With a mandatory fallback: if `MANUFACTURER` is selected but `barcode` is null, fall back to `sku`. A label with no barcode is a wasted sticker.

**Recommendation on default:** always default to `SKU`, even when a manufacturer barcode exists. HomeConnect's own label should scan to HomeConnect's own identity — that is what makes lookup reliable regardless of supplier. The manufacturer barcode remains stored and searchable so scanning the *original box* also finds the product.

### 5.3 Scanner behavior

Hardware barcode scanners act as keyboard wedges: they type the value fast and emit `Enter`. The plan deliberately does **not** implement timing-based scanner detection (measuring inter-keystroke intervals to distinguish scanner from human). That approach is fragile, hard to test, and unnecessary here.

Instead:

1. The products list search field **autofocuses** on page load and after closing a dialog.
2. Search resolution is **exact-match-first**: try exact `sku`, then exact `barcode`, then fall back to the existing fuzzy `name`/`model`/`brand` search.
3. On `Enter`, if the result set is exactly one product, open its detail drawer directly.
4. Backend returns an `exactMatch: boolean` flag so the frontend doesn't re-derive this.

This gives correct scanner behavior with no special-casing, and it improves manual typing at the same time.

### 5.4 Search changes

`products.repository.ts:36-42` currently searches `name`, `model`, `brand` (contains) and `barcode` (startsWith). Add:

- `sku` — exact match, prioritized above everything
- `barcode` — **exact match added alongside** the existing `startsWith` (do not replace it; partial barcode typing is a real workflow)
- `sku` — `contains` in the fuzzy fallback tier

Note the field ordering: exact matches must sort first in the result set, or a scan that also fuzzy-matches another product's name could open the wrong record.

---

## 6. Hidden internal price code strategy

### 6.1 The value

```
priceWithoutDiscountBuffer:
  COMPOUND:  cost × (1 + expenses%) × (1 + profit%)
  SIMPLE:    cost + (cost × expenses%) + (cost × profit%)
```

Per **Finding 1**, both are already computed inside `rawCashStages()` — `afterProfit` in COMPOUND, and the sum of the SIMPLE branch's parts. Return them; do not recompute them.

**Critical constraint:** do not introduce intermediate rounding to produce this value. The existing calculator compounds raw Decimals and rounds once at the cash-price boundary; the pinned canonical test (`cost 300 → cashPrice 377.82`) depends on that. `priceWithoutDiscountBuffer` is returned as a display value rounded to 2dp at the boundary only, exactly as `expensesAmount`/`profitAmount` already are via `displayMoney()`.

### 6.2 The code format

```
internalPriceCode = PREFIX + round(priceWithoutDiscountBuffer, 0 decimals, HALF_UP)
```

Worked example: `352.85` → `P353`. Pin this exact case as a test.

- Prefix `P` is a **config constant** (`INTERNAL_PRICE_CODE_PREFIX`), so it can be changed to `X` or anything else without touching logic. Staff-facing obscurity is the point; a hardcoded `P` that can never change undermines that.
- Rounding is `ROUND_HALF_UP` to zero decimals — state it explicitly, because `352.5` must be unambiguous.
- **Not unique.** Many products share a code. Never add a unique constraint. Never use it as a lookup key.
- Null when the product has no cost price or no resolvable pricing config. The label simply omits the line.

### 6.3 Derive, do not store — a deliberate deviation

The brief proposes `internalPriceCode String?` as a column. **Recommend deriving it on read instead.**

The existing pricing feature already established this precedent: *"The calculated cash price is not stored. It is derived on read."* Storing the code creates the same class of bug: change a preset's profit percentage, and every product's stored code is stale until something recomputes it. There is no natural moment to trigger that recomputation across all affected products, and a stale price code is worse than no price code — staff would quote a wrong price with full confidence.

Derived-on-read means the code is always correct by construction.

**Trade-off, stated honestly:** derived codes change silently when an admin edits a preset. Staff who memorized `P353` would find it now reads `P361`, with no notification. The mitigation is that the label is the source of truth for staff, not memory — and reprinting after a price change is already required behavior. If the business later wants frozen codes, the right design is an explicit "lock price code" action with a stored override column, which is a separate feature. Recorded as open decision **D2**.

---

## 7. Basic stock field strategy

### 7.1 Fields

| Field | Type | Default | Notes |
|---|---|---|---|
| `trackStock` | `Boolean` | `false` | Opt-in per product |
| `stockQuantity` | `Int` | `0` | Must be ≥ 0 |
| `lowStockThreshold` | `Int?` | `null` | Must be ≥ 0 if provided |

Default `trackStock: false` is correct for a schema-additive change: every existing product keeps behaving exactly as before, and stock is a thing you deliberately turn on rather than something that silently appears on 500 catalogue rows.

### 7.2 Derived status

```
!trackStock                             → NOT_TRACKED   (gray)
stockQuantity === 0                     → OUT_OF_STOCK  (critical)
threshold != null && qty <= threshold   → LOW_STOCK     (warning)
otherwise                               → IN_STOCK      (good)
```

Computed on the **backend** and returned as a `stockStatus` field. Not derived in the frontend — that would put the same three-branch rule in two places, and they would diverge.

Status badges carry an icon **and** a text label, never color alone.

### 7.3 Hard boundaries — what this is not

No stock movements. No history table. No automatic decrement on anything. No purchase orders. No supplier receiving. No sales deduction. `stockQuantity` changes **only** when a human edits it, through an audited admin action.

The single most likely way this feature goes wrong is scope creep into inventory. The rule is simple and worth writing into the code: **nothing in the codebase may write to `stockQuantity` except the explicit stock-update endpoint.** If a service job, a debt, or a payment ever touches it, the boundary has been breached.

---

## 8. Product specifications strategy

### 8.1 Shape — ordered array, not a flat object

**Recommendation: `specifications Json?` holding an ordered array of key/value pairs**, plus `specificationNotes String?`.

```jsonc
[
  { "label": "Capacity",     "value": "600 L" },
  { "label": "Energy Class",  "value": "A++" },
  { "label": "No Frost",      "value": "Yes" },
  { "label": "اللون",          "value": "فضي" },
  { "label": "Warranty",      "value": "2 years" }
]
```

An array beats a flat `{ "Capacity": "600 L" }` object for three concrete reasons: JSON objects have no guaranteed key order, so a flat object would let the spec list reshuffle itself between renders; duplicate labels become impossible even when legitimate; and a label containing a dot or `$` becomes awkward to query later.

`specificationNotes` is free text for anything that doesn't fit a pair.

### 8.2 Validation

- Optional. Never blocks product creation.
- Array only; object or scalar rejected.
- Max **40 entries**; `label` ≤ 64 chars; `value` ≤ 256 chars.
- Total serialized size cap **8 KB** — enforced on the serialized JSON, not the entry count, since 40 entries at max length exceeds a sensible payload.
- Both fields accept Arabic and English; validated through the existing `userTextSchema` so injection protection is inherited rather than reinvented.
- Empty-string labels or values are stripped, not stored.
- **No HTML, ever.** Rendered as plain text — never `dangerouslySetInnerHTML`.

### 8.3 Display

Product details: a clean two-column definition list, `dir="auto"` per **value** (these are user-entered and may be Arabic), section hidden entirely when empty. Product form: an add/remove row editor. Not on the label. Not in the products table (too wide) — one line in the mobile card at most.

Deliberately **not** built: category-specific spec templates ("AC has BTU, fridge has liters"). That requires a product category model, which doesn't exist. Free-form pairs cover every example in the brief today.

---

## 9. Pricing integration

### 9.1 Calculator change

Add two fields to `PricingResult`:

```ts
priceWithoutDiscountBuffer: string;   // decimal string, 2dp
internalPriceCode: string | null;     // e.g. "P353"
```

Both sourced from values `rawCashStages()` already produces. `internalPriceCode` is null when the price is null or zero.

`PricingResult` is a shared type — adding fields is backward-compatible for every existing consumer, and the pinned canonical test must be re-run unchanged to prove the money values didn't move.

### 9.2 Where it surfaces

| Surface | Shows |
|---|---|
| `GET /:productId/pricing-preview` | cash, installment, down payment, monthly, **priceWithoutDiscountBuffer**, **internalPriceCode** |
| Product form pricing panel | full breakdown incl. both new values |
| Product details pricing section | full breakdown, admin-gated per existing policy |
| **Product label payload** | **`internalPriceCode` only** — no other pricing value, ever |

That last row is the whole security model of this feature in one line.

---

## 10. Product data model changes

### 10.1 Proposed additions to `Product`

```prisma
// Identity
sku                 String   @unique           // HC-000124 — backfilled, then NOT NULL
labelBarcodeSource  LabelBarcodeSource @default(SKU)

// Basic stock (fields only — no movements, no history)
trackStock          Boolean  @default(false)
stockQuantity       Int      @default(0)
lowStockThreshold   Int?

// Specifications
specifications      Json?
specificationNotes  String?  @db.Text

@@index([sku])
```

```prisma
enum LabelBarcodeSource {
  SKU
  MANUFACTURER
}
```

`ServiceAuditAction` needs new members:

```prisma
CHANGE_SKU
REGENERATE_SKU
CHANGE_STOCK
CHANGE_SPECIFICATIONS
```

### 10.2 Not added (deviations from the brief, with reasons)

| Proposed | Verdict | Reason |
|---|---|---|
| `internalPriceCode String?` | **Not stored** | Derived on read; storing it goes stale on preset change (§6.3) |
| `labelBarcodeValue String?` | **Replaced** by `labelBarcodeSource` | Storing a copy desynchronizes from `barcode`/`sku` (§5.2) |
| `skuGeneratedAt`, `skuUpdatedAt` | **Not added** | `ServiceAudit` + `createdAt` already cover it (§4.5) |

### 10.3 Migration safety

**One migration, ordered:**

1. `CREATE SEQUENCE product_sku_seq`
2. `CREATE TYPE "LabelBarcodeSource"`
3. Add all new columns — every one nullable or defaulted
4. Backfill `sku` deterministically ordered by `("createdAt", "id")`
5. `setval` the sequence past the backfilled maximum
6. Add unique index on `sku`; `ALTER COLUMN sku SET NOT NULL`
7. Extend `ServiceAuditAction` enum

**Preserved without modification:** `barcode` keeps its meaning, its uniqueness, and its data. `price` and `discount` keep their current meaning and are not repurposed. Every existing product remains valid.

**Note:** the schema has **no `@map` on columns**, so Postgres column names are camelCase. All raw SQL in the migration must quote them (`"createdAt"`, `"sku"`).

---

## 11. Backend API plan

### 11.1 Modified endpoints

| Endpoint | Change |
|---|---|
| `POST /api/v1/products` | Generates SKU via sequence. Accepts `trackStock`, `stockQuantity`, `lowStockThreshold`, `specifications`, `specificationNotes`, `labelBarcodeSource`. **Rejects client-supplied `sku`.** |
| `PATCH /api/v1/products/:id` | Accepts stock, specs, `labelBarcodeSource`. **Rejects `sku`** — SKU changes go through their own endpoint. |
| `GET /api/v1/products` | Search extended to SKU (exact + contains). Returns `sku`, `stockQuantity`, `stockStatus`, `trackStock`. Adds `exactMatch` flag. |
| `GET /api/v1/products/:id` | Returns all new fields + derived `stockStatus`. |
| `GET /api/v1/products/:id/pricing-preview` | Adds `priceWithoutDiscountBuffer`, `internalPriceCode`. |
| **`GET /api/v1/products/:id/label`** | **`price` REMOVED.** Returns `{ id, brand, name, model, sku, barcodeValue, barcodeSource, internalPriceCode }`. `internalPriceCode` present only when `?includePriceCode=true`. |

### 11.2 New endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `PATCH` | `/:productId/sku` | admin + password + reason | Edit SKU manually |
| `POST` | `/:productId/regenerate-sku` | admin + password + reason | Issue a fresh sequence SKU |
| `PATCH` | `/:productId/stock` | admin + password + reason | Update stock fields |

**Route ordering matters.** Register all three **above** the bare `PATCH /:productId` and `GET /:productId`, matching how `/archive`, `/restore`, and `/pricing` are already ordered in `products.routes.ts`. A route registered below the bare param route will never match.

### 11.3 The label payload rule

Per **Finding 2**, the label handler must be the narrowest projection in the codebase. It returns only the eight fields listed above. It does not spread the product object. It does not conditionally include price. There is no query parameter that makes it return a price.

A test should assert this negatively: `expect(Object.keys(body.data)).not.toContain('price')` — and the same for `costPrice`, `cashPrice`, `installmentPrice`, `discount`. A positive-only test would pass even if the handler leaked extra fields.

---

## 12. Frontend UI/UX plan

### 12.1 Product form / details — five sections

**1. Basic Info** — Name, Model, Brand, Manufacturer Barcode, **SKU** (read-only chip with a copy button; an "Edit SKU" affordance for admins that opens the password dialog).

**2. Pricing** — Cost Price, Preset selector, live preview showing cash / installment / down payment / monthly / **price without buffer** / **internal code**. Existing admin gating preserved.

**3. Stock** — `trackStock` toggle; when off, the other two fields are disabled and visually recessed rather than hidden (hiding them makes the toggle's effect invisible). Quantity, threshold, and a status badge with icon + text.

**4. Specifications** — Add/remove key/value rows with drag-free reordering via up/down buttons, plus a notes textarea. Empty state offers one blank row.

**5. Label** — Live preview rendering the exact print output; barcode source selector (SKU / Manufacturer, the latter disabled with an explanatory tooltip when no barcode exists); "Show internal price code" toggle, **default off**; Print button.

### 12.2 The label preview must be the label

The preview and the printed output must render from the **same component with the same CSS class names** — not a styled approximation. The whole point of a preview is that what you see is what the sticker will be. If they diverge, staff waste label stock discovering it.

### 12.3 Scanner UX

- Search input autofocuses on the products page and after any dialog closes.
- A small scanner icon in the field signals it is scan-ready.
- Exact match on Enter opens the detail drawer directly.
- No match shows "No product found for HC-000999" with the scanned value echoed — staff need to see what the scanner actually read, since misreads are common.

### 12.4 Bilingual policy

The **product management UI stays bilingual** as it is today. The **printed label is English-only**. These are different surfaces with different audiences, and the split is deliberate — do not "fix" the label's English-only strings by routing them through `businessLabels`.

---

## 13. Label print CSS plan

The existing CSS at `frontend/src/styles/*.css:53-78, 113-114` already provides a 50mm grid, Tahoma font, and a print media query. Extend rather than replace.

```css
/* new */
.product-label-sku      { font-family: 'Courier New', monospace; font-weight: 700; letter-spacing: 0.02em; }
.product-label-code     { font-size: 8pt; font-weight: 700; text-align: right; margin-top: 1mm; }

/* removed */
.product-label-price    { /* DELETE — the label never prints a price */ }
```

### 13.1 Print requirements

- Label size **50mm × 30mm** (confirm against the actual label stock at CP1 — open decision **D1**).
- Pure black `#000` on white. No gray, no color: thermal printers render mid-tones unpredictably and a gray barcode may not scan.
- Barcode minimum **10mm tall**, full label width minus margin. The existing `max-height: 12mm` is a good starting point.
- `-webkit-print-color-adjust: exact` so the barcode is never lightened by the browser's print optimization.
- Product name clamps to 2 lines with ellipsis. **Never** wrap into the barcode — a clipped barcode is an unscannable label, which is the single most expensive failure mode here.
- `@page { size: 50mm 30mm; margin: 0; }` in the print block.
- No `dir` attribute anywhere in the label subtree (§3.2).

### 13.2 Barcode encoding

CODE128 via the existing `JsBarcode` integration — already working, already imported, no new dependency. CODE128 encodes `A-Z0-9-` cleanly, so `HC-000124` is well within its character set. Keep `displayValue: true` so the human-readable line prints beneath the bars; when a scanner fails, staff type the value manually.

Keep the existing `barcodeFailed` fallback that renders the value as text — but with SKU now always present, the "no barcode at all" case disappears entirely.

---

## 14. Admin password / audit policy

### 14.1 Reuse, do not reinvent

`verifyAdminPassword` from `backend/src/lib/admin-verification.ts`, and the verify-and-mutate-in-one-transaction pattern already used by `products.service.ts`. `ServiceAudit` with `ServiceAuditRecordType.PRODUCT` already exists — add actions to the enum, do not create a new audit model.

### 14.2 Field policy extension

`PRODUCT_FIELD_POLICY` in `service-policy.ts` is a per-field boolean map. Add:

```ts
sku: true,                    // sensitive — invalidates printed labels
labelBarcodeSource: true,     // sensitive — changes what scans
trackStock: true,             // sensitive
stockQuantity: true,          // sensitive
lowStockThreshold: true,      // sensitive
specifications: false,        // catalogue content, like notes
specificationNotes: false,    // catalogue content, like notes
```

**Reasoning for the split:** SKU and barcode source change what a physical scan resolves to — an unaudited change there is a real operational hazard. Stock quantity is a business figure that will feed inventory later, so audit it from day one rather than retrofitting. Specifications are descriptive catalogue content, in the same class as `notes` and `imageUrl`, which are already non-sensitive — gating them behind a password every time someone adds a color would make staff avoid filling them in, and empty specs defeat the feature.

The brief suggests gating specification edits on already-active products. Recommend against it in v1: a conditional policy that depends on record state is a new pattern this codebase doesn't have, and it complicates the field-policy map for modest benefit. Recorded as open decision **D4**.

### 14.3 Password handling

The admin password is **never** stored, never logged, never echoed in a response, and never placed in audit `beforeValues`/`afterValues`. This is existing policy; it applies unchanged.

---

## 15. Validation rules

### 15.1 SKU

- Server-generated on create; a client-supplied `sku` on create is **rejected**, not ignored (silent ignoring hides integration bugs).
- Uppercase, trimmed, `/^[A-Z0-9-]+$/`, 4–32 chars.
- Unique — DB constraint, surfaced as a friendly conflict error, not a 500.
- Required after backfill (`NOT NULL`).

### 15.2 Barcode (unchanged)

Existing rule preserved: 4–64 chars, `/^[A-Za-z0-9-]+$/`, `emptyToNull`, unique when present. **Do not tighten it** — existing products depend on it, and manufacturer barcodes are not ours to reformat.

### 15.3 Internal price code

Derived, never accepted as input. Null when cost or pricing config is absent. Not unique. Not searchable. Never required.

### 15.4 Stock

- `stockQuantity`: integer, ≥ 0, defaults 0. **Reject non-integers explicitly** — `2.5` must 400, not silently truncate.
- `lowStockThreshold`: integer ≥ 0 or null.
- `trackStock`: boolean, defaults false.
- Omitting all three on create is valid.
- **Not enforced:** `lowStockThreshold <= stockQuantity`. A threshold above current stock is the normal state of an out-of-stock item.

### 15.5 Specifications

Array only; ≤ 40 entries; label ≤ 64; value ≤ 256; serialized ≤ 8 KB; via `userTextSchema`; empty pairs stripped; plain text rendering only; optional and never blocking.

---

## 16. Testing strategy

### 16.1 Backend

**SKU**
- Auto-generated on create, matching `/^HC-\d{6}$/`
- Sequential across consecutive creates
- Client-supplied `sku` on create is rejected
- Duplicate SKU returns a conflict, not a 500
- **Concurrent creates produce distinct SKUs** — the test that justifies the sequence design (§4.2)
- Backfill assigns deterministically by `createdAt, id`
- Regenerate issues a new value and audits it

**Search / scanning**
- Exact SKU match returns that product first, with `exactMatch: true`
- Exact barcode match works
- Partial barcode `startsWith` still works (regression on existing behavior)
- Fuzzy name/model/brand search unchanged
- A SKU that also fuzzy-matches another product's name still ranks the exact match first

**Label payload** *(highest-value tests in the feature)*
- Returns `sku` and the resolved `barcodeValue`
- **Negative assertion:** payload contains no `price`, `costPrice`, `cashPrice`, `installmentPrice`, or `discount` key
- `internalPriceCode` absent unless `?includePriceCode=true`
- `barcodeSource: MANUFACTURER` with a null barcode falls back to SKU

**Pricing**
- `priceWithoutDiscountBuffer` correct in COMPOUND mode
- `priceWithoutDiscountBuffer` correct in SIMPLE mode
- **The existing canonical case (`cost 300 → cashPrice 377.82`) still produces identical values** — proof that adding the field moved nothing
- `internalPriceCode` from `352.85` → `P353` (pinned)
- Half-up boundary: `352.50` → `P353`
- Null cost → null code, no throw

**Stock**
- Defaults: `trackStock false`, `stockQuantity 0`, `threshold null`
- Negative quantity rejected; non-integer rejected
- `stockStatus` correct across all four branches, including threshold-boundary equality
- Stock update requires admin password and writes an audit row

**Specifications**
- Saved and returned intact, order preserved
- Arabic values round-trip correctly
- Over-limit entry count, over-length value, and over-size payload all rejected
- Non-array shape rejected
- Omitted specs never block creation

**Regression**
- `products.routes.test.ts`, `products.pricing.routes.test.ts`, `products.validator.test.ts` pass **unmodified**

### 16.2 Frontend

- SKU displays in form, details, and table after create
- Label preview renders brand, name, `Model:`, `SKU:`, barcode
- **Label renders no price** — assert absence of any currency-formatted string
- **Label renders no Arabic** — assert the label subtree has no `businessLabels`-sourced text and no `dir` attribute
- Internal price code toggles on and off
- Barcode source selector disabled when no manufacturer barcode
- Scanner: typing a SKU + Enter opens the right product
- Stock section renders; toggling `trackStock` disables the fields
- All four stock status badges render with icon **and** text
- Specifications render in details; empty state hides the section
- Spec editor adds and removes rows

### 16.3 Manual (must be done — cannot be automated)

1. Print a real label on the real label stock.
2. **Scan it with the actual scanner** and confirm it opens the right product.
3. Confirm the sticker physically fits the product box.
4. Hand the label to someone and confirm no price is derivable.
5. Scan a manufacturer barcode on an original box and confirm search finds the product.
6. Edit a stock quantity and confirm nothing else in the app reacted.

Item 2 is the one that can't be skipped — barcode density, print contrast, and scanner tolerance interact in ways no unit test reaches.

---

## 17. What is out of scope

- Full inventory management, stock movement history, automatic deduction
- Purchase orders, supplier receiving, sales creation, POS checkout
- Debt or installment plan creation from this feature
- Delivery / installation fees
- Complex visual label designer
- QR codes (CODE128 is sufficient; QR needs a camera scanner the business doesn't have)
- Encrypted or reversible pricing codes
- Multi-label batch printing — **noted as an easy, clearly separate follow-up** (§19, D3): the CSS grid at `.product-label-grid` already exists and would largely support it
- Category-specific specification templates
- Label templates per product type
- Stock alerts, notifications, or reorder points

---

## 18. Implementation checkpoints

Eight checkpoints, following the brief's suggested order with one split. Each leaves the app working.

### CP1 — Inspect and confirm *(read-only, no code)*
Verify against the repo: `Product` model gaps, `products.service.ts` label handler, `ProductLabel.tsx` and its CSS, `pricing-calculator.ts` `rawCashStages`, `PRODUCT_FIELD_POLICY`, `ServiceAuditAction` members, the search implementation, and the `JsBarcode` integration. Also confirm:
- **the physical label stock dimensions** (D1) — CSS depends on it
- the currency/format convention already used by pricing display
- whether any consumer besides `ProductLabel.tsx` reads the label payload's `price`

**Output:** findings note. Stop and report before CP2.

### CP2 — Schema + migration
Single migration per §10.3: sequence, enum, columns, deterministic backfill, `setval`, unique index, `NOT NULL`, audit enum members. Verify existing products all received SKUs and that `products.routes.test.ts` still passes.

### CP3 — Pricing calculator
Add `priceWithoutDiscountBuffer` and `internalPriceCode` to `PricingResult`, sourced from existing `rawCashStages` values. Prefix as a config constant. **Re-run the pinned canonical test unchanged.**
*This is placed before the SKU/API work because it's small, isolated, and its regression risk is the highest in the feature — get it green early.*

### CP4 — SKU generation, search, validation
Sequence-backed generation in the create transaction, SKU validator, exact-match-first search with `exactMatch` flag, stock and specification validators.

### CP5 — Label payload + new endpoints
Narrow the label projection (**remove `price`**), add `barcodeValue`/`barcodeSource` resolution with fallback, `?includePriceCode`. Add `/sku`, `/regenerate-sku`, `/stock` endpoints with admin password + reason + audit, registered **above** the bare param routes. Extend `PRODUCT_FIELD_POLICY`.

### CP6 — Frontend data layer + form sections
Types, schemas, api, hooks. Basic Info SKU chip, Stock section, Specifications editor, pricing panel showing the two new values.

### CP7 — Label component + print CSS
Rewrite `ProductLabel.tsx`: English-only hardcoded strings, **drop the `businessLabels` import**, **drop every `dir` attribute**, add SKU line, add optional code line, **delete the price line**. Extend print CSS; delete `.product-label-price`. Build the Label tab with live preview, source selector, code toggle, print button.

### CP8 — Scanner search UX, tests, docs
Autofocus, Enter-to-open, no-match feedback. Full backend and frontend test suites. Docs.

---

## 19. Risks and open decisions

### 19.1 Risks

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| R1 | **SKU collision under concurrent creation** | High | Postgres sequence (§4.2), not `MAX+1`. Concurrency test in CP4. |
| R2 | **Price leaks via the label payload**, not just the UI | **High** | Remove the field server-side; negative-assertion test (§16.1). This is the feature's core security property. |
| R3 | **Backfill assigns different SKUs on dev vs. production** | Medium | Deterministic `ORDER BY "createdAt", "id"` (§4.3) |
| R4 | **Barcode clipped or too small to scan** | **High** — an unscannable label is worse than none | Min 10mm height, name clamped to 2 lines, `print-color-adjust: exact`, mandatory physical scan test (§16.3) |
| R5 | **Pricing regression** from touching the calculator | High | Only *return* existing intermediates; never recompute; canonical test re-run unchanged (CP3) |
| R6 | **Derived price code shifts silently** on preset edit | Medium | Documented trade-off (§6.3); label is source of truth; D2 tracks the frozen-code alternative |
| R7 | **`dir="auto"` on the label reorders `Model:` lines** for Arabic product names | Medium | No `dir` anywhere in the label subtree (§3.2); D5 tracks Arabic-name rendering |
| R8 | **Scope creep into inventory** | Medium | Hard rule: only the stock endpoint writes `stockQuantity` (§7.3) |
| R9 | **SKU edits invalidate printed labels** | Medium | Explicit warning in the confirm dialog; SKU changes require a separate admin action |
| R10 | **Specification JSON growth** bloating list queries | Low | 8 KB cap; specs excluded from the list projection |

### 19.2 Open decisions

| # | Decision | Options | Recommendation |
|---|---|---|---|
| **D1** | **Physical label stock size** | 50×30mm / 40×30mm / other | **Must be confirmed at CP1 by measuring the actual stock.** All print CSS depends on it. This is the one decision that cannot be made from the repo. |
| **D2** | Internal price code: derived or stored | Derive / store / store-with-lock | **Derive** (§6.3). Revisit if staff report codes shifting under them. |
| **D3** | Batch label printing | v1 / follow-up | **Follow-up.** `.product-label-grid` already exists, so it's cheap — but it's a separate, clearly-scoped feature. |
| **D4** | Gate specification edits on active products | Yes / no | **No** for v1 (§14.2). State-conditional field policy is a new pattern; the benefit is modest. |
| **D5** | Arabic product names on an English-only label | Force LTR / transliterate / require English name | **Force LTR and accept imperfect shaping.** Requiring an English name field is a bigger product change; transliteration is unreliable. Confirm with the business. |
| **D6** | Code prefix character | `P` / `X` / configurable | **Configurable constant, default `P`** — obscurity that can never be changed isn't obscurity. |
| **D7** | Default `labelBarcodeSource` when a manufacturer barcode exists | SKU / manufacturer | **Always SKU** (§5.2). HomeConnect's label should scan to HomeConnect's identity. |

---

## 20. Exact files likely to change

### 20.1 Backend — modified

```
backend/prisma/schema.prisma                                    ← Product fields, LabelBarcodeSource enum, ServiceAuditAction members
backend/prisma/migrations/<new>/migration.sql                   ← sequence, columns, backfill, unique index
backend/src/features/pricing/domain/pricing-types.ts            ← +2 PricingResult fields
backend/src/features/pricing/domain/pricing-calculator.ts       ← return existing intermediates
backend/src/features/pricing/domain/pricing-calculator.test.ts  ← new cases; canonical case unchanged
backend/src/features/service/products/products.service.ts       ← SKU generation, narrowed label payload, stock/spec handling
backend/src/features/service/products/products.repository.ts    ← SKU search, exact-match priority
backend/src/features/service/products/products.validator.ts     ← sku/stock/specification schemas
backend/src/features/service/products/products.controller.ts    ← 3 new handlers
backend/src/features/service/products/products.routes.ts        ← 3 new routes, above bare param routes
backend/src/features/service/authorization/service-policy.ts    ← PRODUCT_FIELD_POLICY additions
backend/src/features/service/products/products.routes.test.ts       ← extended (must not be weakened)
backend/src/features/service/products/products.validator.test.ts    ← extended
backend/src/features/service/products/products.pricing.routes.test.ts ← extended
```

### 20.2 Backend — new

```
backend/src/features/service/products/product-sku.ts            ← format, generate, validate
backend/src/features/service/products/product-sku.test.ts
backend/src/features/service/products/product-stock.ts          ← stockStatus derivation
backend/src/features/service/products/product-stock.test.ts
backend/src/features/service/products/product-specifications.ts ← shape validation, normalization
backend/src/features/service/products/product-specifications.test.ts
backend/src/features/pricing/domain/internal-price-code.ts      ← code formatting + prefix constant
backend/src/features/pricing/domain/internal-price-code.test.ts
```

### 20.3 Frontend — modified

```
frontend/src/features/products/components/ProductLabel.tsx      ← FULL REWRITE: English-only, +SKU, +code, −price, −businessLabels, −dir
frontend/src/features/products/components/ProductFormDialog.tsx ← stock + specifications sections
frontend/src/features/products/components/ProductDetailsDrawer.tsx ← SKU, stock, specs, label tab
frontend/src/features/products/components/ProductPricingSection.tsx ← +2 pricing values
frontend/src/features/products/components/ProductFormPricingPanel.tsx ← +2 pricing values
frontend/src/features/products/components/ProductsTable.tsx     ← SKU + stock columns
frontend/src/features/products/components/ProductMobileCard.tsx ← SKU + stock badge
frontend/src/features/products/components/ProductFilters.tsx    ← scanner-ready search field
frontend/src/features/products/types/product.types.ts           ← ProductLabelData rewrite + new fields
frontend/src/features/products/schemas/product.schemas.ts       ← stock + spec schemas
frontend/src/features/products/api/products.api.ts              ← 3 new calls
frontend/src/features/products/hooks/useProducts.ts             ← 3 new mutations
frontend/src/features/products/components/products.components.test.tsx ← extended
frontend/src/styles/<label css file>                            ← +sku/+code classes, −.product-label-price, @page
```

### 20.4 Frontend — new

```
frontend/src/features/products/components/ProductStockSection.tsx
frontend/src/features/products/components/ProductStockBadge.tsx
frontend/src/features/products/components/ProductSpecificationsEditor.tsx
frontend/src/features/products/components/ProductSpecificationsView.tsx
frontend/src/features/products/components/ProductLabelPanel.tsx    ← preview + options + print
frontend/src/features/products/components/ProductSkuEditDialog.tsx ← admin password + reason
frontend/src/features/products/utils/product-stock.ts              ← display helpers only (status comes from backend)
```

### 20.5 Docs

```
docs/PRODUCT_LABEL_PRINTING.md      ← new: label spec, print setup, scanner setup, troubleshooting
docs/PRODUCT_SKU_POLICY.md          ← new: format, generation, when SKUs may change
README.md                           ← feature list entry
```

---

## Appendix — rules that define correctness

1. **The label payload contains no price field of any kind.** Not hidden, not conditional — absent.
2. **SKU comes from a Postgres sequence**, never from `MAX(sku) + 1`.
3. **`priceWithoutDiscountBuffer` is returned, never recomputed.** The pinned canonical pricing test must produce identical values after the change.
4. **`internalPriceCode` is derived, non-unique, and never a lookup key.**
5. **`labelBarcodeSource` stores the choice, never a copy of the value.**
6. **Nothing writes `stockQuantity` except the explicit stock endpoint.**
7. **The printed label is English-only with no `dir` attribute** anywhere in its subtree.
8. **The existing `barcode` field is preserved unchanged** — meaning, uniqueness, validation, and data.

**Plan status:** ready for review. Nothing implemented, no files outside this document modified, no tests run, no version bumped.
