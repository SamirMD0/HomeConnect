# Codex Implementation Prompt — CP-RW7 / Brands

Copy everything below the line into Codex.

---

You are adding brand management to the **HomeConnect** repository (Node/Express + Prisma/Postgres, React 19 + TypeScript).

## Your source of truth

```
claude/plans/real-work-bugfix-product-inventory-workflow-plan.md
```

Read **§2.E** (current state) and **§10** in full — including **stage 0**, which is a cleanup script that already exists and which you must not run. Implement **stage 1 only.**

## The complaint, verbatim from real use

> There are many products with the same brands. Need a proper Brands section: add brands once, select existing brand from dropdown when adding/editing product, avoid typing the same brand manually repeatedly.

## Measured reality

From the 2026-08-21 backup: **402 of 404 products carry a brand, written as 205 distinct strings that represent only 179 real brands.** Twenty brands exist under two or three spellings each — `kozano` / `Kozano` / `KOZANO`.

## Non-negotiable rules

1. **No Prisma migration. No `Brand` table. No `brandId`.** `Product.brand` stays a free-text `String?`. §10 stage 2 describes the relational version and explicitly defers it: it is a multi-step migration on a live business PC to solve a data-entry problem that a good combobox largely solves. **If you build a Brand model you have built the wrong checkpoint.**

2. **Do not run** `backend/prisma/data-fixes/2026-08-21-normalize-product-brands.sql`. It is written, verified, and deliberately unexecuted. Existing duplicate spellings are the user's to clean up separately; your job is to stop new ones appearing.

3. **Typing a new brand must always remain possible.** This is a combobox, not a locked dropdown. A shop that gets a new supplier on a Tuesday cannot be blocked waiting for someone to define a brand first.

4. **Never silently rewrite what the user typed.** If they type `KOZANO` and `Kozano` exists, you *suggest* the canonical spelling and let them accept it with one click. You do not change it under them on blur.

5. **Never auto-merge brands that merely share a prefix.** Verified distinct in the real data: `Mac` vs `MAC Styler`, `Hisense` vs `Hisense TV`, `GENERAL` vs `General Pro` / `General Gold` / `GENERAL OCEAN`. Matching is exact or case-insensitive-exact — never prefix, never fuzzy.

6. **House style for canonical spelling**, applied consistently: the **majority spelling wins**; where there is no majority, **Title Case wins**. Acronym brands keep their caps (`DSP`, `TCL`, `PLATINUM`) because those are genuine majorities, not accidents.

7. **The Brands page is read-only in this checkpoint.** No rename, no merge, no delete. A merge tool rewrites many product rows and needs an audit trail and a password guard — that is stage 2.

8. **No new dependencies.** Build the combobox from existing primitives; do not add a headless UI library.

9. **Bilingual labels**, LTR layout, brand values render `dir="auto"`.

10. **Do not bump the version, build an installer, or commit.**

## Files

```
backend/src/features/service/products/products.repository.ts    // distinct brands query
backend/src/features/service/products/products.service.ts       // grouping + canonical choice
backend/src/features/service/products/products.controller.ts
backend/src/features/service/products/products.routes.ts        // GET /products/brands
frontend/src/features/products/types/product.types.ts
frontend/src/features/products/api/products.api.ts
frontend/src/features/products/hooks/useProducts.ts
frontend/src/features/products/components/BrandCombobox.tsx      // new
frontend/src/features/products/components/ProductFormDialog.tsx
frontend/src/features/products/components/ProductFilters.tsx     // resolves the CP-RW5 TODO
frontend/src/pages/products/BrandsPage.tsx                       // new, read-only
frontend/src/App.tsx                                             // route
```

---

## Backend

```
GET /api/products/brands
```

Returns every distinct non-null, non-empty `brand`, grouped case-insensitively and with whitespace collapsed:

```ts
{
  brands: [
    { canonical: 'Kozano', productCount: 20, spellings: ['Kozano', 'KOZANO', 'kozano'] },
    { canonical: 'DSP',    productCount: 30, spellings: ['DSP', 'Dsp'] },
    { canonical: 'VGR',    productCount: 11, spellings: ['VGR'] }
  ]
}
```

- `canonical` = most-used spelling; ties broken by Title Case, then alphabetically for determinism.
- `spellings` lets the UI say "2 spellings" and lets the Brands page show the mess.
- Ordered by `productCount` descending, then `canonical` ascending.
- Cheap: `brand` is already indexed (`schema.prisma:725`). One `groupBy` or one small raw query — **do not load every product into Node to group them.**

**Route ordering matters.** `products.routes.ts` resolves `GET /:productId` last for exactly this reason — see the comments above `/labels` and `/scan` at lines 22-26. Register `/brands` **above** `/:productId` or it will be parsed as a product id.

Available to any authenticated user. Returns brand names and counts only — no pricing, no cost, no stock.

## Frontend

### `BrandCombobox`

Replaces the bare text input at `ProductFormDialog.tsx:187`.

- Free text input, always editable.
- Typing filters existing brands; the list shows `Kozano (20 products)`.
- Selecting one fills the canonical spelling.
- **Near-match hint:** when the typed value case-insensitively equals an existing brand but differs in spelling, show inline:
  `Did you mean Kozano? / هل تقصد Kozano؟` with a one-click adopt. Non-blocking. This is where duplicates actually stop.
- Keyboard accessible: arrow keys to move, Enter to select, Escape to dismiss the list without clearing the input.
- Fully usable when the brands request fails — degrade to a plain text input rather than blocking product creation.

Use it in **both** create and edit mode in the product form.

### `ProductFilters`

CP-RW5 relabelled the free-text brand box and left a `// TODO(CP-RW7)`. Resolve it: replace it with a real dropdown fed by the same endpoint, showing counts, plus an "All brands" option. It filters on exact `brand`, which is what the backend already supports — do not change the list endpoint's filter semantics.

### Brands page — read-only

Route `/products/brands`, reachable from the Products page.

A table: canonical brand · product count · spelling count · the variant spellings when there is more than one. Clicking a brand navigates to the filtered catalogue.

Where a brand has multiple spellings, surface it visibly — that display is what tells the user whether stage 2 is ever worth doing. Add a short note pointing at the stage-0 cleanup script as the way to fix existing duplicates, without offering to run it from the UI.

---

## Tests

**Backend**
- Groups case variants; `Kozano` / `KOZANO` / `kozano` collapse to one entry with `productCount: 20` and three spellings.
- Canonical = majority; a tie resolves to Title Case deterministically.
- Null, empty, and whitespace-only brands are excluded.
- Prefix-sharing brands stay separate: assert `Mac` and `MAC Styler` are two entries, and `GENERAL`, `General Pro`, `General Gold`, `GENERAL OCEAN` are four.
- `/brands` is not swallowed by `GET /:productId`.
- Response carries no pricing or stock keys.

**Frontend**
- Combobox lists brands with counts and filters as you type.
- Typing `KOZANO` when `Kozano` exists shows the near-match hint; adopting it sets `Kozano`; ignoring it still saves `KOZANO`.
- Typing a genuinely new brand saves it unchanged, with no hint.
- Blur never rewrites the typed value.
- A failed brands request degrades to a usable plain text input.
- Keyboard navigation works and Escape does not clear the input.
- Filter dropdown filters the catalogue.
- Brands page renders counts and flags multi-spelling brands.

## Definition of done

- `npm test` green. No existing test edited to accommodate a change.
- TypeScript clean.
- **No migration and no `Brand` model** — say so explicitly in your summary.
- No version bump, no installer, nothing committed.
- Manual check stated in your summary: add a product, type `koz`, pick `Kozano` from the list; then type `KOZANO` and confirm the hint appears and can be ignored.

## In your final response

1. Files changed.
2. The canonical-choice algorithm as implemented, and how ties resolve.
3. Confirmation that prefix-sharing brands stay distinct — name the test.
4. Test results verbatim.
5. Confirmation: no migration, no Brand table, version still `1.9.6`, no installer, nothing staged or committed, business database untouched, brand SQL not executed.
