# Codex Implementation Prompt — CP-RW4 / Batch Onboarding UI

Copy everything below the line into Codex.

---

You are building one screen in the **HomeConnect** repository (React 19 + TypeScript frontend, Vite, TanStack Query, Tailwind). The backend it calls was built and tested in CP-RW3.

## Your source of truth

```
claude/plans/real-work-bugfix-product-inventory-workflow-plan.md
```

Read **§6** (the screen spec) and **§12** (binding safety rules). Read the CP-RW3 summary for the exact endpoint contract, or read the backend validator directly:

```
backend/src/features/inventory/inventory.validator.ts
backend/src/features/inventory/inventory.service.ts
```

You are implementing **CP-RW4 only.** The backend exists and is correct — **do not modify any file under `backend/`.** If you find a backend defect, stop and report it rather than patching around it.

## What you are building

An **Inventory → Onboarding** screen that clears the 309-product backlog in about three sittings, plus a fix to the Inventory page's Untracked tab, which today can never display more than 100 of the 308 untracked products.

## Non-negotiable rules

1. **Do not modify anything under `backend/`.**

2. **The backend is authoritative.** The screen never computes stock truth, never assumes a row will succeed, and never hides a skip. Whatever the batch response reports is what the user is shown.

3. **The preview is mandatory and cannot be bypassed.** No submit path may exist that has not been through a dry run. The password field does not render until a dry-run result is on screen.

   This works because **the dry run takes no password** — `accountPassword` is required only when `dryRun` is falsy. Preview first, then authenticate to submit. If you find the backend demanding a password for a dry run, stop and report it; that contract was corrected on 2026-08-21 and the tests in `inventory.onboarding.auth.test.ts` pin it.

4. **Opening-count fields start blank.** Never prefilled from `Product.stockQuantity` — and per the verified measurement in §1 of the plan, zero untracked products carry a non-zero quantity anyway, so there is nothing to prefill from. A prefilled number is the number that gets accepted without counting, and the point of an opening count is that someone looked at the shelf.

5. **Zero is a valid count**, not an empty field. "Set all selected to 0" writes a real 0 into each field; it does not clear them. The distinction matters because blank means "not counted yet" and blocks submit.

6. **Hard cap 100 selected rows**, enforced in the UI with a clear message, before the request is built. The backend caps too; the UI must not let a user assemble a request that will be rejected.

7. **Bilingual labels** in the existing `English / العربية` style. LTR layout. User-entered text (product names) keeps `dir="auto"`.

8. **No new dependencies.**

9. **Do not bump the version, build an installer, or commit.**

## Files

```
frontend/src/features/inventory/types/inventory.types.ts        // batch + worklist types
frontend/src/features/inventory/api/inventory.api.ts            // two calls
frontend/src/features/inventory/hooks/useInventory.ts           // query + mutation
frontend/src/features/inventory/components/
    InventoryOnboardingTable.tsx                                // new
    InventoryOnboardingPreview.tsx                              // new
frontend/src/pages/inventory/InventoryOnboardingPage.tsx        // new
frontend/src/pages/inventory/InventoryPage.tsx                  // Untracked tab fix + entry point
frontend/src/App.tsx                                            // route
```

Follow the existing feature-folder conventions: `inventoryKeys` in `useInventory.ts`, `paramsFor` in `inventory.api.ts`, `api.get/post` returning `.data.data` with pagination under `.data.meta.pagination`.

---

## Part 1 — fix the Untracked tab

`InventoryPage.tsx` currently does this:

```tsx
const products = useProducts({ search, pageSize: 100, sortBy: 'name' });
… (products.data?.items ?? []).filter((item) => filter === 'UNTRACKED' ? !item.trackStock : true);
```

One unpaginated 100-row page, filtered in the browser. With 308 untracked products the tab shows the first 100 alphabetically and silently hides the rest.

Fix it:
- Use the **server-side `trackStock` filter** CP-RW3 added to `GET /products`.
- Add pagination to the product list section.
- Show a true total from `pagination.totalItems`, not `rows.length`.

The `LOW_STOCK` / `OUT_OF_STOCK` tabs already go through `useLowStockProducts` — leave their behaviour alone, but they need pagination too if they don't have it.

Add an entry point to the onboarding screen: a button in the page header, and a count badge on the Untracked tab showing how many products still need an opening count.

## Part 2 — the onboarding screen

Route: `/inventory/onboarding`. Admin-only in the navigation; the backend enforces it regardless.

### Worklist

`GET /api/inventory/onboarding/pending` — server-paginated (25 / 50 / 100 per page), server-searched.

Columns: select · name (`dir="auto"`) · model · brand · SKU · barcode · current status badge · **Opening count** input.

Filters: *Never onboarded* (default) · include archived (off by default).

Selection must survive pagination and search within a session — a user will search "kozano", select six, clear the search, and keep going. Hold selection and entered counts in a `Map<productId, { count: number | '' }>` keyed by id, not by row index.

### Batch entry

- Per-row number input, `min=0`, integer. Starts blank.
- **"Set all selected to 0"** button.
- Running counter: `37 selected · 37 counts entered · 0 incomplete`.
- Selecting a 101st row is blocked with a message naming the cap.
- Clear affordance to drop a row from the selection.

### Preview — mandatory

**Preview batch** calls the endpoint with `dryRun: true` and **no password**, then renders the returned classification:

| Bucket | Presentation |
|---|---|
| `VALID` | count, collapsible list — "will be onboarded" |
| `ALREADY_ONBOARDED` | count, listed, explained as skipped and never overwritten |
| `PRODUCT_ARCHIVED` / `PRODUCT_NOT_FOUND` | count, listed, skipped |

Those three are the **entire** server vocabulary. There is no `INVALID_COUNT` bucket: the schema rejects a negative, non-integer, or over-limit count with a 400 before classification runs.

**Invalid and incomplete counts are therefore a client-side concern, caught before the request is built.** A blank field means "not counted yet" and a negative means "typo" — both block the Preview button, name the offending rows, and link back to their inputs. The user should never see a 400 from this screen; if they do, your local validation has a gap.

Any change to the selection or to any count **invalidates the preview** and hides the password field. The user must preview again. This is the single most important interaction rule on the screen — do not let a stale preview authorise a write.

### Submit

Rendered only after a clean preview:
- Batch reason, required, min 5 characters, with a sensible default such as `Initial shop-floor stock count / جرد افتتاحي` that the user can edit.
- Optional per-row note, already captured in the table.
- **One** admin account password field.
- Submit posts the identical `items` payload the preview used.

On success: show `written` and `skipped` counts from the response, list any skipped rows with reasons, clear the selection, refetch the worklist and the inventory summary. Do not claim success for rows the server reported as skipped.

On failure: surface the server message verbatim (`error.response.data.error.message`, matching `VerifyOpeningCountDialog.tsx`), keep the selection and all entered counts intact, and let the user retry without re-typing 100 numbers.

Invalidate `inventoryKeys` and `productKeys` on success so the Untracked tab, the summary cards, and the product list all reflect the change.

---

## Tests

`frontend/src/features/inventory/inventory-frontend.test.tsx` is the existing pattern to follow.

- Worklist renders, paginates, searches; selection survives a page change and a search change.
- The 101st selection is blocked with the cap message.
- "Set all selected to 0" writes `0`, not blank, into every selected row.
- The preview request carries `dryRun: true` and **no `accountPassword`**.
- Submit is unreachable before a preview.
- Editing any count after a preview hides the password field and requires a new preview.
- A blank or negative count blocks the **Preview** button and names the rows — no request is sent.
- A success response with both `written` and `skipped` reports **both**; skipped rows are not presented as successes.
- A failed submit preserves the selection and entered counts.
- Untracked tab: uses the server filter, paginates, and shows a total greater than 100 when the fixture has more than 100 untracked products.

Mock the API at the `inventoryApi` boundary, consistent with the existing inventory tests.

## Definition of done

- `npm test` green. No existing test edited to accommodate a change.
- TypeScript clean.
- No file under `backend/` modified.
- No version bump, no installer, nothing committed.
- Manual verification stated in your summary: onboard a batch of ~10 against a local database, then confirm in the product drawer's Stock section that each shows a verified opening count and an `OPENING_BALANCE` row in its movement history.

## In your final response

1. Files changed.
2. How preview invalidation is enforced, and why it cannot be bypassed.
3. Any mismatch you found between the CP-RW3 contract and what the screen needed.
4. Test results verbatim.
5. Confirmation: no backend files touched, no migration, version still `1.9.6`, no installer, nothing staged or committed, business database untouched.
