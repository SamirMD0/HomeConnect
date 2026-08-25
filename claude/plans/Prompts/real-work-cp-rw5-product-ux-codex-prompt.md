# Codex Implementation Prompt — CP-RW5 / Product Page UX

Copy everything below the line into Codex.

---

You are improving the product catalogue UI in the **HomeConnect** repository (React 19 + TypeScript, Tailwind). This is a presentational checkpoint: **no backend changes, no new endpoints, no data-shape changes.**

## Your source of truth

```
claude/plans/real-work-bugfix-product-inventory-workflow-plan.md
```

Read **§2.D** (what is wrong, with line references) and **§9** (the design). You are implementing **CP-RW5 only** — not duplicate detection (CP-RW6) and not brands (CP-RW7), even though both touch the same form and filter bar.

## The complaints, verbatim from real use

> Product page needs to be easier and cleaner. Press/click product image to open product details. Product cards/table should feel faster to use. Important product actions should be easier to find.

## Non-negotiable rules

1. **No backend changes.** No file under `backend/` may be modified. No new endpoint, no new field.

2. **Do not touch pricing.** The pricing panel, `ProductFormPricingPanel`, `ProductPricingSection`, `PricingPreviewCard`, and every pricing calculation are out of scope and work correctly. Leave them alone.

3. **Do not touch the label panel or the audit rendering.** Also out of scope, also working.

4. **The page must get simpler, not busier.** Adding two actions to a row that already has four is a regression, not a fix. Read the action-density rule in §9 and follow it: three inline, the rest in an overflow menu.

5. **Accessibility is not optional.** Every new clickable region is a real `<button>` or `<Link>` with an accessible name. Nested interactive elements are forbidden — a card whose whole surface is a button cannot contain another button.

6. **Bilingual labels** in the existing `English / العربية` style. LTR layout. User text keeps `dir="auto"`.

7. **No new dependencies.** `lucide-react` is already there.

8. **Do not bump the version, build an installer, or commit.**

## Files

```
frontend/src/features/products/components/ProductCard.tsx
frontend/src/features/products/components/ProductsTable.tsx
frontend/src/features/products/components/ProductMobileCard.tsx
frontend/src/features/products/components/ProductDetailsDrawer.tsx
frontend/src/features/products/components/ProductFilters.tsx
frontend/src/features/sales-orders/utils/sales-order-links.ts   // new, see §3
```

---

## 1 · Make the obvious things clickable

**`ProductCard.tsx` (grid and list variants)** — the worst offender. The grid card's image is a full `aspect-square` tile, the largest target on screen, and it does nothing. The product name is a plain `<span>` **inside the checkbox `<label>`** (lines 42-51), so clicking the name toggles selection instead of opening the product.

- Grid image → opens the details drawer.
- Product name → opens the details drawer, in both variants.
- Move the name **out** of the `<label>`. The checkbox keeps its own separate, clearly-sized hit area.
- The checkbox overlay on the grid image must stay independently clickable and must not be nested inside the image button.

**`ProductsTable.tsx`** — the name is already a proper button (lines 72-79); keep it. The thumbnail (lines 65-70) is inert with `alt=""`. Make it open the drawer and give it a real accessible name.

**`ProductMobileCard.tsx`** — apply the same two rules.

## 2 · Quick actions, consistent across row and card

Today the catalogue offers View, Edit, Print label, Archive/Restore. Two high-value actions exist **only** on the scanner's `ProductPreviewPanel` and are missing from the catalogue entirely:

- **Inventory** — opens the details drawer scrolled/anchored to its Stock section. Today stock is three levels deep: row → drawer → scroll.
- **Make Order** — the same sales-order handoff the scanner uses.

Final action set, identical on table row, grid card, list card, and mobile card:

| Inline | Overflow menu |
|---|---|
| View details · Edit · Inventory | Print label · Make Order · Archive/Restore |

Six inline buttons per row would make the table unreadable. The overflow menu is what keeps this a simplification.

## 3 · Reuse the sales-order handoff — do not duplicate it

CP-RW2 added the durable query-param handoff and exported a helper from the scanner **page**:

```ts
// frontend/src/pages/scanner/ScannerHubPage.tsx:30
export const scannerOrderUrl = (productId: string) => `/sales-orders?action=add&productId=${encodeURIComponent(productId)}`;
```

**Do not import that into a product feature component.** A feature importing from a page is backwards layering and will rot.

Move it to a shared util:

```
frontend/src/features/sales-orders/utils/sales-order-links.ts
  export const salesOrderCreateUrl = (productId: string) => …
```

Re-export or replace the scanner's usage so there is exactly **one** definition of that URL in the codebase. Update `scanner-hub.page.test.tsx` only as far as the move requires — the asserted URL string must not change.

## 4 · Drawer

`ProductDetailsDrawer.tsx` is nine stacked sections in one scroll: Info, Stock, Specifications, Label, Pricing, Notes, Record info, Related jobs, Audit.

- Add a **sticky section nav** at the top of the scroll area with anchor links to each section. Full tabs are a bigger refactor; the anchor row is the cheap 80% and keeps every section linkable.
- Surface **stock status and quantity in the drawer header**, next to the status badge, so the most-asked question is answered before any scrolling.
- The **Inventory** quick action from §2 must land on the Stock section, not the top of the drawer.

## 5 · Filters

`ProductFilters.tsx:23` renders a free-text input placeholdered `All Brands / كل الماركات`. It reads as a dropdown and behaves as an exact-match text field, which is actively misleading.

The real brand picker is **CP-RW7** — do not build it here. For now, relabel the input so it stops claiming to be something it isn't (for example `Filter by brand / تصفية حسب الماركة`), and leave a `// TODO(CP-RW7)` comment pointing at the replacement.

---

## Tests

`products.components.test.tsx` holds the existing component coverage **and a snapshot file**. Snapshots will change here legitimately — review every diff before regenerating, and say in your summary what changed and why. Do not blanket `-u`.

- Grid card: clicking the image opens details; clicking the name opens details and **does not** toggle selection; clicking the checkbox toggles selection and does **not** open details.
- Table: clicking the thumbnail opens details; the name button still works.
- Mobile card: same two rules.
- The overflow menu opens, is keyboard reachable, and its items fire the right handlers.
- Make Order navigates to `/sales-orders?action=add&productId=<id>`.
- Inventory action opens the drawer anchored to Stock.
- Drawer header shows stock status and quantity.
- No nested-interactive violations: assert the name control is not a descendant of the selection control.

## Definition of done

- `npm test` green. Snapshot changes reviewed individually, not bulk-accepted.
- TypeScript clean.
- No file under `backend/` modified.
- Exactly one definition of the sales-order create URL in the repo.
- No version bump, no installer, nothing committed.
- Manual check stated in your summary: on the products page in both grid and table view, image-click and name-click open details, selection still works, and Make Order lands on a prefilled order.

## In your final response

1. Files changed.
2. Which actions ended up inline vs in the overflow, and why.
3. Every snapshot that changed, with a one-line justification each.
4. Test results verbatim.
5. Confirmation: no backend files touched, no migration, version still `1.9.6`, no installer, nothing staged or committed.
