# Codex Implementation Prompt — CP-RW3 / Batch Onboarding Backend

Copy everything below the line into Codex.

---

You are adding one new write endpoint to the **HomeConnect** repository (Node/Express + Prisma/Postgres backend, React 19 + TypeScript frontend). This is the only genuinely new write path in the whole RW2–RW7 sequence (shipping as `v2.0.0`), so it is being built and reviewed **without any UI attached to it.**

## Your source of truth

```
claude/plans/real-work-bugfix-product-inventory-workflow-plan.md
```

Read **§2.C**, **§6**, and **§12** before writing anything. §6 is the specification for this checkpoint. §12 is a binding list of safety rules, not aspirations.

You are implementing **CP-RW3 only: backend and tests. No frontend files. No UI.** The screen is CP-RW4 and is somebody else's prompt.

## The problem in one paragraph

309 of 404 products have no `OPENING_BALANCE` movement, so they cannot participate in any inventory workflow. Onboarding them today means opening each product individually and typing the admin password 309 times — over two hours of keyboard time. This checkpoint adds a batch endpoint that onboards up to 100 products in one atomic, audited, password-verified operation.

## Non-negotiable rules

1. **No Prisma migration.** Everything writes to existing tables (`products`, `stock_movements`). If you think you need a schema change, stop and report it.

2. **One `OPENING_BALANCE` `StockMovement` row per product.** Never one aggregate row for the batch. The audit must survive at the product level, because that is where anyone will look for it.

3. **Never overwrite an existing opening balance.** Reuse the exact guard from `InventoryService.verifyOpeningCount` (`inventory.service.ts:75-77`). A product that already has one is **skipped and reported**, never updated, never errored.

4. **One `verifyAdminPassword` call per batch, not per row.** The batch *is* one operation. Use `action: 'BATCH_VERIFY_OPENING_COUNT'`. Calling it 100 times inside one transaction is slower and no safer.

5. **All-or-nothing.** One `runFinancialTransaction` at `Serializable`. Any invalid row rejects the entire batch and writes nothing. The single exception is already-onboarded rows, which are skipped-and-reported rather than fatal — they are the expected result of a stale page, not an error.

6. **Admin only, twice.** Route-level `requireServiceAdmin` **and** a service-level `Role.ADMIN` check, exactly as `verifyOpeningCount` does today. Do not rely on the route alone.

7. **Cap the batch at 100 rows** in the Zod schema. Same cap as supplier receiving (`supplier-receivings.validator.ts:23`), which is the proven precedent for a bulk write in this codebase.

8. **No new bulk stock mutation of any other kind.** This endpoint creates opening balances only. There is no batch add, batch remove, batch count, or batch adjust in this checkpoint or any other.

9. **`stockQuantity` is only ever written together with its movement, in the same transaction.** Reuse `InventoryRepository.setVerifiedOpeningCount`, which already sets `trackStock: true` alongside the quantity.

10. **Do not bump the version, build an installer, or commit.** Leave `package.json` at `1.9.6`.

11. **Do not touch the business database.** Do not run `backend/prisma/data-fixes/2026-08-21-normalize-product-brands.sql`.

## Files you will change

```
backend/src/features/service/products/products.validator.ts    // trackStock list filter
backend/src/features/service/products/products.repository.ts   // honour it
backend/src/features/inventory/inventory.types.ts              // batch types
backend/src/features/inventory/inventory.validator.ts          // batch + worklist schemas
backend/src/features/inventory/inventory.repository.ts         // worklist query, batch helpers
backend/src/features/inventory/inventory.service.ts            // batchVerifyOpeningCount
backend/src/features/inventory/inventory.controller.ts         // handlers
backend/src/features/inventory/inventory.routes.ts             // routes
```

Plus tests. **No file under `frontend/` may be modified.**

---

## Part 1 — make the backlog visible

### 1a · `trackStock` filter on the product list

`productListQuerySchema` has no `trackStock` filter, which is why the Inventory page's Untracked tab filters client-side over a single 100-row page and can never show more than 100 of the 308 untracked products.

Add to `productListQuerySchema`, matching the existing `hasBarcode` pattern exactly:

```ts
trackStock: z.enum(['true', 'false']).optional()
  .transform((value) => value === undefined ? undefined : value === 'true'),
```

Honour it in `ProductsRepository.list`. `pageSize` stays capped at 100 — pagination is the answer, not a bigger page.

### 1b · The onboarding worklist

```
GET /api/inventory/onboarding/pending
  ?search=&includeArchived=false&page=1&pageSize=50
```

Returns products with **no `OPENING_BALANCE` movement**, paginated, newest-irrelevant, ordered by name.

Per row: `productId`, `sku`, `name`, `model`, `brand`, `barcode`, `trackStock`, `stockQuantity`, and a `status` of `NOT_IN_INVENTORY` | `PENDING_ONBOARDING` derived by the same rules as `InventoryService.getProductInventory` (`inventory.service.ts:159-167`).

`includeArchived` defaults to **false**. Search matches name, SKU, barcode, model, and brand.

`InventoryRepository.stockIntegrity()` (`inventory.repository.ts:337-370`) already computes `hasOpeningBalance` for every product in one raw query — model your worklist query on it, but **scoped and paginated**. Do not load the whole catalogue and slice it in Node; that is the exact mistake this checkpoint exists to fix.

Read-only. Any authenticated user may call it.

---

## Part 2 — the batch endpoint

```
POST /api/inventory/onboarding/batch      (requireServiceAdmin)

{
  reason: string,             // min 5, max 1000 — one reason for the whole batch
  accountPassword?: string,   // REQUIRED for the write; omitted on a dry run
  dryRun?: boolean,
  items: [
    { productId: uuid, openingCount: int 0..INVENTORY_QUANTITY_LIMIT, note?: string | null }
  ]                           // 1..100, productIds must be unique
}
```

**`accountPassword` is conditional, enforced in a `superRefine`: required when `dryRun` is not `true`, ignored otherwise.** The reasoning is in the dry-run section below; do not make it unconditionally required.

Schema is `.strict()`. Duplicate `productId` values are a **schema-level** rejection — add a `superRefine` — not something discovered halfway through the loop.

**Zero is a valid opening count.** The single-product dialog already says so verbatim ("Zero is valid for an empty shelf"). Do not add a minimum of 1.

### Row classification

| Bucket | Handling |
|---|---|
| `VALID` | writes one `OPENING_BALANCE` movement |
| `ALREADY_ONBOARDED` | **skipped**, reported, existing balance and movement untouched |
| `PRODUCT_NOT_FOUND` | **skipped**, reported |
| `PRODUCT_ARCHIVED` | **skipped**, reported |

**There is no `INVALID_COUNT` bucket.** A count that is negative, non-integer, or over the limit is rejected by the Zod schema with a 400 before classification ever runs, so a classification bucket for it would be unreachable. Do not loosen the schema to make one reachable — strict boundary validation is the convention here. The client validates blank and negative counts locally; the 400 is the backstop for a malformed caller.

### `dryRun: true`

**No password, no transaction, no writes.**

Do not call `verifyAdminPassword` on this path. A dry run mutates nothing, and every field it returns — product id, name, SKU, onboarding status — is already readable through `GET /inventory/onboarding/pending`, which any authenticated user may call. A password would therefore protect nothing.

It would also do harm: `verifyAdminPassword` enforces a 5-attempt / 15-minute lockout (`admin-verification.ts:7-8`). Spending attempts on *previews* means one typo while reviewing can lock the admin out of the submit that follows. Since the user is expected to run three batches back to back, that is a real operational hazard.

The **`Role.ADMIN` check still applies** to both paths — role gating is free and correct; it is only the password that is pointless for a read.

Run the classification as plain reads and return the tally. There is nothing to roll back, so the transaction question does not arise.

### `dryRun: false` — the write

Inside **one** `runFinancialTransaction` at `Serializable`:

1. Assert authenticated and `Role.ADMIN`.
2. `verifyAdminPassword(userId, password, { action: 'BATCH_VERIFY_OPENING_COUNT', recordType: 'PRODUCT_BATCH', ipAddress }, tx)` — **once**.
3. Load every product in the batch and classify.
4. Any `INVALID_COUNT` → throw. Nothing written.
5. Generate one batch correlation id with `crypto.randomUUID()`.
6. For each `VALID` row:
   - `InventoryRepository.setVerifiedOpeningCount(productId, openingCount, userId, tx)` — sets `trackStock: true`, `stockQuantity`, `updatedById`.
   - `InventoryRepository.createMovement({ movementType: OPENING_BALANCE, quantityChange: openingCount, quantityBefore: 0, quantityAfter: openingCount, reason: <batch reason>, note: <row note>, referenceType: 'MANUAL_BATCH', referenceId: <batch id>, createdById: userId }, tx)`.

   `StockMovement.referenceId` is `@db.Uuid`, so the correlation id must be a real UUID.
7. Return `{ batchId, written: [...], skipped: [{ productId, reason }], counts: { written, skipped } }`.

Re-check `hasOpeningBalance` **inside** the transaction, not only during classification. Two admins submitting overlapping batches must not both write an opening balance for the same product; at `Serializable` one will win and the other must skip or serialization-fail cleanly.

---

## Tests

Put backend tests beside their subjects, following the existing `inventory.service.test.ts` / `inventory.routes.test.ts` layout.

**Authorization and validation**
- Rejects an unauthenticated caller, a non-admin, and a wrong password.
- Respects the 5-attempt lockout.
- Rejects: empty `items`, 101 items, duplicate `productId`, negative count, non-integer count, count above `INVENTORY_QUANTITY_LIMIT`, unknown property (schema is `.strict()`).

**Write correctness**
- A 3-row batch writes exactly 3 `OPENING_BALANCE` movements with correct `quantityBefore: 0`, `quantityAfter`, shared `referenceId`, `referenceType: 'MANUAL_BATCH'`, batch reason, and actor.
- Each written product ends `trackStock: true` with the right `stockQuantity`.
- `openingCount: 0` is accepted and still writes a movement.

**Refusals and skips**
- A product that already has an opening balance is skipped; **assert its existing balance and movement row are byte-unchanged.**
- Archived and missing products are skipped and reported, not fatal.
- One invalid count in a 100-row batch writes **zero** rows and **zero** movements.

**Concurrency**
- Two overlapping batches containing the same product: one wins, the other skips or serialization-fails. Assert no product ends with two `OPENING_BALANCE` rows.

**Dry run**
- Writes nothing and returns the same classification as the write would.
- **Succeeds with no `accountPassword` at all**, and never calls `verifyAdminPassword` — assert the mock was not called, so nothing is spent against the lockout.
- Still refuses a non-admin.
- The write still requires a password: omitting it is a validation error.

**Worklist**
- Paginates; respects `search`; `includeArchived=false` excludes archived; a product gains an opening balance and disappears from the list.
- `trackStock` filter on `GET /products` returns the right set and still caps `pageSize` at 100.

**Scale**
- An integration test with a 100-row batch completes inside the transaction timeout.

---

## Definition of done

- `npm test` green. No existing test edited to accommodate a change.
- TypeScript clean, lint no worse than before.
- No file under `frontend/` modified.
- No migration, no version bump, no installer, nothing committed.

## In your final response

1. Files changed.
2. The exact request/response shape of both endpoints, so CP-RW4 can be written against it without reading your code.
3. How you handled the dry-run audit concern, and the concurrency test result.
4. Test results verbatim, including any failure.
5. Confirmation: no migration, version still `1.9.6`, no installer, nothing staged or committed, business database untouched, brand SQL not executed, no frontend files touched.
