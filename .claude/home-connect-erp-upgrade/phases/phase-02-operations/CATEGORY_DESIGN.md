# Prompt 12 — English product categories

Owner requested parent/subcategories, with examples Home Appliances → Kitchen → Cookers and Electronics → TV, then confirmed English only. These are examples, not seeded or hardcoded shop classifications. Prompt 12 brings categories forward despite the older PLAN.md deferral. Remain on `upgrade/phase-02-operations`; do not touch main or merge.

## Presentation and hierarchy

One editable `name` field, not EN/AR fields. New category screens and labels are English. Existing bilingual documents are unchanged. Support three levels (root, subcategory, leaf) to accommodate the owner's examples. Reject self-parenting, cycles, missing parents, and reparenting that would place any descendant beyond level three. Sibling names are case-insensitively unique; identical names in different branches are permitted.

Assumptions: selecting a parent catalogue filter includes its descendants; an explicit Uncategorized filter is available; omitting the filter leaves existing catalogue behavior unchanged. Products may be assigned at any level. Deactivated categories/ancestors cannot receive new assignments, but current assignments and history remain readable. ADMIN maintains categories and reclassifies existing products, matching existing catalogue identity permissions. Ordinary product creation retains its existing authorization behavior.

## Storage and concurrency

Add `categories` (UUID, English name, optional parentId, isActive, timestamps), plus nullable indexed Product.categoryId. Both parent and product foreign keys use RESTRICT. Block deleting categories with children or products, with the DB FK protecting races. Hierarchy validation and writes run in the existing serializable retry transaction. Product assignment validation occurs inside the existing product write transaction and is included in the existing product audit snapshots. No financial, stock, price, VAT, currency, or sale snapshot logic changes.

Product-related report rows/CSV expose current catalogue category paths (not historical sale classifications). No grouping or monetary arithmetic is changed. Uncategorized rows must remain visible.

## Migration disclosure

Migration required: Yes — new categories table and nullable product FK/index.
Backward compatible: Yes — existing products remain NULL, permanently valid.
Existing data impact: No seed, backfill, or product updates.
Rollback strategy: Restore the previous application first; export any new category assignments, then a separately reviewed rollback removes product FK/index/column and categories. No rollback run here.
Backup required: Yes before production deployment, with existing Phase 1 deployment gates still applicable.
Validation check: CRUD, assignment, descendant/uncategorized filters, RESTRICT constraints, cycle/depth/concurrency guards, unchanged product money/stock and report totals; full suite with all DB flags on an isolated test database only.

No production migration is authorized by this implementation task. Prompt 11's separate credit-limit maintenance policy remains unresolved and untouched.
