# Bulk Product Label Printing + PDF Export — Planning Document

**Status:** Plan only. No code written, no tests run, no migrations, no version bump, no commit.
**Target version:** v1.3.0 (current `package.json` is `1.2.0`; this is a feature increment, not a patch)
**Author role:** ERP planning / product workflow architecture / print & PDF UX
**Date:** 2026-08-04
**Scope owner decision required before CP2 — see §16 open decisions D1 and D2.**

---

## 0. What already exists (verified by reading the repo, not assumed)

A targeted inspection was done before planning. Roughly **60% of the requested feature is already shipped**. This plan is therefore mostly a *completion and correction* plan, not a greenfield build.

| Requested capability | Reality today | Verdict |
|---|---|---|
| Row checkboxes on Products page | `ProductsTable.tsx:56-64` — per-row checkbox, `selectedIds: Set<string>`, `aria-label="Select {name}"` | **Exists** |
| Select all visible | `ProductsTable.tsx` `SelectAllCheckbox` + `ProductsPage.tsx` `onSelectAll` iterating `visible` | **Exists** |
| Selected count | Only inside the button text: `Print Labels ({selectedIds.size})` (`ProductsPage.tsx`) | **Partial** |
| Clear selection | No UI. Selection is cleared only by `setStatus()` (tab switch) | **Missing** |
| Bulk action toolbar | A single `<Link>` that appears in the tab strip when `selectedIds.size > 0` | **Partial** |
| Bulk label route | `App.tsx:67` → `/products/labels`, page `pages/products/ProductLabelsPage.tsx`, reads `?ids=` CSV, dedupes, `.slice(0, 40)` | **Exists** |
| Multi-label preview | `ProductLabelsPage.tsx` renders `ProductLabel` in `.product-label-grid` | **Exists** |
| Label component | `components/ProductLabel.tsx` — brand / name / `Model:` / `SKU:` / optional price / CODE128 barcode | **Exists** |
| Barcode rendering | `jsbarcode@^3.12.3` (a real `dependency`), CODE128, `displayValue: true`, `try/catch` → text fallback already implemented | **Exists — do not add a library** |
| Layout controls | `ProductLabelPrintSettings.tsx` — autoFit toggle, width mm, height mm, show price, show code. Persists to `localStorage` | **Partial** |
| Print | `window.print()` button | **Exists** |
| **Sheet layout (grid on A4, cut afterwards)** | **Not supported.** `index.css:64` sets a *global* `@page { size: 50mm 30mm; margin: 2mm }`, and `ProductLabelPrintSettings` injects `@page { size: {w}mm {h}mm }` or `auto`. Print output is **one label per physical page** | **Missing — this is the core gap** |
| PDF export | Nothing. No export button, no IPC, no library call | **Missing** |
| Backend bulk payload | Only `GET /:productId/label` (`products.routes.ts:19`). The page issues **N parallel requests** via `useQueries` | **Missing** |
| App chrome hidden on print | `index.css:69-73` hides `aside`, `header`, `.no-print`; `main` overflow/padding reset | **Exists** |

### Findings that change the shape of this plan

**Finding 1 — the bulk *entry point* is done; the bulk *output* is not.**
Selecting products and reaching a multi-label preview already works end to end. What does not work is the thing the feature is actually for: **putting many labels on one sheet of A4 so they can be cut by hand.** Today a 12-product print job sends 12 tiny 50×30mm pages to the printer. Everything in §5 and §6 is the real work.

**Finding 2 — `@page` is global and cannot be scoped by CSS selector.**
`@page` rules are document-level; there is no `.sheet-mode @page`. Two print modes (single sticker stock vs. A4 sheet) therefore cannot both live as static CSS. The repo already solves this once: `ProductLabelPrintSettings.tsx` injects a `<style>{'@media print { @page { size: … } }'}</style>` element. The same mechanism must be reused, and the **global `@page { size: 50mm 30mm }` in `index.css:64` must be removed or neutralised**, because it currently wins for every other printable screen in the app too.

**Finding 3 — the label already prints the cash price, deliberately.**
`ProductLabel.tsx` renders `.product-label-price` when `product.cashPrice` is present, the backend sends `cashPrice` when `includePrice=true`, `ProductLabelPage`/`ProductLabelsPage` default `showPrice` to **`true`**, and `index.css:110` styles the price row with a top rule. The brief for this feature says the cash price must never appear. A previous plan (`claude/plans/Completed/product-label-sku-stock-specifications-plan.md`, "Finding 2") already removed the price once and it has since come back as an opt-in toggle. **This is a live, intentional behaviour — do not silently flip it.** See decision **D1**.

**Finding 4 — the "internal price code" is already implemented, and not as a separate line.**
`products.service.ts:318` returns `staffLabelCode: formatStaffLabelCode(sku, internalPriceCode)`, and `ProductLabel.tsx` prints it under a plain `SKU:` caption with an explicit code comment: *"only staff know the suffix carries the price. Never label it 'Staff'."* The brief's example (`SKU: HC-000124` + a separate `Code: P353` line) would **undo that camouflage** by making the code visibly a code. Keep the shipped convention; do not add a second line. See decision **D3**.

**Finding 5 — `jspdf@^4.2.1` is already in `devDependencies` and is imported nowhere.**
`html2canvas` is **not** installed. `jsPDF` alone cannot lay out HTML; the usual pairing rasterises the DOM to a canvas — which would turn a crisp vector SVG barcode into a ~96dpi bitmap and measurably hurt scan reliability. This is the deciding argument in §7.

**Finding 6 — a clean Electron IPC precedent exists.**
`desktop/src/preload.ts` exposes `window.electronAPI` via `contextBridge` with `ipcRenderer.invoke` channels, including native dialog flows (`backup:selectDirectory`, `backup:selectFile`). `desktop/src/window.ts` runs `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, and `desktop/src/content-security-policy.ts` enforces a strict production CSP. A `labels:exportPdf` channel backed by `webContents.printToPDF` + `dialog.showSaveDialog` fits the existing pattern exactly and adds **zero** new npm dependencies.

**Finding 7 — the label read endpoint is not role-gated, but the price code it can return is sensitive.**
`products.routes.ts:19` has no `requireServiceAdmin`; only mutations do. Any authenticated user can call `?includePriceCode=true&includePrice=true` and receive `staffLabelCode` and `cashPrice`. Bulk-ifying that endpoint multiplies the exposure from 1 product per call to 100. See decision **D2**.

**Finding 8 — an N+1 exists on both tiers.**
`ProductLabelsPage` fires one HTTP request per product, and `ProductsService.label()` calls `ProductsRepository.findActiveDefaultPricingPreset()` once *per product*. 40 selected products = 40 requests + 40 preset lookups. The bulk endpoint fixes both with one product query and one preset lookup.

---

## 1. Version goal

Make the Products section able to produce a **cut-ready sheet of labels** for an arbitrary selection of products, printable on ordinary A4 stock and exportable as a PDF, without adding a runtime dependency and without leaking commercial figures onto a customer-facing sticker.

Concretely, v1.3.0 delivers:

1. A real bulk-selection toolbar (count, clear, readiness, print, export).
2. One bulk label endpoint replacing N per-product calls, with explicit per-product warnings.
3. A **sheet** print mode: labels tiled into an A4 (or Letter) grid, page-broken correctly, with optional cut guides.
4. PDF export that preserves the vector barcode.
5. A settled, tested rule about what may and may not appear on a physical label.

Non-goals are in §14.

---

## 2. Business workflow

The shop receives a delivery, prices it, and needs stickers on the boxes before they hit the shelf.

1. Admin opens **Products**, filters to the new arrivals (search, brand, or *Without Barcode*).
2. Ticks the products, or ticks the header box to take every product on the page. Selection survives pagination, so several pages can be accumulated.
3. The bulk bar shows `12 selected` with **Clear**, **Print Labels**, and a readiness hint if any selected product cannot produce a good label.
4. **Print Labels** opens the label sheet preview at `/products/labels?ids=…`.
5. The preview shows the labels laid out exactly as they will print — A4 page outlines, grid, cut guides.
6. Admin adjusts sheet settings if needed (paper, label size, gap, margin) and sees the page count update.
7. **Print** → the OS print dialog → paper. Or **Export PDF** → a save dialog → a `.pdf` on disk.
8. Admin cuts the sheet along the guides and applies the stickers.

Failure paths that must be visible, not silent: a product that was archived between selection and print, a product whose pricing preset is missing so no price code can be produced, and a label size that cannot fit the chosen paper.

---

## 3. Bulk selection workflow

### 3.1 Selection semantics

| Rule | Behaviour |
|---|---|
| Storage | Keep the existing `Set<string>` in `ProductsPage` state. Do **not** move it to the URL — 100 cuids would bloat every filter change. |
| Select all | Header checkbox = *all rows currently rendered* (the current page), matching the shipped `onSelectAll`. Label it **"Select page"**, not "Select all", to kill the ambiguity. |
| Across pages | Selection persists when paginating (already true). The bar must say so: `12 selected across 2 pages` when the selection contains ids not on the current page. |
| Tab switch | Active ↔ Archived already clears selection (`setStatus`). Keep — mixing archived into a print job is the exact thing §12 forbids. |
| Clear | New explicit **Clear** button in the bar. |
| Cap | Hard cap **100**. The shipped `.slice(0, 40)` is a silent truncation; replace it with a cap that *tells the user* (`"Only the first 100 of 137 selected products will be printed"`). |

### 3.2 Bulk action bar

Replaces the bare `<Link>` currently sitting in the tab strip. A sticky bar that appears only when `selectedIds.size > 0`:

```
┌──────────────────────────────────────────────────────────────────────┐
│  ☑ 12 selected / محدد   ·   across 2 pages      [Clear] [🖨 Print Labels] │
│  ⚠ 1 product has no pricing preset — price code will be blank         │
└──────────────────────────────────────────────────────────────────────┘
```

Readiness is computed from data already on the `Product` list rows where possible (no extra request); anything only the backend knows (pricing availability) surfaces as a warning on the preview screen instead.

### 3.3 Filters

`ProductFilters` already offers search, brand, `hasBarcode` (With/Without/Any) and the Active/Archived tabs. That covers the brief's "Active only" and "Missing barcode".

- **Missing SKU** — SKU appears to be system-generated and non-nullable (`sku: string` on both `Product` and `ProductLabelData`, plus a `regenerate-sku` endpoint). **CP1 must confirm** whether a product can exist without a SKU. If it cannot, drop this filter rather than shipping a control that always returns zero rows.
- **Missing label data** — too vague to implement as a server filter. Express it as the readiness badge instead (§10.4).

---

## 4. Label content rules

### 4.1 Printed label (physical sticker) — English only, no `dir="auto"`

```
BRAND                     ← omitted entirely when brand is null
Product Name              ← 2 lines max, clamped
Model: MODEL-123          ← "Model: —" when blank
SKU: HC-000124P353        ← staffLabelCode when the price code is on, plain sku otherwise
[|||| CODE128 ||||]
   HC-000124              ← jsbarcode displayValue text, doubles as the fallback
```

Rendering rules, all of which the shipped `ProductLabel.tsx` already satisfies:

| Field | Rule |
|---|---|
| Brand | Render only when non-null. No empty line. |
| Name | `-webkit-line-clamp: 2`, overflow hidden. Never pushes the barcode off the label. |
| Model | Always rendered. Show `—` if empty — a missing model must not shift the layout. |
| SKU / code | One line, monospace. `staffLabelCode ?? sku`. **Never** captioned as anything but `SKU:`. |
| Barcode | CODE128, `displayValue: true`. On `JsBarcode` throw → plain-text fallback (implemented). |
| Language | Hardcoded English strings inside the label component. It must not import `businessLabels` or `productLabels`, and must not set `dir`. |

### 4.2 Forbidden on the printed label

Cash price *(subject to D1)*, installment price, real cost, supplier cost, profit %, expenses %, discount buffer %.

The enforcement point is **the payload, not the JSX**. The backend must not send a field the label may not show — a field that reaches the renderer is a field that reaches the network tab and any exported PDF's metadata path.

### 4.3 UI chrome vs. label content

Everything *around* the label — buttons, settings, warnings, page title — stays bilingual EN/AR per the existing convention (`Print / طباعة`, `Products / المنتجات`). The label itself is English-only. The `.no-print` class already keeps the bilingual chrome off the paper.

---

## 5. Paper / layout strategy

### 5.1 Two print modes, one selector

| Mode | `@page size` | Use |
|---|---|---|
| **Sheet** *(new, default for bulk)* | `A4` / `Letter` portrait | Plain paper, many labels, cut by hand |
| **Sticker** *(existing behaviour)* | `{labelW}mm {labelH}mm`, margin 0 | Dedicated die-cut label stock, one per page |

`ProductLabelPage` (single product, N copies) keeps Sticker as its default. `ProductLabelsPage` (bulk) defaults to Sheet.

### 5.2 Settings model

Extend `utils/product-label-settings.ts`. Its current shape is `{ widthMm, heightMm, autoFit }` persisted at `homeconnect.product-label-dimensions`, guarded by `valid()` (finite, 20–150).

```ts
export type LabelPrintMode = 'SHEET' | 'STICKER';
export type LabelPaperSize = 'A4' | 'LETTER';

export interface ProductLabelSheetSettings {
  mode: LabelPrintMode;      // default 'SHEET' for bulk
  paper: LabelPaperSize;     // default 'A4'
  labelWidthMm: number;      // default 50   (provisional — see D4)
  labelHeightMm: number;     // default 30   (provisional — see D4)
  pageMarginMm: number;      // default 8
  labelGapMm: number;        // default 3
  columns: number | 'AUTO';  // default 'AUTO'
  showCutGuides: boolean;    // default true
}
```

Compatibility requirements for the loader:
- Old stored objects contain only `{ widthMm, heightMm, autoFit }`. Migrate: `labelWidthMm ← widthMm`, `labelHeightMm ← heightMm`, `mode ← autoFit ? 'STICKER' : 'STICKER'` (old behaviour was always per-label pages), everything else default.
- Each new numeric field needs its own guard band — reusing `valid()` (20–150) for `pageMarginMm` and `labelGapMm` would reject every sane value. Margins/gaps: `0 ≤ v ≤ 30`.
- A malformed blob must still fall back to defaults without throwing (already the pattern).

**Do not hardcode 50×30mm.** It is the current default and stays the default, but every consumer must read it from settings. See D4.

### 5.3 Grid math

```
paperW(A4) = 210mm, paperH(A4) = 297mm
paperW(Letter) = 215.9mm, paperH(Letter) = 279.4mm

usableW = paperW - 2 × pageMarginMm
usableH = paperH - 2 × pageMarginMm

columns = clamp(1, floor((usableW + gap) / (labelW + gap)))     // when 'AUTO'
rows    = clamp(1, floor((usableH + gap) / (labelH + gap)))
perPage = columns × rows
pages   = ceil(labelCount / perPage)
```

A4 at the 50×30mm default with 8mm margin and 3mm gap gives **3 columns × 8 rows = 24 labels per page**. Keep this as a documented worked example and as a unit-test fixture — it is the fastest regression signal if the math drifts.

The calculation belongs in a pure, tested helper (`utils/label-sheet-layout.ts`), not inline in a component. It also produces the warnings in §12.

### 5.4 Pagination of labels

The preview chunks labels into pages of `perPage` and renders one `.label-page` element per chunk, each a fixed `paperW × paperH` block with `break-after: page` (last page excepted). This makes the on-screen preview structurally identical to the printed output — the requirement that "preview should match printed output" is met by construction rather than by CSS coincidence.

---

## 6. Print CSS strategy

Location: `frontend/src/styles/index.css` (single stylesheet; the existing label rules live at ~lines 82–110 and ~144–147).

### 6.1 Fix the global `@page` first

`index.css:64` currently forces `@page { size: 50mm 30mm; margin: 2mm }` on the **whole application**. Every other print in HomeConnect inherits it. Remove it from the global block and let each print surface inject its own, as `ProductLabelPrintSettings` already does. This is a prerequisite for CP5 and a genuine (if quiet) bug fix.

### 6.2 Injected page rule

```tsx
// Sheet mode
<style>{`@media print { @page { size: ${paper === 'A4' ? 'A4' : 'letter'} portrait; margin: 0; } }`}</style>
// Sticker mode (unchanged)
<style>{`@media print { @page { size: ${w}mm ${h}mm; margin: 0; } }`}</style>
```

`margin: 0` at the `@page` level, with the visual margin implemented as padding on `.label-page`. Mixing printer margins with CSS margins is the classic source of "the last row falls off the page".

### 6.3 Sheet rules

```css
.label-page {
  box-sizing: border-box;
  width: var(--paper-width);        /* 210mm */
  height: var(--paper-height);      /* 297mm */
  padding: var(--page-margin);      /* 8mm  */
  display: grid;
  grid-template-columns: repeat(var(--label-columns), var(--label-width));
  grid-auto-rows: var(--label-height);
  gap: var(--label-gap);
  align-content: start;
  justify-content: start;
  background: #fff;
}

@media print {
  .label-page { break-after: page; page-break-after: always; }
  .label-page:last-child { break-after: auto; page-break-after: auto; }
  .product-label { break-inside: avoid; page-break-inside: avoid; }
}
```

- On screen the same `.label-page` gets a border and drop shadow (a visible "sheet of paper"); in print those are stripped.
- Cut guides: a `1px dashed #cbd5e1` border on `.product-label` when `showCutGuides`, otherwise `border: 0`. The existing print override sets `border: 0` unconditionally (`index.css:146`) — that must become conditional on the guides flag.
- Keep `-webkit-print-color-adjust: exact` so the barcode stays solid black.
- The existing `.no-print` / `aside` / `header` hiding is sufficient; no new chrome-hiding work.
- All label typography stays in `pt`, all geometry in `mm`. No `rem` or `px` inside a label — browser zoom must not change a physical sticker's size.

### 6.4 Preview scaling

The A4 sheet is wider than most preview panes. Scale the *container*, never the label:

```css
.label-sheet-preview { transform: scale(var(--preview-scale)); transform-origin: top left; }
@media print { .label-sheet-preview { transform: none; } }
```

`--preview-scale` is computed from the container width. Using `transform` (not width shrinking) guarantees the preview is a true optical reduction of the printed page.

---

## 7. PDF export strategy

### 7.1 Options assessed against this repo

| Option | Verdict |
|---|---|
| **A — `window.print()` → "Microsoft Print to PDF"** | Already works today. Zero code, zero deps. Costs the user two dialogs and gives no filename control. **Ship as the baseline.** |
| **B — client-side `jsPDF`** | `jspdf@^4.2.1` is installed but unused, and `html2canvas` is **not** installed. `jsPDF` cannot lay out HTML by itself; the canvas route **rasterises the barcode**, which is a direct hit to the one thing that must work — scanning. Rejected. |
| **C — backend PDF** | Needs Puppeteer/Chromium or PDFKit. Large install, packaging pain for the Windows installer, and re-implements a layout the frontend already has. Rejected. |
| **D — Electron `webContents.printToPDF` over IPC** | Uses the Chromium engine already in the app. Keeps the barcode **vector**. Honours the same print CSS, so PDF and paper are identical by construction. Zero new npm packages. Fits the existing `contextBridge`/`invoke` pattern. **Recommended for the explicit Export PDF button.** |

### 7.2 Recommendation

**Ship A and D. Skip B and C.**

- **Print** button → `window.print()`. Works identically in the browser dev environment and in Electron.
- **Export PDF** button → `window.electronAPI.exportLabelsPdf(...)` when available; when `window.electronAPI` is undefined (browser dev), the button falls back to `window.print()` with a hint to choose *Save as PDF*. No feature is browser-only broken, and nothing new is bundled.

### 7.3 Electron implementation sketch (CP6)

```
renderer  →  window.electronAPI.exportLabelsPdf({ suggestedName, paper })
preload   →  ipcRenderer.invoke('labels:exportPdf', payload)      // new channel, same shape as backup:*
main      →  dialog.showSaveDialog({ defaultPath, filters: [{ name: 'PDF', extensions: ['pdf'] }] })
          →  webContents.printToPDF({ pageSize: 'A4', printBackground: true, margins: { marginType: 'none' } })
          →  fs.writeFile(chosenPath, buffer)
          →  { saved: true, path } | { saved: false }             // cancel is not an error
```

Points to get right:

- The renderer must be in its print layout when `printToPDF` runs. `printToPDF` applies print media rules, so the injected `@page` and `@media print` blocks take effect — but the app chrome must already be `.no-print`-hidden, which it is.
- `pageSize` must be derived from the chosen paper setting, not hardcoded.
- Suggested filename: `product-labels-YYYY-MM-DD-{n}.pdf`.
- User cancellation returns `{ saved: false }` — never throw, never toast an error.
- Add the channel to `desktop/src/preload.ts` and cover it in `desktop/src/preload.test.ts`, which already asserts the exposed surface.
- **No CSP change should be needed** (no `blob:` URL, no rasterisation, nothing leaves the main process). Confirm against `desktop/src/content-security-policy.ts` in CP6 rather than assuming.

### 7.4 Security posture

No remote resources, no external fonts (Tahoma/Arial are system fonts, already the print family), barcode generated locally by `jsbarcode`, no upload, no cloud service, file written only to a path the user picked through the native dialog.

---

## 8. Barcode / SKU strategy

Already implemented and correct — the job here is to **not regress it**.

| Rule | Where it lives today |
|---|---|
| Default encode value = SKU | `products.service.ts:303,314` — `barcodeValue = usesManufacturer ? barcode : sku` |
| Manufacturer barcode opt-in | `Product.labelBarcodeSource` enum (`SKU` \| `MANUFACTURER`), per product, already in the schema and validator |
| Missing manufacturer barcode | `usesManufacturer` requires `Boolean(product.barcode)`, so it silently falls back to SKU. **Add a warning** (`MANUFACTURER_BARCODE_MISSING`) so the fallback is visible rather than silent |
| Symbology | CODE128 via `jsbarcode`, `width: 1.25`, `height: 38`, `displayValue: true`, `fontSize: 10` |
| Failure fallback | `try/catch` → `.product-label-barcode-text` |
| Missing SKU | Confirm in CP1 whether reachable. If it is: exclude the product with a `NO_SKU` warning rather than auto-generating — SKU regeneration is an admin-password, audited operation (`regenerate-sku`) and must not happen as a side effect of pressing Print |

Scan quality note for CP7 manual testing: at the 50mm default with 2mm padding a CODE128 barcode of a ~10-char SKU is comfortably scannable at 300dpi. If D4 lands on a *smaller* label, the barcode `width` multiplier must be re-tuned and re-scanned from real paper. Do not shrink below the tested size without a physical scan test.

---

## 9. Backend API plan

### 9.1 New endpoint

```
GET /api/v1/products/labels?ids=<csv>&includePriceCode=true|false&includePrice=true|false&includeArchived=true|false
```

**Route registration order matters.** `products.routes.ts` ends with `GET /:productId`, so `/labels` must be registered **above** it or it will be swallowed as a product id. `check-duplicate` is the existing precedent for this.

```ts
productsRoutes.get('/labels', validate(productLabelsQuerySchema, 'query'), ProductsController.labels);
```

### 9.2 Validator (`products.validator.ts`)

```ts
export const productLabelsQuerySchema = z.object({
  ids: z.string().transform(csv => [...new Set(csv.split(',').map(s => s.trim()).filter(Boolean))])
        .pipe(z.array(z.string().min(1)).min(1, 'Select at least one product').max(100, 'Select at most 100 products')),
  includePriceCode: z.enum(['true','false']).optional().transform(v => v === 'true'),
  includePrice:     z.enum(['true','false']).optional().transform(v => v === 'true'),
  includeArchived:  z.enum(['true','false']).optional().transform(v => v === 'true'),
});
```

The `z.enum(['true','false']).transform` idiom mirrors the shipped `productLabelQuerySchema` exactly — keep the house style.

### 9.3 Service

Refactor `ProductsService.label()` by extracting a pure `toLabelPayload(product, preview, query)`. The single-product endpoint then becomes a one-item call through the same function, guaranteeing the two endpoints can never diverge in what they expose.

```ts
static async labels(query: ProductLabelsQueryInput) {
  const products = await ProductsRepository.findManyByIds(query.ids);          // 1 query
  const preset = (query.includePriceCode || query.includePrice)
    ? await ProductsRepository.findActiveDefaultPricingPreset() : null;        // 1 lookup, not N
  const warnings: LabelWarning[] = [];
  const labels = [];
  for (const id of query.ids) {                        // preserve caller order
    const product = products.get(id);
    if (!product) { warnings.push({ productId: id, code: 'NOT_FOUND' }); continue; }
    if (!product.isActive && !query.includeArchived) { warnings.push({ productId: id, code: 'ARCHIVED_EXCLUDED', name: product.name }); continue; }
    const { payload, itemWarnings } = toLabelPayload(product, preset, query);
    labels.push(payload); warnings.push(...itemWarnings);
  }
  return { labels, warnings };
}
```

New repository method `findManyByIds(ids: string[])` → single `findMany({ where: { id: { in: ids } } })` returned as a `Map`.

### 9.4 Response contract

```jsonc
{ "success": true,
  "data": {
    "labels": [{
      "id": "…", "name": "…", "model": "…", "brand": "…"|null,
      "sku": "HC-000124", "barcodeValue": "HC-000124", "barcodeSource": "SKU"|"MANUFACTURER",
      "internalPriceCode": "P353"|null,        // only when includePriceCode
      "staffLabelCode": "HC-000124P353"|null   // only when includePriceCode
      // "cashPrice" only when includePrice — see D1
    }],
    "warnings": [{ "productId": "…", "code": "ARCHIVED_EXCLUDED", "name": "…" }]
  }}
```

Warning codes: `NOT_FOUND`, `ARCHIVED_EXCLUDED`, `NO_PRICING` (preset missing so the price code is blank), `MANUFACTURER_BARCODE_MISSING`, `NO_SKU` *(only if reachable)*.

**Never present, under any flag:** `costPrice`, supplier cost, `installmentPrice`, profit %, expenses %, discount buffer %, `pricingPresetId`, `useCustomPricing`, `notes`, stock. This is asserted by an exact-key-set test (§13), not by review.

### 9.5 Frontend API client

```ts
labels: async (ids: string[], includePriceCode = false, includePrice = false): Promise<ProductLabelsResult> =>
  (await api.get('/products/labels', { params: { ids: ids.join(','), includePriceCode, includePrice } })).data.data,
```

Query-string length: 100 cuids ≈ 2.6 KB — comfortably within limits for a loopback Express server. No POST needed. If CP1 finds a lower practical cap, fall back to `POST /products/labels/preview` with the same response shape.

---

## 10. Frontend UI / UX plan

### 10.1 Routing — keep what exists

`/products/labels?ids=…` is already registered and already deep-linkable. Keep it. A modal would make the A4 preview cramped and would break print (the app shell would still be in the document). **No routing change.**

### 10.2 Components

| Component | Status | Responsibility |
|---|---|---|
| `ProductBulkActionsBar` | **New** | Count, "across N pages", Clear, Print Labels, cap warning |
| `ProductLabelSheet` | **New** | Chunks labels into `.label-page` blocks, sets CSS vars, applies preview scale |
| `LabelSheetLayoutControls` | **New** (or an extension of `ProductLabelPrintSettings`) | Mode, paper, label W/H, margin, gap, columns, cut guides, price-code toggle; injects the `@page` style; shows `24 per page · 2 pages` |
| `ExportPdfButton` | **New** | Electron IPC with `window.print()` fallback; disabled while loading |
| `LabelReadinessBadge` | **New** | Per-row/per-label indicator for missing manufacturer barcode or unavailable pricing |
| `ProductLabel` | **Exists** | Unchanged except for the price rule (D1) and cut-guide border |
| `ProductLabelPrintSettings` | **Exists** | Kept for the single-product Sticker flow; refactored so both screens share the `@page` injector |
| `ProductsTable` | **Exists** | Header checkbox relabelled "Select page"; optional readiness column |

### 10.3 Data hook

Replace `useQueries` in `ProductLabelsPage` with a single `useProductLabels(ids, { includePriceCode, includePrice })`. Query key: `[...productKeys.all, 'labels', sortedIdsJoined, includePriceCode, includePrice]` — sorted so reordering the selection doesn't blow the cache. Keep `productKeys.label` for the single-product page.

### 10.4 States

- **Loading** — skeleton grid sized to the computed `perPage`, so the layout does not jump.
- **Empty** (`ids` missing/invalid) — existing amber panel, plus a *Back to Products* link.
- **Partial** — labels render; a `.no-print` amber panel lists warnings by product name (`"2 archived products were excluded"`).
- **Over cap** — `.no-print` notice naming the number dropped.
- **Won't fit** — layout error panel with Print/Export disabled (§12).

### 10.5 Icons and bilingual chrome

`lucide-react` is already the icon set: `Printer` (print), `FileDown` (export PDF), `Barcode` (readiness), `CheckSquare`/`X` (selection), `Settings2` (layout). All controls follow the existing `English / العربية` caption pattern. The labels themselves stay English-only.

---

## 11. Admin / permission policy

Current state: all `/products` routes sit behind `requireAuth`; only mutations add `requireServiceAdmin`. Reading a label — including `staffLabelCode` and `cashPrice` — is available to any authenticated user today.

Proposed policy:

| Action | ADMIN | EMPLOYEE |
|---|---|---|
| Select products, open the label sheet | ✅ | ✅ |
| Print labels **without** the price code | ✅ | ✅ |
| Include the internal price code / any price on the label | ✅ | **See D2** |
| Export PDF | ✅ | same rule as print |
| Change label settings *globally* (if these ever move server-side) | ✅ (admin password) | ❌ |
| Regenerate SKU, change barcode, change price code | ✅ (admin password, audited — already enforced) | ❌ |

**No admin password to print.** Printing is a read operation and is done constantly; gating it behind a password would get worked around. The existing password gates on SKU/barcode/pricing mutations are unchanged and untouched by this feature.

**No new audit records.** `ServiceAudit` tracks mutations; a print job mutates nothing. If print history is ever wanted it is a separate feature, not this one.

---

## 12. Validation rules

### Selection / request
- ≥ 1 id, else 400 `Select at least one product`.
- ≤ 100 ids after dedupe, else 400. Frontend caps first and *says so*.
- Unknown ids → `NOT_FOUND` warning, **not** a failed request. One deleted product must not kill a 40-label job.
- Archived excluded unless `includeArchived=true`; each exclusion produces a warning.
- Ids deduped on both tiers (the frontend already does this).

### Payload
- Forbidden fields (§9.4) absent under every flag combination.
- `includePriceCode=false` ⇒ neither `internalPriceCode` nor `staffLabelCode` present in the JSON (absent keys, not `null`).

### Layout (pure helper, all warnings surfaced before printing)
| Check | Failure |
|---|---|
| `labelWidthMm > 0`, `labelHeightMm > 0` | Block print |
| `pageMarginMm ≥ 0`, `labelGapMm ≥ 0` | Block print |
| `labelWidthMm + 2×margin ≤ paperWidth` | Block print — *"A 90mm label does not fit A4 with 8mm margins"* |
| `labelHeightMm + 2×margin ≤ paperHeight` | Block print |
| `columns` (manual) × width + gaps ≤ usable width | Warn and clamp to the computed max |
| `perPage ≥ 1` | Guaranteed by the two blocking checks above |
| `pages > 20` | Soft warning — *"This will print 24 pages"* |

Print and Export are **disabled** while any blocking condition holds, with the reason stated inline rather than as a toast.

---

## 13. Testing strategy

Existing suites to extend, not replace: `backend/src/features/service/products/products.routes.test.ts`, `frontend/src/features/products/components/products.components.test.tsx`. Runner is `vitest` (`vitest.config.ts` at the root); backend HTTP tests use `supertest`.

### Backend (`products.routes.test.ts`)
1. `GET /products/labels?ids=a,b,c` returns three labels **in the requested order**.
2. Archived product excluded by default → absent from `labels`, present in `warnings` as `ARCHIVED_EXCLUDED`.
3. `includeArchived=true` includes it.
4. Unknown id → 200 with a `NOT_FOUND` warning; valid siblings still returned.
5. `barcodeValue === sku` when `labelBarcodeSource = SKU`.
6. `labelBarcodeSource = MANUFACTURER` with a null barcode → falls back to SKU **and** emits `MANUFACTURER_BARCODE_MISSING`.
7. **Exact key-set assertion** on a label object — the single highest-value test in this plan. Guarantees no cost/installment/percentage/price field can be added by accident later.
8. `includePriceCode=false` ⇒ `internalPriceCode`/`staffLabelCode` keys absent.
9. Null brand serialises as `null` and does not throw.
10. `ids=` empty → 400; 101 ids → 400.
11. Single-product `/:productId/label` is unchanged (regression guard on the shared `toLabelPayload`).
12. `/products/labels` is not shadowed by `/:productId` (i.e. it does not 404 as a missing product).

### Layout helper (`label-sheet-layout.test.ts`, new)
13. A4 / 50×30 / 8mm margin / 3mm gap → `columns 3`, `rows 8`, `perPage 24`.
14. 25 labels → 2 pages; 24 → 1 page; 0 → 0 pages.
15. Letter produces a different column count than A4 at the same label size.
16. Oversize label → blocking `WONT_FIT` result, no negative or zero dimensions.
17. Manual `columns` above the fitting maximum is clamped and warned.

### Frontend (`products.components.test.tsx` + new)
18. Ticking rows updates the selected count.
19. "Select page" ticks every visible row; unticking clears them.
20. Clear empties the selection and hides the bar.
21. Print Labels is absent/disabled at zero selection.
22. Selection survives a page change.
23. Sheet preview renders N labels across the expected number of `.label-page` elements.
24. A label shows name, `Model:`, `SKU:`, and a barcode node.
25. **A label never renders a cost, installment, or percentage** — and, per D1, no cash price in the bulk sheet.
26. Missing brand → no brand element, and the layout still renders.
27. Missing model → `Model: —`.
28. Barcode failure path renders the text fallback.
29. Export PDF renders; with `window.electronAPI` undefined it falls back to print rather than throwing.
30. Layout controls reject a negative gap and a zero width.
31. Warnings panel lists excluded archived products by name.

### Desktop (`desktop/src/preload.test.ts`)
32. `exportLabelsPdf` is exposed on `window.electronAPI`.
33. A cancelled save dialog resolves `{ saved: false }` and does not reject.

### Manual (CP7 — must be done on real paper, not screenshots)
- Print 1 label; print 24 (a full A4 page); print 25 (page-break boundary).
- Verify no clipping at the right edge and the bottom row.
- Export a PDF and confirm the barcode is **vector** (zoom to 800% — it must stay sharp).
- **Scan a barcode off the printed paper with the shop scanner.** Non-negotiable acceptance criterion.
- Cut along the guides; confirm nothing important sits within 2mm of a cut line.
- Confirm no price/cost anywhere on the sheet, and that the price code appears only when enabled.
- Repeat once at Letter and once with a non-default label size (D4 protection).

---

## 14. What is out of scope

Inventory management, stock movement, sales checkout, customer debt, automatic price display, a WYSIWYG label designer, paid or cloud PDF services, QR codes, direct label-printer driver integration (Zebra/Dymo/ZPL/EPL) beyond the browser and Electron print paths, batch SKU regeneration, label templates per product category, saved/named layout presets, print history or audit of print jobs, emailing or sharing the PDF, and any Arabic text on the physical sticker.

---

## 15. Implementation checkpoints for Codex

Each checkpoint is independently reviewable. Do not start CP2 before D1 and D2 are answered.

**CP1 — Confirm the unknowns (read-only, no code).**
- Can a `Product` exist with a null/empty SKU? (Decides the `NO_SKU` path and the "Missing SKU" filter.)
- Confirm route-order behaviour for `/labels` vs `/:productId` in Express 5.
- Confirm nothing else in the app depends on the global `@page { size: 50mm 30mm }` at `index.css:64`.
- Confirm the practical query-string cap for 100 ids against the running backend.
- Confirm the CSP needs no change for `printToPDF`.
- Output: a short findings note appended to this document. No production code.

**CP2 — Backend bulk endpoint.**
`findManyByIds` in the repository; extract `toLabelPayload`; add `ProductsService.labels`; `productLabelsQuerySchema`; controller; route registered **above** `/:productId`. Wire warnings. Tests 1–12. The single-product endpoint's behaviour must not change.

**CP3 — Selection state and bulk bar.**
`ProductBulkActionsBar`; count + "across N pages"; Clear; 100 cap with a visible message replacing the silent `.slice(0, 40)`; relabel the header checkbox "Select page". Tests 18–22.

**CP4 — Sheet preview.**
`utils/label-sheet-layout.ts` (pure, tested first — tests 13–17); `useProductLabels` replacing `useQueries`; `ProductLabelSheet` with `.label-page` chunking; `LabelSheetLayoutControls`; extended settings with the legacy-shape migration. Tests 23–24, 31.

**CP5 — Print CSS.**
Remove the global `@page`; add `.label-page` rules and print overrides; scoped `@page` injection per mode; conditional cut guides; preview scaling. Verify Sticker mode still prints exactly as before. This is the checkpoint where a physical test print is required.

**CP6 — PDF export.**
`labels:exportPdf` channel in `desktop/src/preload.ts` + main-process handler (`dialog.showSaveDialog` → `webContents.printToPDF` → `fs.writeFile`); `ExportPdfButton` with the browser fallback. Tests 29, 32, 33. **No new npm dependency.** If a dependency looks unavoidable, stop and report rather than installing.

**CP7 — Validation, warnings, polish.**
Blocking layout checks with disabled actions and inline reasons; readiness badges; loading/empty/partial states; responsive controls; the full manual test pass including a real scanner read.

**CP8 — Tests and docs.**
Close out any remaining tests from §13; update `claude/documentation/` for the products/labels area; move this plan to `claude/plans/Completed/` on completion. No version bump, no installer, no commit unless separately instructed.

---

## 16. Risks and open decisions

### Decisions the owner must make

**D1 — Does the cash price stay on the label?** *(blocks CP2)*
The brief says never. The shipped code says yes, opt-in, defaulting to **on**, with dedicated CSS — and an earlier plan removed it once already before it returned. Someone decided this deliberately.
**Recommendation:** in the **bulk sheet** flow, default `includePrice` to **false** and remove the price row from the sheet renderer; leave the single-product Sticker flow's existing toggle alone. This honours the brief where the brief applies (bulk shelf labels) without silently deleting a feature that is in daily use. If the owner wants the price gone everywhere, that is a one-line payload change plus deleting `.product-label-price` — but it must be an explicit call.

**D2 — Can employees print labels carrying the price code?** *(blocks CP2)*
`staffLabelCode` encodes the price. The endpoint is currently ungated, and bulk-ifying it raises the exposure from 1 to 100 products per call.
**Recommendation:** allow employees to print labels, but require ADMIN for `includePriceCode=true` (and for `includePrice=true` if D1 keeps it). Flagged because it *removes* a capability employees have today — confirm the shop actually works that way before enforcing it.

**D3 — Label the price code as a separate `Code:` line?**
The brief's example shows one. The shipped design deliberately hides it inside the `SKU:` line so customers cannot tell it is a code.
**Recommendation:** keep the shipped camouflage. Do not add a `Code:` line.

**D4 — Confirm the physical label size.**
50×30mm is the current default and this plan keeps it, but it is explicitly provisional. If real sticker stock is smaller, the barcode module width and the font sizes need re-tuning **and a physical scan test**. Everything stays configurable regardless; the risk is only in the default.

### Risks

| Risk | Mitigation |
|---|---|
| Printer-driver margins silently shrink the page and drop the last row | `@page margin: 0` + padding on `.label-page`; mandatory physical test print at CP5 |
| Removing the global `@page` regresses another print surface | CP1 checks for dependents; Sticker mode re-verified at CP5 |
| Barcode unscannable at small sizes or after rasterisation | `printToPDF` keeps vectors; scanner test is a hard acceptance criterion |
| Legacy `localStorage` settings crash the new loader | Migration path + per-field guards + the existing malformed-JSON fallback; covered by a unit test |
| `/products/labels` shadowed by `/:productId` | Registration order + test 12 |
| Chrome page-break behaviour differs between Electron 43 and the dev browser | Print verification done in the Electron build, which is the shipping target |
| Scope creep into a label designer | §14 is binding |

---

## 17. Exact files likely to change

### Backend
| File | Change |
|---|---|
| `backend/src/features/service/products/products.routes.ts` | Register `GET /labels` **above** `GET /:productId` |
| `backend/src/features/service/products/products.controller.ts` | `static async labels(...)` |
| `backend/src/features/service/products/products.service.ts` | Extract `toLabelPayload`; add `labels()`; single preset lookup; warning codes |
| `backend/src/features/service/products/products.validator.ts` | `productLabelsQuerySchema` + exported type |
| `backend/src/features/service/products/products.repository.ts` | `findManyByIds(ids)` → `Map` |
| `backend/src/features/service/products/products.routes.test.ts` | Tests 1–12 |

### Frontend
| File | Change |
|---|---|
| `frontend/src/pages/products/ProductsPage.tsx` | Bulk bar wiring; 100 cap with a visible message; clear-selection |
| `frontend/src/pages/products/ProductLabelsPage.tsx` | Single bulk query; sheet renderer; warnings; export button |
| `frontend/src/pages/products/ProductLabelPage.tsx` | Share the `@page` injector; Sticker mode unchanged |
| `frontend/src/features/products/components/ProductsTable.tsx` | "Select page" wording; optional readiness column |
| `frontend/src/features/products/components/ProductBulkActionsBar.tsx` | **New** |
| `frontend/src/features/products/components/ProductLabelSheet.tsx` | **New** |
| `frontend/src/features/products/components/LabelSheetLayoutControls.tsx` | **New** |
| `frontend/src/features/products/components/ExportPdfButton.tsx` | **New** |
| `frontend/src/features/products/components/LabelReadinessBadge.tsx` | **New** |
| `frontend/src/features/products/components/ProductLabel.tsx` | Price rule (D1); cut-guide border; English-only strings confirmed |
| `frontend/src/features/products/components/ProductLabelPrintSettings.tsx` | Refactor the `@page` injector for reuse |
| `frontend/src/features/products/utils/product-label-settings.ts` | Sheet settings, migration, per-field guards |
| `frontend/src/features/products/utils/label-sheet-layout.ts` | **New** — pure grid math |
| `frontend/src/features/products/utils/label-sheet-layout.test.ts` | **New** — tests 13–17 |
| `frontend/src/features/products/api/products.api.ts` | `labels(ids, …)` |
| `frontend/src/features/products/hooks/useProducts.ts` | `productKeys.labels`, `useProductLabels` |
| `frontend/src/features/products/types/product.types.ts` | `ProductLabelsResult`, `LabelWarning`, sheet settings types |
| `frontend/src/features/products/components/products.components.test.tsx` | Tests 18–31 |
| `frontend/src/styles/index.css` | Remove global `@page`; `.label-page` grid; print overrides; conditional guides; preview scale |

### Desktop
| File | Change |
|---|---|
| `desktop/src/preload.ts` | Expose `exportLabelsPdf` |
| `desktop/src/preload.test.ts` | Test 32 |
| `desktop/src/index.ts` | `ipcMain.handle('labels:exportPdf', …)` (dialog → `printToPDF` → write) |
| `desktop/src/content-security-policy.ts` | Verify only; change expected to be unnecessary |

### Not changing
`prisma/schema.prisma` (no migration — `sku`, `barcode`, `labelBarcodeSource` all exist), `package.json` (no new dependency, no version bump), pricing calculator, audit models, installer config.

---

---

## 18. CP1 findings and build status (added 2026-08-04, after implementation)

### CP1 answers

| Question | Answer | Effect |
|---|---|---|
| Can a product exist without a SKU? | **No.** `schema.prisma:604` — `sku String @unique`, non-nullable | `NO_SKU` warning and the "Missing SKU" filter were **dropped as unreachable** |
| Is `/labels` shadowed by `/:productId`? | Yes if registered after it | Registered beside `check-duplicate`, above `/:productId`; covered by a route test |
| Does anything depend on the global `@page`? | **Yes — and it was a bug.** `ReportsPage` prints via `window.print()` and injects print styles that never set `@page`, so financial reports were being sent to the printer at **50mm × 30mm** | Global rule removed; `ReportsPage` given an explicit `@page { size: A4 portrait; margin: 12mm }` |
| Query-string cap for 100 ids? | ~3.7KB, well within limits on loopback | Kept `GET`; no `POST /labels/preview` needed |
| CSP change needed for `printToPDF`? | **No.** Nothing crosses the renderer boundary — no `blob:`, no rasterisation | `content-security-policy.ts` untouched |
| Does `resolveProductPricing` need the preset relation? | **Yes.** `pricing-resolution.ts:80` returns `MISSING_PRESET` when `pricingPresetId` is set but `pricingPreset` is unloaded | `findManyForLabels` includes `pricingPreset` |

### Decisions as implemented

- **D1** — the bulk sheet never requests `includePrice`, so no cash price is sent, rendered, or exportable. The single-product sticker page keeps its existing toggle untouched.
- **D2** — no new role gate; employees print labels exactly as before.
- **D3** — the `SKU:` camouflage is preserved; no separate `Code:` line was added.
- **D4** — 50 × 30mm remains the default and is fully configurable.

### Deviations from the plan

- **`LabelReadinessBadge` was not built.** The readiness signals that matter (pricing unavailable, manufacturer barcode falling back to SKU) are only known after the label call resolves, so they surface in the preview's warnings panel instead. A badge on the products list would need a second endpoint or extra list fields for no additional information.
- **Sticker mode was kept in the bulk flow.** The plan had bulk as sheet-only; that would have removed the existing one-label-per-page behaviour from anyone feeding die-cut label stock. `mode` is a setting, defaulting to `SHEET`.
- **`SelectAllCheckbox` wording was left alone** — its accessible name is already "Select all products on this page".

### Verification status

`npm run typecheck` clean · `npm test` **721 passed, 4 skipped (138 files)** · `npm run lint` 0 errors (92 pre-existing warnings, none in new files).

**Not yet done — requires physical hardware:** the manual pass in §13. Nobody has put this on paper, cut it, or scanned a printed barcode. Those remain acceptance criteria before release.

**Not done, as instructed:** no version bump, no installer, no commit.
