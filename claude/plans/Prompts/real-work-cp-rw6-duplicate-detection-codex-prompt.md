# Codex Implementation Prompt — CP-RW6 / Duplicate Detection

Copy everything below the line into Codex.

---

You are widening duplicate detection in the **HomeConnect** repository (Node/Express + Prisma/Postgres, React 19 + TypeScript).

## Your source of truth

```
claude/plans/real-work-bugfix-product-inventory-workflow-plan.md
```

Read **§2.F** (current behaviour, with line references) and **§11** (the design). Implement **CP-RW6 only** — not brands (CP-RW7), even though both touch the product form.

## The complaint, verbatim from real use

> When adding or editing product: barcode/model/SKU should immediately show if it already exists. Show a small popup/inline field with the existing product name. Prevent accidental duplicate products. Make it clear when the code/model is already used.

## What exists today

- `checkDuplicate` fires **only on blur of Model or Brand**, and returns immediately when editing:
  ```ts
  // ProductFormDialog.tsx:96-99
  const checkDuplicate = () => {
    if (product || !form.name.trim() || !form.model.trim()) return;   // edit mode: no check ever
    duplicate.mutate({ name, model, brand });
  };
  ```
- It matches **name AND model** (+brand), case-insensitive, top 5 (`products.repository.ts:105-116`).
- **Barcode is never checked live.** It is `@unique` and rejected at save by `barcodeConflict()` (`products.service.ts:73-75`), so the user finds out after filling the whole form.
- **SKU** is server-generated at create, so it cannot collide there; it becomes editable afterwards via the admin-only `PATCH /products/:productId/sku`.
- The warning component `ProductDuplicateWarning.tsx` is good — it lists matches, links to each, and offers Continue Anyway. It is simply under-fed.

## Non-negotiable rules

1. **The backend stays authoritative.** The live check is a courtesy that prevents wasted typing. `barcodeConflict()` and the database unique constraints remain the enforcement. Never replace a server check with a client one.

2. **No Prisma migration.** `sku` and `barcode` are already `@unique`.

3. **Do not widen what the endpoint exposes.** The response may contain only fields the Products page already shows: `id`, `name`, `model`, `brand`, `sku`, `barcode`, `isActive`. **No pricing, no cost, no stock, no notes.** This endpoint is callable by any authenticated user, including employees who cannot see cost.

4. **Blocking vs warning is not a style choice.** A collision on a `@unique` column is a hard block, because the save is guaranteed to fail. Everything else is a soft warning with Continue Anyway, because legitimate variants must stay creatable. Getting this backwards makes the form either useless or a liar.

5. **Edit mode must exclude the product itself.** A product flagging itself as its own duplicate is the fastest way to make people ignore the warning permanently.

6. **Do not touch pricing, stock, or the label panel** in the form.

7. **Bilingual labels**, LTR layout, user text `dir="auto"`.

8. **No new dependencies.** No lodash debounce — write the same `setTimeout` debounce already used in `useProductSearch.ts:12-15`.

9. **Do not bump the version, build an installer, or commit.**

## Files

```
backend/src/features/service/products/products.validator.ts    // widen productDuplicateQuerySchema
backend/src/features/service/products/products.repository.ts   // widen findDuplicates
backend/src/features/service/products/products.service.ts      // checkDuplicate
frontend/src/features/products/types/product.types.ts
frontend/src/features/products/api/products.api.ts
frontend/src/features/products/hooks/useProducts.ts
frontend/src/features/products/components/ProductFormDialog.tsx
frontend/src/features/products/components/ProductDuplicateWarning.tsx
```

---

## Backend

Widen the existing `GET /products/check-duplicate`. **Do not add a second endpoint.**

```
GET /api/products/check-duplicate
  ?name=&model=&brand=&barcode=&sku=&excludeProductId=
```

Every parameter optional; at least one of `name+model`, `barcode`, or `sku` must be present or it is a 400. Keep `.strict()` discipline consistent with the rest of the validator.

Response:

```ts
{ matches: [{ id, name, model, brand, sku, barcode, isActive, reason }] }

reason: 'BARCODE_TAKEN' | 'SKU_TAKEN' | 'SAME_NAME_MODEL' | 'SAME_MODEL_BRAND'
```

- `BARCODE_TAKEN` / `SKU_TAKEN` — reuse `findByBarcode` / `findBySku`, which are already `findUnique`.
- `SAME_NAME_MODEL` — today's `findDuplicates`, unchanged in behaviour.
- `SAME_MODEL_BRAND` — new. Same model **and** same brand, case-insensitive, different name. This is the near-duplicate the shop actually creates.
- `excludeProductId` filters the subject product out of every bucket.
- Cap the total at 5, ordered active-first then most-recently-updated, matching the current `findDuplicates` ordering.

The endpoint stays available to any authenticated user, as it is today.

## Frontend

**Trigger:** debounced **on change**, 400 ms, for Name, Model, Brand, Barcode, and — in edit mode only — SKU. Not on blur. A blur-only check means a user who tabs straight to Save never sees the warning.

Convert `useCheckProductDuplicate` from a `useMutation` to a debounced `useQuery`, so results cache and cancel properly. Keep the existing exported name if anything else imports it.

**Presentation, per field:**

| Reason | Treatment |
|---|---|
| `BARCODE_TAKEN` | **Red, blocking.** Inline under the Barcode field: `Barcode already used by: {name}` with a link to open that product. **Save disabled** until changed. |
| `SKU_TAKEN` | **Red, blocking**, same pattern, under the SKU field in the edit dialog. |
| `SAME_NAME_MODEL` | Amber, non-blocking — existing `ProductDuplicateWarning` with Continue Anyway. |
| `SAME_MODEL_BRAND` | Amber, non-blocking — same component, wording that names the model+brand overlap. |

Blocking a save that the server would reject anyway is not new friction: it converts a save-time 409 after a full form into an immediate, actionable answer. Warnings never block.

Extend `ProductDuplicateWarning` to render the `reason`, and keep its Continue Anyway behaviour for amber reasons only — Continue Anyway must not be offered for a blocking reason, since continuing is impossible.

**Edit mode:** always pass `excludeProductId={product.id}`. Delete the `if (product) return` early-exit at line 97 — that line is the reason edit mode has no detection at all today.

---

## Tests

**Backend**
- Each `reason` is produced for the right input.
- `excludeProductId` removes the subject from every bucket.
- Case-insensitive matching for name, model, brand, barcode, SKU.
- **A response never contains `price`, `costPrice`, `discount`, `stockQuantity`, or `notes`** — assert on the serialized keys, not by eyeballing.
- Missing all of `name+model` / `barcode` / `sku` is a 400.
- Result cap of 5 holds; ordering is active-first.

**Frontend**
- Typing a taken barcode shows the red inline message with the owning product's name and **disables Save**.
- Clearing it re-enables Save.
- A `SAME_NAME_MODEL` match warns but allows save via Continue Anyway.
- Editing a product does not flag that product against itself.
- The check is debounced: rapid typing issues one request, not one per keystroke.
- Continue Anyway is not offered for a blocking reason.

## Definition of done

- `npm test` green. No existing test edited to accommodate a change.
- TypeScript clean.
- No migration, no version bump, no installer, nothing committed.
- Manual check stated in your summary: type an existing barcode into Add Product and confirm the owning product is named and Save is blocked, before any request to create.

## In your final response

1. Files changed.
2. The final field-to-treatment matrix as implemented.
3. Proof the response cannot leak pricing or stock — name the test.
4. Test results verbatim.
5. Confirmation: no migration, version still `1.9.6`, no installer, nothing staged or committed, business database untouched.
