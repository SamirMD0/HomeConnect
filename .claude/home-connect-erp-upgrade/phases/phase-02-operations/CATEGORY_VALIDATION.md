# Prompt 12 — category validation (2026-09-14)

Branch: `upgrade/phase-02-operations`. Owner's latest decision: English only. No branch change, commit, push, or merge. Main remains `ac6ae9f555dd69d61ca79be527cc1a80513643d9`. Existing unrelated/uncommitted Phase 2 work is preserved.

## Changes

English-name categories support parent/sub/leaf grouping (three levels), category CRUD, deactivation, nullable product assignment, English category paths on table/grid/detail views, and descendant-inclusive catalogue filters. `/products/categories` is the maintenance page. ADMIN-only mutations and existing-product classification use existing catalogue authorization; authenticated employees can read. Existing uncategorized products remain valid. No example categories are seeded.

Current category dimensions are added to Products Bought, Product Cost Changes, Inventory Movements, and Inventory Reconciliation row payloads, screens, and CSV exports. They are explicitly labelled current catalogue classification, not immutable historical category snapshots. Financial report summaries, prices, VAT, FX, stock, sale snapshots, and existing bilingual documents are unchanged.

## Tests first and targeted validation

Hierarchy test was added before implementation and failed on the absent module. Report test then failed on the absent category fields before the report implementation. UUID casing test failed before category-specific canonicalization was added. The full run caught the product-authorization field inventory assertion; it now includes and explicitly tests categoryId as ADMIN-only. No guard or test was skipped/weakened.

Final targeted command (with isolated DATABASE_URL and RUN_INVENTORY_DB_TESTS=1):

```text
npx vitest run backend/src/features/categories backend/src/features/service/authorization/service-policy.test.ts backend/src/features/reports/rows/report-rows.service.test.ts frontend/src/features/categories frontend/src/features/products
Test Files 19 passed (19)
Tests 185 passed (185)
Duration 9.94s
Exit 0
```

Coverage: CRUD, English-only fields/screens, inactive ancestors and existing assignments, nullable assignment, descendant/uncategorized/default filters, unchanged product price/VAT/currency/stock, product audit linkage, direct DB RESTRICT failures, cycle/depth/subtree guards, concurrent duplicate-name and cyclic-reparent races, route authentication/ADMIN authorization, current category report labels/CSV and unchanged summaries.

`npm run typecheck`: frontend/backend PASS. `npm run lint`: PASS, 0 errors and 66 existing warnings; final targeted category lint has no output and exits 0. Prisma generation and schema validation PASS. `npm run build`: PASS (frontend/server), existing >500 kB chunk warning; build was before the final category UUID validation-only fix, which is subsequently covered by typecheck/tests.

## Full-suite gate

Final `npm run test:ci` rerun (all DB flags enabled against `homeconnect_test_phase4_phase5_phase6` only):

```text
Test Files 1 failed | 306 passed (307)
Tests 1 failed | 2441 passed (2442)
Skipped 0
Duration 192.01s
Exit 1
```

The new category field inventory assertion has been fixed and passes. The sole inherited failure is `backend/src/features/maintenance/sql-safety-scanner.test.ts`, rejecting DROP_CONSTRAINT in `20260911120000_add_atomic_sales_returns`. The new category migration passes that scanner. No scanner bypass, changed applied migration, or skipped test was used. JSON output: `node_modules/.cache/home-connect/vitest-report.json`. Category implementation/tests pass; the cumulative full-suite/release verdict remains NOT COMPLETE. Do not deploy while the gate remains red.

## Migration disclosure and business-data evidence

Migration required: Yes — `20260914180000_add_product_categories`.
Backward compatible: Yes — additive table, nullable product FK/index; existing API requests may omit categoryId.
Existing data impact: None. No category seed, backfill, product update, or historical transaction rewrite. The migration was applied only to the isolated test DB (43 applied migrations).
Rollback strategy: Revert application through the normal release workflow; export new category data/assignments before a separately reviewed rollback removes product FK/index/column and categories. No rollback executed.
Backup required: Yes before production migration; existing Phase 1 production deployment gates remain.
Validation check: Nullable categoryId and RESTRICT parent/product FKs verified in the test DB; targeted functional/authorization/concurrency/report invariants pass. Partial case-insensitive root/sibling uniqueness indexes are intentionally SQL-managed, not a Prisma composite unique that mishandles NULL roots.

Read-only business DB inspections before/after final validation: 86 products both times; identical product-row checksum `ad7ede74a21f4c2c4cd3aef3e491bd1a`; category column/table absent. No production migration was run. Thus automated uncategorized compatibility is verified, but live new-build screens/reports against those 86 products are not claimed: the business DB has not received the controlled cumulative upgrade. No browser/physical screen validation is claimed.

Prompt 11's separate credit-limit maintenance policy and all inherited deployment blockers remain unresolved and untouched. Uncommitted overlapping Phase 2 work is not represented as a coherent committed checkpoint.
