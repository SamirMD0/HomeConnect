# HomeConnect v2.0.0 — Release Plan

**Status:** Release frozen. One blocker open. **No version bump, no installer, no commit.**
**Installed version:** `1.9.6`. **Target:** `2.0.0`, one cumulative release.
**Date:** 2026-08-22.
**Record:** [`Completed/real-work-bugfix-product-inventory-workflow-plan.md`](Completed/real-work-bugfix-product-inventory-workflow-plan.md) — the closed planning document this supersedes. Read it for root-cause diagnoses, the measured catalogue figures, and the CP-RW8 audit evidence. Do not plan from it.

This document contains **only what is still true and still to do.**

---

## 1 · Where things actually stand

RW2 through RW7 are **implemented in the working tree and uncommitted**. Nothing has ever been released — the shop is still running `1.9.6`.

| Check | State |
|---|---|
| `package.json` | `1.9.6` — no bump has occurred |
| Branch | `main`, nothing staged, no feature commit |
| Tests | **251 files, 2080 passed, 10 skipped, 0 failed** |
| Typecheck | `typecheck:frontend` and `typecheck:backend` both clean |
| Migrations in this release | **None.** Every change uses existing tables and columns. |

### Verified catalogue figures

Measured 2026-08-21 by restoring the manual backup into a local scratch database, since dropped. **The business database was never touched and the backup file was never modified.**

| Measure | Value |
|---|---|
| Total products | **404** (375 active · 29 archived) |
| Tracked / untracked | 96 / **308** |
| No `OPENING_BALANCE` movement | **309** (280 active · 29 archived) |
| Untracked products with `stockQuantity > 0` | **0** |
| Onboarding backlog at 100/batch | **~3 batches** |
| Distinct brand strings | **205**, representing **179** real brands |
| Brands with more than one spelling | **20**, affecting 136 products |

The zero is load-bearing: no untracked product carries a stray quantity, so onboarding starts from a clean zero everywhere with nothing to reconcile.

### What shipped into the tree

| CP | Delivers | Confirmed by |
|---|---|---|
| RW2·A | Add Product can enable stock tracking; admin-gated; `stockQuantity` still unreachable from create | `products.validator.ts:111-112`, `products.service.ts:167-168` |
| RW2·B | Scanner → Make Order prefills the scanned product; survives hard reload via query param | `ProductPicker.tsx:36-41`, `ScannerHubPage.tsx:30` |
| RW3 | Batch opening-count endpoint with dry run, one password per batch, per-product movements | `inventory.onboarding.*.test.ts` |
| RW4 | Onboarding screen; Inventory Untracked tab now server-filtered and paginated | `InventoryOnboardingPage.tsx`, `InventoryPage.tsx:84` |
| RW5 | Product image and name open details; overflow menu; Inventory + Make Order quick actions | `ProductCard.tsx:38-49`, `ProductOverflowMenu.tsx` |
| RW6 | Live barcode / SKU / model duplicate detection, self-excluding on edit | `products.validator.ts:183-195` |
| RW7 | Brands endpoint, combobox, near-match hint, filter dropdown, **read-only** Brands page | `products.routes.ts:23`, `BrandsPage.tsx` |

One contract defect was found and fixed mid-flight: the batch endpoint originally demanded `accountPassword` for `dryRun: true`, which deadlocked the preview-before-password UI. `accountPassword` is now conditional and `inventory.onboarding.auth.test.ts` pins both halves.

---

## 2 · The blocker — Brands detects duplicates but cannot fix them

The Brands page shows `General` and `GENERAL` as one amber-flagged row, then tells the user to go run a `.sql` file. That is a developer instruction leaking into the product.

**Confirmed:** `products.routes.ts` exposes exactly one brand route, `GET /brands`. A repo-wide search for `normalize` / `renameBrand` / `mergeBrand` finds no product-brand write path. `BrandsPage.tsx` has no action control.

This is built exactly to the CP-RW7 spec, which scoped the page read-only and deferred merging. **The spec was wrong for real business use; the implementation is faithful to it.**

**The SQL script cannot be the answer.** `backend/prisma/data-fixes/2026-08-21-normalize-product-brands.sql` holds a *hardcoded* map derived from the 2026-08-21 backup, with a guard that aborts past 60 changed rows. It is correct, idempotent, and verified — and it can only ever fix the 20 groups that existed that day. A duplicate typed next Tuesday is not covered, and never will be. It also writes **no** `service_audits` rows, because the audit writer is application-layer.

→ **CP-RW8B**, below.

---

## 3 · CP-RW8B — brand duplicate cleanup

### Endpoint

```
POST /api/products/brands/normalize        (ADMIN)

{
  sourceBrands: string[],   // 1..20 exact spellings, no null/empty entries
  targetBrand:  string,     // max 120, userTextSchema brand rules
  reason:       string,     // min 5, max 1000
  dryRun?:      boolean
}

dryRun: true  → { targetBrand, affectedCount, products: [{ id, sku, name, brand }], warnings: [] }
dryRun: false → { targetBrand, updatedCount, products: [{ id, sku, name, brand }] }
```

One endpoint with a `dryRun` flag, matching `POST /inventory/onboarding/batch`. One schema, one service method, one set of tests.

### Rules

- **Exact-string matching only.** No prefix, no fuzzy, no case-folding at match time. This is what keeps `Mac`/`MAC Styler`, `Hisense`/`Hisense TV`, and `GENERAL`/`General Pro`/`General Gold`/`GENERAL OCEAN` intact — all four verified distinct in the real data.
- **ADMIN only**, route guard *and* service check.
- **No account password.** `PRODUCT_FIELD_POLICY` marks `brand: true` (`service-policy.ts:11`), but `ProductsService.update:343` enforces only `assertServiceAdmin` with a server-generated reason — there is no `verifyAdminPassword` on that path. Password in this codebase is reserved for pricing, archive/restore, and opening counts. Requiring one here would make the bulk path stricter than the single-product edit it replaces.
- **One `ServiceAudit` row per affected product** — `recordType: PRODUCT`, **`action: UPDATE_DETAILS`**, before/after on `brand` only, carrying the batch reason and the request's `requestId`. `writeServiceAudit` is per-record and accepts a `tx`, so this loops inside the transaction exactly as batch onboarding loops movements. **This is the capability the SQL script structurally cannot provide, and the reason the UI path is strictly better than running the script.**

  `UPDATE_DETAILS` is the correct action, not `UPDATE` — there is no `UPDATE` member on the `ServiceAuditAction` enum, and `UPDATE_DETAILS` is exactly what a single-product brand edit already writes (`products.service.ts:373-374`). Bulk and single-product brand changes therefore produce audit rows of the same kind, which is the property you want when reading a product's history. Adding a new enum member would require a migration and is out of scope.

  **Batch correlation is free:** `ServiceAudit.requestId` already exists, so every row written by one normalize call shares a request id. No schema change, no reason-string encoding.
- **Writes `products.brand` only.** Never price, cost, stock, ledger, SKU, or barcode.
- **One `runFinancialTransaction`**, all-or-nothing.
- **Idempotent** — `WHERE brand IN sourceBrands AND brand <> targetBrand`. A second run updates 0 rows.
- **Abort past 500 affected products** as a pathological-input backstop. The largest real brand is 30, so this never fires in practice; it is the same instinct as the SQL script's 60-row guard.
- **Warn, do not block**, when `targetBrand` is neither among `sourceBrands` nor already in use — that creates a new spelling, which is legal but worth surfacing.

### UI

Each Brands row with more than one spelling gets a **Fix spellings** action opening a dialog:

1. Radio list of that row's spellings with product counts, defaulting to the majority spelling. **No free-text target** — every tie case worth choosing (`Kenwood` / `KENWOOD`) is already in the list, and a genuinely new spelling is a one-product edit.
2. Reason field, min 5 characters.
3. **Preview** — calls `dryRun: true` and **lists the exact affected products by name and SKU**, not just a count. The user sees precisely which rows will change before anything is written.
4. **Apply is disabled until a successful dry run has completed.** Changing the target spelling, the source selection, or the reason invalidates the preview and re-disables Apply. A stale preview must never authorise a write.
5. On success: refresh brands and products, the amber flag clears, and the page's "run the SQL script" notice is removed.

Reuse the existing `VerifyOpeningCountDialog` and onboarding-preview patterns. No new visual language.

### Tests

**Backend** — exact-match only, with an explicit assertion that `Mac`/`MAC Styler` and all four `GENERAL*` brands survive a merge untouched · idempotency (second run updates 0) · one `ServiceAudit` row per product with correct before/after · non-admin rejected · **no password required and `verifyAdminPassword` never called** · dry run writes nothing · `sourceBrands` rejects null/empty · 500-row abort · new-spelling warning.

**Frontend** — Fix spellings opens the dialog · preview lists product names and SKUs · **Apply is disabled before any preview** · changing target/source/reason re-disables Apply · success refreshes and clears the flag · failure preserves the dialog state.

---

## 4 · CP-RW8C — release hygiene

Three unrelated bodies of work are mixed in one uncommitted tree.

**(a) RW2–RW7 + CP-RW8B — the release.** Backend `inventory/` and `service/products/`; frontend `products/`, `inventory/`, `sales-orders/`, `scanner/`; `App.tsx`; `business-labels.ts`; the `claude/plans/real-work-*` documents.

**(b) WhatsApp / customer-communication — must not ride along.**

```
desktop/src/index.ts, preload.ts, preload.test.ts
desktop/src/whatsapp-link.ts, whatsapp-link.test.ts
frontend/src/features/customer-communication/
frontend/src/pages/customers/CustomerProfilePage.tsx
frontend/src/pages/customers/CustomerProfilePage.communication.test.tsx
frontend/src/features/backup/types/backup.types.ts
```

Verified **decoupled** — searching `whatsapp` and `customer-communication` across `features/products`, `features/inventory`, `pages/products`, and `pages/inventory` returns nothing. Commit separately, before or after.

**(c) Artefacts.**

| Item | Action |
|---|---|
| `homeconnect-2026-08-21-151618-manual.backup` (1.3 MB) | **Never commit.** Untracked but *not* ignored — one `git add -A` puts it in history. Add `*.backup` to `.gitignore` and move it out of the repo root. |
| `backend/prisma/data-fixes/` | **Must be committed.** Until CP-RW8B lands the Brands UI names this path on screen; shipping a UI that points at an untracked file is a broken reference. Keep it after 8B as the record of the one-time cleanup. |
| `claude/plans/Completed/*` moves | Housekeeping commit, separate from the feature. |
| `stash@{0}` | Pre-existing v1.8.1 leftover. Out of scope — do not pop it. |

---

## 5 · CP-RW8D — QA before release

Automated tests are green but **none of this has been exercised against real data.** Run on a local restore, never the business PC.

**Onboarding** — run one real batch end to end; confirm `OPENING_BALANCE` rows and movement history on two products; **re-submit the same batch and confirm every row skips with originals unchanged**; confirm a wrong password writes nothing.

**Brands** — clean `General` / `GENERAL`; **verify `General Pro`, `General Gold`, and `GENERAL OCEAN` are untouched by name**; re-run and confirm 0 changes; spot-check one product's audit history for the brand change and its reason.

**Scanner** — physical barcode scan → Make Order → product visible without searching, quantity 1; hard reload on the prefilled URL.

**Product** — create with tracking on, then verify its opening count; type an existing barcode and confirm Save is blocked with the owning product named; edit a product and confirm it does not flag itself.

**Gates** — `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run prisma:validate` all clean.

---

## 6 · v2.0.0 release scope

Ships once, cumulative: RW2–RW7 plus CP-RW8B. RW2–RW7 have never been installed on the business PC, so four separate installers would be version spam for no benefit.

**Why 2.0.0 and not 1.10.0** — this is the release where HomeConnect stops being a catalogue with a stock field bolted on and becomes an inventory-managed ERP: batch onboarding, an actionable brands section, duplicate prevention, and a reworked product surface, all landing at once after the first real weeks of live use.

**The changelog must state that this is not a breaking release.** The repo's release runbook defines major as "breaking change to data or workflow". This release is major by *milestone* and is schema-identical to `1.9.6`. Say so plainly, or anyone upgrading — including future-you reading `git log` — will assume a data migration:

> No schema change, no migration, no repair SQL. Upgrade is install-over-the-top from any 1.9.x.

Release mechanics follow [`Prompts/release-version-bump-and-db-repair-prompt.md`](Prompts/release-version-bump-and-db-repair-prompt.md), wrapped by [`Prompts/real-work-cp-rw8-release-codex-prompt.md`](Prompts/real-work-cp-rw8-release-codex-prompt.md). Phase 3 of the runbook (repair SQL, `manifest.json`, `RepairRegistry`) does not apply — nothing here carries a migration. If a migration appears, that is a plan violation to report, not a release task.

---

## 7 · Safety rules — binding

Carried forward verbatim. These constrain implementation; they are not aspirations.

1. **Backend is authoritative.** The frontend never computes stock, price, debt, or ledger truth.
2. **Every quantity traces to a movement.** No path may write `Product.stockQuantity` without a `StockMovement` in the same transaction. Create must remain structurally incapable of setting a quantity.
3. **Opening count is never bypassed.** Batch onboarding refuses if an `OPENING_BALANCE` exists and never overwrites one.
4. **High-risk stock work stays password-guarded.** Remove, damage/loss, and stock count keep their per-operation guards. Batch onboarding uses one password per atomic batch.
5. **Low-risk work stays unguarded.** Product identity, notes, specifications, stock settings, and brand normalization keep the role-gated, server-audited, no-password posture. Do not add friction where none exists today.
6. **Full audit, per record.** One audit row per affected product. An aggregate row for a bulk operation is not acceptable.
7. **All-or-nothing writes.** Bulk operations run in one `runFinancialTransaction` at `Serializable`.
8. **No new bulk stock mutation.** Onboarding creates opening balances only.
9. **No repair SQL as workflow.** `backend/prisma/repair/` is for migration repair. The one-off brand cleanup in `data-fixes/` was a bounded exception with a documented audit gap and **is not a precedent** — money, stock, ledger, and debts are corrected only through the application. CP-RW8B exists precisely to retire that exception.
10. **Untouched:** inventory audit, financial audit, customer ledger, supplier ledger, sales-order validation, stock-movement rules, receiving void semantics.
11. **No migrations.** If a checkpoint discovers it needs a schema change, stop and re-plan.
12. **Business PC untouched during development.** Local databases only.

---

## 8 · Checkpoints

| CP | Scope | State |
|---|---|---|
| CP-RW2 … CP-RW7 | Stock tracking, scanner prefill, batch onboarding, product UX, duplicates, brands v1 | ✅ In tree, uncommitted |
| **CP-RW8A** | Release freeze audit | ✅ Complete |
| **CP-RW8B** | Brand duplicate cleanup — §3 | ⛔ **Blocker** |
| **CP-RW8C** | Release hygiene — §4 | ⛔ Blocker |
| **CP-RW8D** | Real-data QA — §5 | ⛔ Blocker |
| **CP-RW8E** | Bump to `2.0.0`, package, commit | 🔒 Gated on 8B–8D **and explicit user approval** |

## 9 · Open decisions

1. **Batch cap of 100 for onboarding** — accepted as implemented. 309 products ≈ 3 batches.
2. **CSV import for onboarding** — deferred past v2.0.0. Three batches clears the backlog in one sitting; CSV adds parsing, row matching, and Arabic-text encoding for a one-off job.
3. **Brands stage 2** (a real `Brand` table with `brandId` and a migration) — still deferred. Revisit only if duplicates keep appearing after CP-RW8B and the combobox are both in daily use.
4. **The stage-0 SQL script after CP-RW8B ships** — keep on disk as the record of the one-time cleanup, or delete it? Recommend keep; it is referenced by the archived plan as evidence. **Needs your call before release.**
