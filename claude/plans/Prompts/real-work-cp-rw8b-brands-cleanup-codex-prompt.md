# Codex Implementation Prompt — CP-RW8B / Brand Duplicate Cleanup

Copy everything below the line into Codex.

---

You are closing the last release blocker in the **HomeConnect** repository (Node/Express + Prisma/Postgres, React 19 + TypeScript). This is the final feature before `v2.0.0`.

## Your source of truth

```
claude/plans/real-work-v2.0.0-release-plan.md
```

Read **§2** (the problem), **§3** (the full design — this is your specification), and **§7** (binding safety rules). Implement **CP-RW8B only.** Do not bump the version, do not package, do not commit.

## The problem

The Brands page shows `General` and `GENERAL` as one amber-flagged row and then tells the user to go run a `.sql` file. That is a developer instruction leaking into the product. A shop owner cannot fix their own duplicate brands.

`backend/prisma/data-fixes/2026-08-21-normalize-product-brands.sql` is **not** the answer and you must not wire it up. It holds a hardcoded map derived from a 2026-08-21 backup, it can only ever fix the 20 groups that existed that day, and it writes **no** `service_audits` rows because the audit writer is application-layer. Your endpoint replaces it as the workflow.

## Non-negotiable rules

1. **No Prisma migration. No `Brand` table. No `brandId`.** `Product.brand` stays a free-text `String?`. You are rewriting strings in an existing column. If you think you need a schema change, stop and report it.

2. **Exact-string matching only.** No prefix matching, no fuzzy matching, no case-folding at match time. Verified-distinct real brands that MUST survive any merge untouched:
   - `Mac` vs `MAC Styler`
   - `Hisense` vs `Hisense TV`
   - `GENERAL` vs `General Pro` vs `General Gold` vs `GENERAL OCEAN`

   A test asserting each of these survives is mandatory. Silently merging two real brands is the worst outcome this feature can produce — worse than not shipping it.

3. **No account password.** `PRODUCT_FIELD_POLICY` marks `brand: true` (`service-policy.ts:11`), but `ProductsService.update:343` enforces only `assertServiceAdmin` with a server-generated reason — there is **no** `verifyAdminPassword` on that path. Password here is reserved for pricing, archive/restore, and opening counts. Adding one would make the bulk path stricter than the single-product edit it replaces. Write a test asserting `verifyAdminPassword` is never called.

4. **One `ServiceAudit` row per affected product.** Not one aggregate row for the batch. This is the entire reason the UI path beats the SQL script — do not compromise it.

5. **Writes `products.brand` only.** Never price, cost, stock, ledger, SKU, or barcode.

6. **Do not run the SQL script**, do not register it in `manifest.json`, do not invoke it from anywhere.

7. **Do not touch the business database.**

8. **Bilingual labels** in the existing `English / العربية` style. LTR layout. Brand values render `dir="auto"`.

9. **Preserve existing UI patterns.** This is new functionality, not a redesign. Reuse the `VerifyOpeningCountDialog` and onboarding-preview patterns already in the codebase. Do not introduce a new visual language.

10. **No new dependencies.**

11. **Verify every enum member against `schema.prisma` before using it.** Prisma enums are real PostgreSQL types — a member that does not exist is a runtime failure, not a compile-time one, and adding one needs a migration you are forbidden from writing. An earlier draft of this prompt named `ServiceAuditAction.UPDATE`, which does not exist; the correct member is `UPDATE_DETAILS`. If any other identifier in this prompt turns out not to exist, **stop and report it** rather than inventing a near-match or adding the member.

## Files

```
backend/src/features/service/products/products.validator.ts    // normalize schema
backend/src/features/service/products/products.repository.ts   // find + bulk update
backend/src/features/service/products/products.service.ts      // normalizeBrands
backend/src/features/service/products/products.controller.ts
backend/src/features/service/products/products.routes.ts       // route, ABOVE /:productId
frontend/src/features/products/types/product.types.ts
frontend/src/features/products/api/products.api.ts
frontend/src/features/products/hooks/useProducts.ts
frontend/src/features/products/components/BrandFixDialog.tsx    // new
frontend/src/pages/products/BrandsPage.tsx                      // action + notice removal
```

---

## Backend

```
POST /api/products/brands/normalize        (requireServiceAdmin)

{
  sourceBrands: string[],   // 1..20 exact spellings, no null or empty entries
  targetBrand:  string,     // userTextSchema brand rules, max 120
  reason:       string,     // min 5, max 1000
  dryRun?:      boolean
}
```

`.strict()`. One endpoint with a `dryRun` flag — **not** two endpoints. This matches `POST /inventory/onboarding/batch`, the bulk-write pattern this codebase established in RW3. One schema, one service method, one set of tests.

**Route ordering matters.** `products.routes.ts` resolves `GET /:productId` last for exactly this reason — see the comments above `/labels`, `/scan`, and `/brands`. Register `/brands/normalize` **above** `/:productId`.

**Responses**

```ts
dryRun: true  → { targetBrand, affectedCount, products: [{ id, sku, name, brand }], warnings: string[] }
dryRun: false → { targetBrand, updatedCount, products: [{ id, sku, name, brand }] }
```

Both return the affected products themselves, not just a count — the UI must name them. Return catalogue fields only: `id`, `sku`, `name`, `brand`. **No pricing, cost, or stock.**

**Behaviour**

- Assert `Role.ADMIN` in the service, in addition to the route guard.
- `dryRun: true` — plain reads, no transaction, nothing written.
- `dryRun: false` — one `runFinancialTransaction`, all-or-nothing:
  1. Select products `WHERE brand IN sourceBrands AND brand <> targetBrand`.
  2. If more than **500** would be affected, throw. This is a pathological-input backstop; the largest real brand is 30 products, so it never fires in practice.
  3. Update each product's `brand` to `targetBrand`, setting `updatedById`.
  4. `writeServiceAudit` per product — `recordType: ServiceAuditRecordType.PRODUCT`, **`action: ServiceAuditAction.UPDATE_DETAILS`**, `recordId: product.id`, the batch `reason`, `beforeValues: { brand: <old> }`, `afterValues: { brand: targetBrand }`, plus `requestId` and `ipAddress` from the request context. It is per-record and takes a `tx`; loop it inside the transaction exactly as batch onboarding loops movements.

     **Use `UPDATE_DETAILS`, not `UPDATE`.** The `ServiceAuditAction` enum has no `UPDATE` member, and `UPDATE_DETAILS` is precisely what a single-product brand edit writes today (`products.service.ts:373-374`). Matching it means a brand change reads the same in a product's audit history whether it came from the edit dialog or from bulk cleanup. **Do not add an enum member** — that needs a migration and is out of scope.

     **Batch correlation comes free from `requestId`.** `ServiceAudit.requestId` already exists on the model, so every row written by one normalize call shares a request id with no schema change and no encoding the reason string. Pass it through from the controller the way the other product audits do.
- **Idempotent** — the `brand <> targetBrand` predicate means a second identical run updates 0 rows and writes 0 audit entries.
- **Warning, not a block:** if `targetBrand` is neither in `sourceBrands` nor already used by any product, add a warning to the dry-run response saying a new spelling will be created. Do not refuse it.

---

## Frontend

### `BrandFixDialog` — new

Opened from a Brands row that has more than one spelling.

1. **Radio list** of that row's spellings with product counts, defaulting to the majority spelling. **No free-text target field** — every tie worth choosing (`Kenwood` / `KENWOOD`) is already in the list, and a genuinely new spelling is a one-product edit. YAGNI.
2. **Reason** field, required, min 5 characters.
3. **Preview** button → `dryRun: true`.
4. **The preview must list the exact affected products by name and SKU**, not just a count. The user has to see precisely which rows will change before anything is written. Render warnings from the response.
5. **Apply is disabled until a successful dry run has completed.** Not merely hidden — disabled, with a hint saying a preview is required.
6. **Any change to the target spelling, the source selection, or the reason invalidates the preview and re-disables Apply.** A stale preview must never authorise a write. This is the most important interaction rule in the dialog.
7. On success: invalidate `productKeys` and the brands query, close, toast the updated count.
8. On failure: surface the server message verbatim (`error.response.data.error.message`, matching `VerifyOpeningCountDialog`), keep the dialog open with the user's selections intact.

### `BrandsPage`

- Each multi-spelling row gets a **Fix spellings / توحيد التهجئة** action.
- **Remove the amber notice** that points at the SQL script (`BrandsPage.tsx:18-21`). The workflow is now in the product. Do not leave a UI that names a file path.
- Update the page subtitle: it currently says "Read-only brand spellings" and will no longer be read-only.
- After a successful fix, the row collapses to one spelling and its amber highlight clears.

---

## Tests

**Backend**
- Merging `GENERAL` into `General` leaves **`General Pro`, `General Gold`, and `GENERAL OCEAN` untouched** — assert each by name.
- Merging `MAC` into `Mac` leaves **`MAC Styler` untouched**.
- One `ServiceAudit` row per affected product, with `action: UPDATE_DETAILS`, correct `beforeValues` / `afterValues`, and the batch reason.
- All audit rows from one normalize call share the same `requestId`.
- **`verifyAdminPassword` is never called** — assert the mock.
- Non-admin is rejected; unauthenticated is rejected.
- `dryRun: true` writes nothing and opens no transaction.
- Second identical run updates 0 products and writes 0 audit rows.
- `sourceBrands` rejects empty array, 21 entries, and null/empty string entries.
- 501 affected products aborts and writes nothing.
- New-spelling warning appears when `targetBrand` is unused; the request still succeeds.
- Response contains no `price`, `costPrice`, `discount`, or `stockQuantity` — assert on serialized keys.
- `/brands/normalize` is not swallowed by `GET /:productId`.

**Frontend**
- Fix spellings opens the dialog with the majority spelling preselected.
- **Apply is disabled before any preview.**
- Preview lists affected product names and SKUs.
- Changing the target spelling after a preview **re-disables Apply**.
- Changing the reason after a preview **re-disables Apply**.
- Success closes, toasts the count, and refreshes.
- Failure keeps the dialog open with selections intact.
- The Brands page no longer renders the SQL-script notice.

---

## Definition of done

- `npm test` green. No existing test edited to accommodate a change.
- `npm run typecheck` clean — run it separately; vitest does not typecheck, and a green suite has already hidden a type error once in this project.
- No migration, no version bump, no installer, nothing committed.
- Manual check stated in your summary, against a **local** database: merge `General` / `GENERAL`, then confirm by name that `General Pro`, `General Gold`, and `GENERAL OCEAN` are unchanged, and that one affected product's audit history shows the brand change with its reason.

## In your final response

1. Files changed.
2. How Apply is gated on the dry run, and exactly what invalidates a completed preview.
3. Name the test that proves prefix-sharing brands survive a merge.
4. Confirmation that no password is required and that `verifyAdminPassword` is never called on this path.
5. Test and typecheck results verbatim, including any failure.
6. Confirmation: no migration, no `Brand` table, version still `1.9.6`, no installer, nothing staged or committed, business database untouched, brand SQL not executed or registered.
