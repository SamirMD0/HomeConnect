# Codex Implementation Prompt — Product Label, SKU, Stock & Specifications

Copy everything below the line into Codex.

---

You are implementing a new feature in the **HomeConnect** repository (Node/Express + Prisma/Postgres backend, React 19 + TypeScript frontend, Electron desktop shell).

## Your source of truth

Read this file first and treat it as the specification:

```
claude/plans/product-label-sku-stock-specifications-plan.md
```

It contains the full design: SKU format and generation, label content rules, internal price code derivation, stock fields, specifications shape, data model, API contract, print CSS, admin/audit policy, validation, tests, checkpoints, and the exact file list. **Do not redesign it.** If you believe part of it is wrong, stop and say so in your response before writing code — do not silently deviate.

## What you are building

Products gain a stable auto-generated **SKU**, a **professional English-only printed label** that shows no price of any kind, an optional **internal price code** that helps staff recall the pre-buffer price without exposing it, **basic stock fields**, **flexible specifications**, and **scanner-driven lookup** by SKU or barcode.

This version stores stock as a **field only**. It is not inventory management: no movements, no history, no automatic deduction.

## Non-negotiable rules

1. **The label payload contains no price field of any kind.** Not hidden client-side, not behind a query flag — **absent from the response**. `products.service.ts:279-290` currently returns `price`; remove it. The label handler returns exactly `{ id, brand, name, model, sku, barcodeValue, barcodeSource, internalPriceCode? }`. Do not spread the product object. Write a **negative assertion** test — `expect(Object.keys(body.data)).not.toContain('price')`, and the same for `costPrice`, `cashPrice`, `installmentPrice`, `discount`. A positive-only test passes even when the handler leaks.

2. **SKU comes from a Postgres sequence.** Create `product_sku_seq` in the migration and call `nextval` inside the create transaction. **Never `MAX(sku) + 1`** — two concurrent product creations read the same maximum, one fails the unique constraint, and the loser gets an opaque 500. Write a concurrency test.

3. **`priceWithoutDiscountBuffer` is returned, never recomputed.** `rawCashStages()` in `pricing-calculator.ts` already computes it: `afterProfit` in COMPOUND mode, and `cost + expensesRaw + profitRaw` in SIMPLE mode. Return the existing intermediates. Do **not** introduce intermediate rounding — the pinned canonical test (`cost 300, exp 10%, profit 7%, buffer 7% → cashPrice 377.82`) must produce **byte-identical** values after your change. That test is your proof you didn't move anything.

4. **`internalPriceCode` is derived on read, never stored.** No column for it. It is `PREFIX + round(priceWithoutDiscountBuffer, 0dp, HALF_UP)` — `352.85 → P353`. It is **not unique**; many products legitimately share a code. Never add a unique constraint, never use it as a lookup key, never accept it as input. Put a comment on it saying so.

5. **`labelBarcodeSource` stores the choice, not a copy of the value.** An enum `SKU | MANUFACTURER`, default `SKU`. Resolve at read time: `source === 'MANUFACTURER' && barcode ? barcode : sku`, with a mandatory fallback to `sku` when the manufacturer barcode is null. Do **not** add a `labelBarcodeValue` column — a stored copy desynchronizes the moment `barcode` or `sku` changes, and prints labels that scan to nothing.

6. **The printed label is English-only with no `dir` attribute anywhere in its subtree.** `ProductLabel.tsx` must stop importing `businessLabels` entirely and use hardcoded English strings. Remove `dir="auto"` from the article and from the name. Reason: `dir="auto"` on a label containing an Arabic product name can render `Model: SJ-PV69G` as `SJ-PV69G :Model` on the physical sticker. The **product management UI stays bilingual** — do not "fix" the label's English strings by routing them through `businessLabels`.

7. **Nothing writes `stockQuantity` except the explicit stock endpoint.** Not a service job, not a debt, not a payment, not a product PATCH. If any other code path touches it, the inventory boundary has been breached. This is the single most likely way this feature goes wrong.

8. **The existing `barcode` field is preserved unchanged** — meaning, uniqueness, validation rule (`4-64 chars, /^[A-Za-z0-9-]+$/`), and data. It is the *manufacturer* barcode. Do not tighten its validation, do not repurpose it, do not backfill it from SKU. `price` and `discount` likewise keep their current meaning.

9. **No JavaScript float math on money or percentages, anywhere.** Prisma `Decimal` end to end. Money crosses the API as decimal strings via `moneyToApiString`, never as `number`.

10. **Reuse the existing admin + audit machinery.** `verifyAdminPassword` from `backend/src/lib/admin-verification.ts`, verify-and-mutate in the same transaction exactly as `products.service.ts` already does. `ServiceAudit` with `ServiceAuditRecordType.PRODUCT` already exists — add enum *members* to `ServiceAuditAction`, do not create a new audit model. The admin password is never stored, never logged, never echoed, never placed in audit `beforeValues`/`afterValues`.

11. **Route ordering.** Register `/:productId/sku`, `/:productId/regenerate-sku`, and `/:productId/stock` **above** the bare `PATCH /:productId` and `GET /:productId` in `products.routes.ts`, matching how `/archive`, `/restore`, and `/pricing` are already ordered. A route registered below the bare param route will never match.

12. **The label preview and the printed label are the same component with the same CSS class names** — not a styled approximation. If they diverge, staff waste label stock discovering it.

13. **Follow existing repo conventions rather than your own.** Mirror `backend/src/features/service/products/` for validator/repository/service/controller/routes structure and `frontend/src/features/products/` for the frontend feature shape. Extend the existing label CSS rather than replacing it.

## Open decisions, already resolved for you

The plan's §19.2 lists seven. Implement these answers:

- **D1 Label stock size — YOU MUST CONFIRM THIS AT CP1.** This is the one decision that cannot be made from the repo. The plan assumes **50×30mm**, inferred from the existing `.product-label-grid` CSS. Ask for the real measurement and report it before writing any print CSS.
- **D2 Internal price code — derive, do not store.** No column.
- **D3 Batch label printing — out of scope.** Follow-up feature.
- **D4 Gating specification edits on active products — no.** Specs are non-sensitive catalogue content, in the same class as `notes` and `imageUrl`.
- **D5 Arabic product names on the label — force LTR** and accept imperfect Arabic shaping. Do not transliterate, do not add a separate English-name field.
- **D6 Code prefix — a config constant, default `P`.** Obscurity that can never be changed isn't obscurity.
- **D7 Default `labelBarcodeSource` — always `SKU`**, even when a manufacturer barcode exists. HomeConnect's label scans to HomeConnect's identity.

## How to work

Implement the checkpoints in §18 of the plan, **in order**. One checkpoint per commit. Do not start a checkpoint until the previous one's tests pass.

```
CP1  Inspect & confirm (read-only, no code) — report back before proceeding
CP2  Prisma schema + single migration (sequence, columns, deterministic backfill, unique index)
CP3  Pricing calculator: priceWithoutDiscountBuffer + internalPriceCode
CP4  SKU generation, search with exact-match priority, stock/spec validators
CP5  Narrowed label payload + 3 new admin endpoints + field policy
CP6  Frontend data layer + form sections (stock, specifications, pricing values)
CP7  ProductLabel rewrite + print CSS + Label panel
CP8  Scanner search UX, tests, docs
```

Note CP3 comes **before** the SKU and API work. It is small and isolated, but it touches the pricing calculator — the highest-regression-risk file in the feature. Get it green early rather than discovering a pricing regression at CP7.

**Stop and report after CP1** with:

1. **The physical label stock dimensions** (D1) — all print CSS depends on this.
2. Whether any consumer besides `ProductLabel.tsx` reads the label payload's `price` field.
3. Confirmation that `rawCashStages()` produces `afterProfit` as described, and that the SIMPLE-mode equivalent is available without recomputation.
4. The current `ServiceAuditAction` members, and which new ones you need to add.
5. The currency/formatting convention already used by the pricing display, so you follow it rather than inventing a second one.

Then continue through the rest.

## Implementation details that are easy to get wrong

- **The schema has no `@map` on columns**, so Postgres column names are camelCase. All raw SQL in the migration must quote them: `"createdAt"`, `"sku"`, `"stockQuantity"`.
- **Backfill must be deterministically ordered** by `("createdAt", "id")`. An unordered backfill assigns SKUs by whatever order Postgres returns rows, which differs between your machine and the shop's database — the same product would get different SKUs in each.
- **Migration order matters:** create sequence → create enum → add nullable columns → backfill → `setval` past the max → add unique index → `SET NOT NULL`. Adding the unique index before the backfill will fail.
- **Search:** add exact `sku` and exact `barcode` matching *alongside* the existing `barcode startsWith` — do not replace it; partial barcode typing is a real workflow. Exact matches must sort first, or a scan that also fuzzy-matches another product's name opens the wrong record. Return an `exactMatch: boolean` so the frontend doesn't re-derive it.
- **`stockStatus` is derived on the backend**, not the frontend. Four branches: `NOT_TRACKED`, `OUT_OF_STOCK`, `LOW_STOCK`, `IN_STOCK`. Test the threshold-boundary equality case (`qty === threshold` is LOW, not IN).
- **Do not enforce `lowStockThreshold <= stockQuantity`.** A threshold above current stock is the normal state of an out-of-stock item.
- **`stockQuantity` must reject non-integers explicitly.** `2.5` returns 400 — it must not silently truncate.
- **Specifications are an ordered array of `{label, value}`**, not a flat object. JSON objects have no guaranteed key order, so a flat object lets the spec list reshuffle between renders. Cap: 40 entries, label ≤ 64, value ≤ 256, serialized ≤ 8 KB. Validate through the existing `userTextSchema` so injection protection is inherited. Render as plain text — never `dangerouslySetInnerHTML`.
- **Barcode print quality:** minimum 10mm tall, pure `#000` on white (no gray — thermal printers render mid-tones unpredictably and a gray barcode may not scan), `-webkit-print-color-adjust: exact`, and the product name clamped to 2 lines so it can **never** wrap into the barcode. A clipped barcode is an unscannable label — the most expensive failure mode in this feature.
- **Keep `JsBarcode`'s `displayValue: true`** so the human-readable line prints under the bars. When a scan fails, staff type the value manually.
- **Keep the existing `barcodeFailed` text fallback** in `ProductLabel.tsx`, even though SKU is now always present.
- **Changing a SKU invalidates every printed label for that product.** The confirm dialog must say so explicitly.
- **`PRODUCT_FIELD_POLICY` additions:** `sku`, `labelBarcodeSource`, `trackStock`, `stockQuantity`, `lowStockThreshold` are all `true` (sensitive). `specifications` and `specificationNotes` are `false` — gating a password prompt behind adding a color would make staff stop filling them in, and empty specs defeat the feature.

## Do not

- Do not implement anything in §17 (out of scope): inventory management, stock movements or history, automatic deduction, purchase orders, supplier receiving, sales creation, POS checkout, debt or installment plan creation, delivery/installation fees, a visual label designer, QR codes, encrypted pricing, batch label printing, category-specific spec templates, stock alerts or reorder points.
- Do not add `internalPriceCode`, `labelBarcodeValue`, `skuGeneratedAt`, or `skuUpdatedAt` as columns. The plan explains why for each.
- Do not accept a client-supplied `sku` on create — **reject it**, do not silently ignore it. Silent ignoring hides integration bugs.
- Do not allow SKU changes through the general product PATCH. They go through their own endpoint.
- Do not put stock or specifications on the printed label, or in the label payload.
- Do not modify `products.routes.test.ts`, `products.pricing.routes.test.ts`, or `products.validator.test.ts` to make them pass. Extend them; they must keep passing untouched as your regression net.
- Do not bump the version or generate an installer before CP8.

## Verification

Run per-checkpoint tests as you go. At CP8 only, run the full suite once:

```
npm run lint
npm run typecheck
npm test
npm run build
npm run prisma:validate
```

All five must pass. If any fail, fix the cause — do not skip, silence, or weaken a test to make it green. Report the actual output.

**Automated tests cannot verify this feature.** Flag clearly in your CP8 report that these manual checks remain outstanding and must be done by a human with the physical hardware:

1. Print a real label on the real label stock.
2. **Scan it with the actual scanner** and confirm it opens the right product.
3. Confirm the sticker physically fits the product box.
4. Confirm no price is derivable from the printed sticker.
5. Scan a manufacturer barcode on an original box and confirm search finds the product.
6. Edit a stock quantity and confirm nothing else in the app reacted.

Item 2 is the one that cannot be skipped — barcode density, print contrast, and scanner tolerance interact in ways no unit test reaches.

## Reporting

After each checkpoint, state briefly: what you built, which tests you ran and their result, and anything in the plan that turned out to be wrong or under-specified. If you had to deviate, say so explicitly and why.
