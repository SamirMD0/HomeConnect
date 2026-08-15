-- =====================================================================
-- HomeConnect v1.9.4 — Supplier purchase preflight (REPORT ONLY)
-- =====================================================================
--
-- PURPOSE
--   Decide whether a restored database is safe to carry the v1.9.4
--   supplier purchase release, and whether the columns and table the
--   migration adds are present and correctly shaped.
--
-- SAFETY
--   READ ONLY. SELECT and WITH only. No INSERT, UPDATE, DELETE, DROP,
--   TRUNCATE, ALTER, or CREATE appears anywhere in this file. It changes
--   no data and no schema, and is safe to run as often as you like.
--
-- WHEN TO RUN
--   * on a restored business-PC backup, BEFORE installing v1.9.4
--   * on a scratch database after applying the v1.9.4 migration
--   * any time a supplier purchase total looks wrong
--
--   Never run a release rehearsal against the live business database.
--   Restore a backup and use that copy.
--
-- WHAT v1.9.4 CHANGES
--   One new table, "supplier_purchase_lines", and three new columns on
--   "supplier_transactions" ("receiptNumber", "amountOverride",
--   "amountOverrideReason"). Every column is nullable or defaulted, so no
--   backfill is required and no existing row is rewritten. The migration
--   creates no purchase, no receiving, no movement, and no ledger entry.
--
-- SECTIONS
--   A  does this database already carry v1.9.4?      (pre- and post-upgrade)
--   B  is the v1.9.3 ground it builds on sound?      (pre- and post-upgrade)
--   C  is the new structure correctly shaped?        (post-upgrade only)
-- =====================================================================


-- ---------------------------------------------------------------------
-- SECTION A — is v1.9.4 present?
--   Deliberately mentions the new objects only through the catalog, so
--   this section still runs on a pre-upgrade backup.
-- ---------------------------------------------------------------------
SELECT
  'A01 supplier_purchase_lines table' AS check_name,
  CASE WHEN to_regclass('public.supplier_purchase_lines') IS NULL THEN 'ABSENT — v1.9.4 not applied' ELSE 'PRESENT' END AS status,
  'Absent is expected on a v1.9.3 backup. Present means the migration has run.' AS details

UNION ALL SELECT
  'A02 SupplierPurchaseLineKind enum',
  CASE WHEN EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SupplierPurchaseLineKind') THEN 'PRESENT' ELSE 'ABSENT — v1.9.4 not applied' END,
  'The enum and the table are created by the same migration and must agree.'

UNION ALL SELECT
  'A03 supplier_transactions purchase columns',
  CASE (SELECT count(*) FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'supplier_transactions'
          AND column_name IN ('receiptNumber', 'amountOverride', 'amountOverrideReason'))
    WHEN 3 THEN 'PRESENT (3 of 3)'
    WHEN 0 THEN 'ABSENT — v1.9.4 not applied'
    ELSE 'PARTIAL — BLOCKER, the migration did not finish'
  END,
  'All three arrive together. A partial count means an interrupted migration; apply the matching repair before retrying.';


-- ---------------------------------------------------------------------
-- SECTION B — is the v1.9.3 ground sound?
--   v1.9.4 builds directly on the receiving tables and the receiving-to-
--   debt link. If these are already wrong, do not upgrade on top of them.
-- ---------------------------------------------------------------------
SELECT
  'B01 v1.9.1 receiving tables' AS check_name,
  CASE WHEN to_regclass('public.supplier_receivings') IS NOT NULL
        AND to_regclass('public.supplier_receiving_items') IS NOT NULL
       THEN 'OK' ELSE 'BLOCKER' END AS severity,
  0 AS finding_count,
  'v1.9.4 posts stock through the v1.9.1 receiving tables and cannot work without them.' AS details

UNION ALL SELECT
  'B02 one debt per receiving',
  CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'BLOCKER' END,
  COUNT(*),
  'Receiving documents carrying more than one supplier transaction. The unique index should make this impossible.'
FROM (
  SELECT "supplierReceivingId"
  FROM "supplier_transactions"
  WHERE "supplierReceivingId" IS NOT NULL
  GROUP BY "supplierReceivingId"
  HAVING COUNT(*) > 1
) AS duplicated

UNION ALL SELECT
  'B03 receiving link belongs to the same supplier',
  CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'BLOCKER' END,
  COUNT(*),
  'Transactions linked to a receiving document belonging to a different supplier.'
FROM "supplier_transactions" t
JOIN "supplier_receivings" r ON r."id" = t."supplierReceivingId"
WHERE r."supplierId" IS DISTINCT FROM t."supplierId"

UNION ALL SELECT
  'B04 only debts carry a receiving link',
  CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'BLOCKER' END,
  COUNT(*),
  'Non-debt transactions linked to a receiving document. Payments must never carry one.'
FROM "supplier_transactions"
WHERE "supplierReceivingId" IS NOT NULL AND "type" <> 'SUPPLIER_DEBT';


-- ---------------------------------------------------------------------
-- SECTION C — is the new structure correctly shaped?
--   REQUIRES v1.9.4. If section A reports the table absent, stop here.
-- ---------------------------------------------------------------------
SELECT
  'C01 purchase line constraints' AS check_name,
  CASE WHEN COUNT(*) = 7 THEN 'OK' ELSE 'BLOCKER' END AS severity,
  COUNT(*) AS finding_count,
  'Check constraints on supplier_purchase_lines. Expect 7: manual shape, product shape, quantity, unit price, line total, description, position.' AS details
FROM pg_constraint
WHERE conrelid = 'public.supplier_purchase_lines'::regclass AND contype = 'c'

UNION ALL SELECT
  'C02 receiving item link is unique',
  CASE WHEN COUNT(*) = 1 THEN 'OK' ELSE 'BLOCKER' END,
  COUNT(*),
  'The unique index on "receivingItemId" is what makes a duplicate stock increase for one billed line impossible to represent.'
FROM pg_indexes
WHERE schemaname = 'public' AND indexname = 'supplier_purchase_lines_receivingItemId_key'

UNION ALL SELECT
  'C03 manual lines carry no product or stock link',
  CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'BLOCKER' END,
  COUNT(*),
  'MANUAL lines with a product, quantity, unit price, or receiving link. A description-only line must never be able to move stock.'
FROM "supplier_purchase_lines"
WHERE "kind" = 'MANUAL'
  AND ("productId" IS NOT NULL OR "quantity" IS NOT NULL OR "unitPrice" IS NOT NULL OR "receivingItemId" IS NOT NULL)

UNION ALL SELECT
  'C04 product lines are complete',
  CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'BLOCKER' END,
  COUNT(*),
  'PRODUCT lines missing a product, a quantity, or a unit price.'
FROM "supplier_purchase_lines"
WHERE "kind" = 'PRODUCT'
  AND ("productId" IS NULL OR "quantity" IS NULL OR "unitPrice" IS NULL)

UNION ALL SELECT
  'C05 override always states a reason',
  CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'BLOCKER' END,
  COUNT(*),
  'Transactions whose amount was set by hand with no reason recorded. An unexplained ledger amount cannot be audited.'
FROM "supplier_transactions"
WHERE "amountOverride" = true AND btrim(COALESCE("amountOverrideReason", '')) = '';
