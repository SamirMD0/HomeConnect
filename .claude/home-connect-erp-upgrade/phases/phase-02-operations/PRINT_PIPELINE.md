# Phase 2 Prompt 01 — Existing print pipeline

**Investigated:** 2026-09-09  
**Branch:** `develop`  
**Scope:** Read-only investigation of the current renderer, print CSS, Electron bridge, label layout, PDF path, and shared bilingual-label code. No application code or production data was changed.

## Conclusion

HomeConnect already has a sound browser-native print architecture. Product labels are ordinary React DOM rendered on authenticated, dedicated routes. Screen-only controls carry `.no-print`; each print surface injects its own `@page` rule; the global print media rules remove application chrome; and `window.print()` hands the same DOM to Chromium. Bulk labels model actual sheets in millimetres and paginate before rendering.

PDF export does **not** use `jspdf`. In Electron it invokes `webContents.printToPDF()` through a narrow preload/IPC bridge. In a normal browser it opens `window.print()` and tells the operator to select **Save as PDF**. Although `jspdf` is installed, it is imported nowhere in executable source. Existing report code explicitly avoids it because its built-in fonts do not provide reliable Arabic glyphs or RTL shaping. The document work should preserve the browser/Chromium route instead of following Prompt 02's outdated “same jspdf approach” wording.

The smallest reusable document foundation is therefore a thin document shell around the existing print conventions—not a PDF renderer and not an extraction of label-specific tiling or barcode logic.

## Current pipeline

```text
API label payload
  -> React label DOM + SVG barcode
  -> dedicated authenticated route
  -> screen preview (same DOM)
  -> window.print() -> Chromium print dialog -> paper / Save as PDF
                   or
  -> Electron preload -> IPC -> webContents.printToPDF() -> native save dialog
```

### Single-label route

`frontend/src/pages/products/ProductLabelPage.tsx` is mounted at `/products/:id/label` inside `DashboardLayout`.

- `useProductLabel(id, showCode, showPrice)` fetches a server-produced `ProductLabelResult` containing the printable payload and warnings.
- The page keeps copy count, price/code visibility, and physical dimensions as UI state. Copies are clamped to 1–40.
- It renders the requested number of `ProductLabel` components in `.product-label-grid`.
- `ProductLabelPrintSettings` persists label dimensions in local storage and injects `@page { size: <width>mm <height>mm; margin: 0 }`. Auto-fit uses `size: auto`.
- Back, settings, warnings, and print controls are marked `.no-print`.
- The Print button calls `window.print()` directly. There is no custom Electron handler for this call.

`frontend/src/features/products/components/ProductLabel.tsx` is the actual printable article. It uses physical `mm` dimensions and `pt` typography. `JsBarcode` writes into an SVG after render, preserving vector output. Valid EAN-13, UPC, and EAN-8 values use their native formats; other values use CODE128, with a text fallback if barcode rendering fails. This component, its barcode rules, automatic label sizing, SKU/staff code, and label-only whole-dollar price formatting are product-specific and should not become document primitives.

### Bulk-label route and A4 tiling

`frontend/src/pages/products/ProductLabelsPage.tsx` is mounted at `/products/labels?ids=...`.

- IDs are parsed, de-duplicated, and capped by the label-selection utility.
- `useProductLabels` makes one bulk API request rather than one request per product. Its query key sorts IDs for cache reuse.
- The response contains printable labels plus exclusions/fallback warnings. Print and PDF buttons remain disabled until at least one label is ready and the selected sheet geometry is valid.
- Sheet settings are validated and persisted in local storage. Defaults are A4 portrait, 50 × 30 mm labels, 8 mm page margin, 3 mm gaps, automatic columns, and cut guides.

`calculateLabelSheetLayout` in `frontend/src/features/products/utils/label-sheet-layout.ts` is a pure millimetre-based geometry calculation. It knows A4 as 210 × 297 mm and Letter as 215.9 × 279.4 mm, validates margins and label dimensions, computes usable area, clamps requested columns, derives rows and labels per page, and reports blocking problems. `chunkIntoPages` then divides the label array.

`ProductLabelSheet` renders one real paper-sized `.label-page` section per page. CSS variables carry paper size, margins, column count, label size, and gap. The exact same sections are used for preview and print. On screen, a `ResizeObserver` calculates a visual scale using 96 CSS pixels per inch so an A4 page fits its pane; print CSS removes that transform. In sticker mode there is no sheet layout: labels are listed one per printer page using the injected custom `@page` size.

`LabelSheetLayoutControls` injects the document-level page rule at runtime:

- sheet: `@page { size: A4|Letter portrait; margin: 0 }`
- sticker: `@page { size: <label-width>mm <label-height>mm; margin: 0 }`

The sheet's own padding represents the printable page margin. Printer margins remain zero, preventing the browser and the layout calculation from applying two different margins.

## Print CSS and route isolation

There is no separate print bundle or static print stylesheet. `frontend/src/styles/index.css` contains global `@media print` rules, and individual routes inject their own `@page` rule because `@page` is document-wide and cannot be scoped with a selector.

The global print rules:

- use `Tahoma, Arial, sans-serif` for the body and user-entered text;
- hide every `aside` and every `.no-print` element;
- remove `main` padding and viewport overflow;
- allow data-table panes to expand fully rather than scroll;
- remove label borders, preview shadows, preview scaling, and viewport clipping;
- preserve print colors and prevent labels breaking internally;
- insert a page break after every `.label-page` except the last.

The top application header has `.no-print`, and the navigation rail is an `aside`, so the dedicated label routes print only their content. The routes are “dedicated” in the React Router sense but still live under the authenticated `DashboardLayout`; there is no separate browser window or print-only React root.

One caveat matters for documents: the blanket `aside { display: none }` rule also hides semantic asides inside page content. A printable invoice, receipt, or statement must not put an address, totals panel, or notes intended for paper in an `<aside>`, unless the global rule is narrowed later. A document-specific root makes that cleanup safe, but changing it is not required for Prompt 01.

`ReportDetailPage` confirms the same convention outside labels: it injects `@page { size: A4 landscape; margin: 10mm }`, hides controls with `print:hidden`, and calls `window.print()`. This is useful corroboration for A4 documents, though reports currently use a different action component.

## PDF and Electron behavior

### Explicit label PDF export

`ExportPdfButton` first checks `window.electronAPI?.exportLabelsPdf`.

- In Electron, it proposes `product-labels-YYYY-MM-DD-<count>.pdf` and calls the preload bridge with the chosen A4/Letter paper.
- In a browser, it displays a bilingual hint and calls `window.print()`, where the operator selects Save as PDF.
- Cancellation is treated as an ordinary result; save or rendering errors become a toast.

`desktop/src/preload.ts` exposes only `exportLabelsPdf(options)` for this job. The main-process handler in `desktop/src/index.ts`:

1. accepts only A4 or Letter (anything other than `LETTER` becomes A4);
2. opens a native PDF save dialog;
3. asks the sender's `webContents` to `printToPDF` with `pageSize`, `printBackground: true`, and no Electron margins;
4. writes the returned PDF buffer to the selected path;
5. returns `{ saved, path?, error? }`.

Because `printToPDF` applies print media rules, it uses the same hidden chrome, injected `@page`, pagination, typography, and SVG barcode as physical printing. It exports whatever the current renderer page shows; it does not receive or reconstruct label data.

### `window.print()`

There is no `webContents.print()` call, print-event interception, printer-name selection, silent printing, or custom `window.print()` configuration under `desktop/src`. In Electron, the renderer's `window.print()` uses Chromium's ordinary print dialog. Only explicit PDF export has an IPC/main-process implementation.

### jsPDF status

`jspdf` is present in `package.json` and the lockfile but has no runtime import in this repository. It is not part of label export. A completed label design note documents why it was rejected: jsPDF alone does not lay out the HTML, while the common canvas path would rasterise the SVG barcode. `ReportExportActions` independently documents the Arabic concern: jsPDF's built-in fonts lack the glyph coverage and RTL shaping needed for Arabic customer and product names. Chromium already renders both SVG and Arabic correctly.

For Phase 2 documents, `printToPDF`/browser Save as PDF is the established “same as labels” approach.

## Data boundary

The label renderer receives display-ready values from the product-label endpoints. The API decides the barcode source and returns server-resolved price, VAT, tax, and staff-code fields; the UI renders warnings when a product is missing, archived, unpriced, or requires a barcode fallback. This is the relevant architectural lesson for invoices and receipts: the printable component should receive an immutable, display-ready API document payload. It should not query several domains or derive financial totals while rendering.

The label-specific `formatLabelPrice` is an exception designed for stickers: it rounds to whole dollars and prefixes `$`. It must not be reused for transaction documents, which need exact API strings, currency, VAT breakdowns, and potentially LBP precision.

## Shared labels and Arabic/RTL

`frontend/src/shared/labels/` currently contains only:

- `business-labels.ts`: a typed `as const` catalogue of slash-separated English/Arabic strings grouped by business area, plus bilingual validation messages;
- `business-labels.test.tsx`: workflow-level assertions that important financial forms render Arabic labels and apply automatic direction to user content.

The catalogue is reusable for matching document fields already present (`customer`, `amount`, `payment`, `total`, `paid`, `remaining`, `balance`, `dueDate`, `paymentDate`, `paymentMethod`, `reference`, product names, and notes). It does not yet contain a complete invoice/receipt/statement vocabulary, shop-header configuration, or document metadata. Missing document phrases should be added to a coherent `document` section when implementation starts instead of scattering new literals.

`frontend/src/components/ui/BilingualLabel.tsx` is also reusable. It accepts `{ en, ar }` and renders stacked or compact text. Direction is deliberately set to `rtl` on the Arabic span only; the application and its English/model/number line remain LTR. However, the existing `businessLabels` entries are slash-joined strings, not `{ en, ar }`, so these two facilities do not compose directly. Prompt 02 should choose one small representation for document labels rather than adding a third convention.

Current Arabic behavior is:

- fixed Arabic label text appears alongside English;
- an isolated Arabic span can use `dir="rtl"` via `BilingualLabel`;
- user-entered names, descriptions, and notes commonly use `dir="auto"` plus `.user-text` (`unicode-bidi: plaintext`), allowing each value to determine its own direction;
- identifiers, dates, phone numbers, and money remain LTR/tabular where appropriate;
- print changes the font stack to Tahoma/Arial, both commonly available with Arabic coverage on the target Windows environment;
- Chromium performs shaping for both paper and `printToPDF`.

The product label body itself has no document-level `dir` and does not use `BilingualLabel`; its values rely on normal browser bidi behavior. For financial documents, direction should be explicit per field: `dir="auto"` for customer/product/free text, `dir="rtl"` only for Arabic label spans or genuinely Arabic paragraphs, and `dir="ltr"` for amounts, currency codes, invoice numbers, phones, and dates. Do not switch the entire page to RTL for a bilingual side-by-side design.

There is no bundled/embedded Arabic webfont or automated PDF glyph test. Therefore Arabic paper/PDF fidelity still requires the Prompt 02 print-preview or physical-print check on the target machine.

## Smallest reusable document infrastructure

### Reuse as-is

- Dedicated authenticated React routes that render one printable subject.
- A single React DOM for both preview and output.
- `window.print()` for physical printing and browser Save as PDF.
- `.no-print`/`print:hidden`, the global print font rules, `main` print reset, and user-text bidi utilities.
- Per-route injected `@page` rules.
- `BilingualLabel`'s rule of isolating direction to the Arabic span.
- The preload/IPC/`webContents.printToPDF` pattern, after making the channel document-generic.
- Server-produced, display-ready payloads as the only financial source of truth.

### Build new in `frontend/src/features/documents/`

Keep the first implementation deliberately thin:

1. **`DocumentPrintStyles`** — injects an A4 portrait `@page` rule with one agreed page margin and exposes document-root/page class names. It should own document print rules such as page breaks, printable asides, color adjustment, and table header repetition.
2. **`DocumentActions`** — Print and Export PDF buttons, disabled until the document payload is fully loaded. It should generate an appropriate filename and use one generic Electron export bridge, falling back to `window.print()` in a browser.
3. **`DocumentPage` or `DocumentShell`** — a semantic A4 wrapper for shop header, document title/number/date, body, totals, and footer slots. Keep data and business arithmetic out of it.
4. **Document label definitions** — extend the existing shared business catalogue or add one typed document catalogue that composes directly with `BilingualLabel`.
5. **Formatting-only primitives** — direction-safe user text and exact monetary display. The money primitive may format a supplied API value and currency for display, but it must never add, subtract, round, allocate, or derive a total.

On the desktop side, generalise the label-only bridge to something like `exportDocumentPdf({ suggestedName, paper, orientation })`, with an allowlist for paper/orientation and the same native save-dialog/`printToPDF` implementation. Do not allow arbitrary file paths or raw Electron print options from the renderer. The label method can remain temporarily for compatibility and migrate when document export is introduced.

### Do not extract from labels

- `ProductLabel`, JsBarcode configuration, barcode fallback, or label price formatting.
- Sticker dimensions and auto-fit behavior.
- A4 label grid geometry, page chunking, selection limits, cut guides, or label local-storage settings.
- Product-label API types and warnings.
- Preview scaling unless document preview later proves it is necessary. A normal responsive A4 document can start with CSS width/max-width and print at natural size.

## Implementation constraints for Prompt 02

- Treat the invoice API response as a document contract. It must contain line quantity, unit price, line total, subtotal, delivery, VAT, total, paid, remaining, currency, and linked debt due date exactly as they should print. The template must not recompute them.
- Wait for the complete payload before enabling Print or Export PDF. If future documents include async images/fonts, explicitly wait for readiness before Electron export.
- Use A4 portrait unless the owner chooses otherwise. Keep the `@page` rule local to the mounted print route; never restore a global page size.
- Add document-specific print CSS under a document root. In particular, neutralise the blanket global `aside` hiding for printable document content or avoid semantic `aside` there.
- Use Chromium PDF output. Do not introduce jsPDF merely because Prompt 02 names it; that would diverge from the actual label pipeline and regress Arabic fidelity.
- Test the rendered contract values and direction attributes. Snapshot tests are useful for structure, but the required target-machine print/PDF check remains the evidence for A4 clipping and Arabic glyph shaping.

## Recommended first cut

For the first invoice, create only the document shell, A4 styles, actions, and a generic Electron PDF export path needed by that invoice. Let receipt and statement reuse those pieces in Prompts 03 and 04. Do not build a template engine, client-side PDF model, configurable layout system, or label/document super-component. Three straightforward React documents sharing a small print shell will be easier to audit and will preserve the most important property of the working label pipeline: what the operator previews is what Chromium prints.
