-- =====================================================================
-- HomeConnect v1.9.4 — Supplier purchase reconciliation (REPORT ONLY)
-- =====================================================================
--
-- PURPOSE
--   Prove that purchase lines, the debt they add up to, the receiving
--   document they posted, and the stock movements that document wrote all
--   tell the same story.
--
-- SAFETY
--   READ ONLY. SELECT and WITH only. No INSERT, UPDATE, DELETE, DROP,
--   TRUNCATE, ALTER, or CREATE appears anywhere in this file.
--
-- WHEN TO RUN
--   * after applying the v1.9.4 migration to a restored backup
--   * after posting test purchases on a scratch database
--   * before approving the business-PC upgrade
--   * any time a supplier balance or a received quantity looks wrong
--
-- REQUIREMENTS
--   REQUIRES the v1.9.4 table. Run 01_supplier_purchase_preflight_report.sql
--   first; if its section A reports the table absent, this file does not
--   yet apply.
--
-- EXPECTED RESULT ON A FRESHLY MIGRATED BACKUP
--   Every fault count is 0 and every detail section returns zero rows,
--   because the migration creates no purchase history at all.
-- =====================================================================


-- ---------------------------------------------------------------------
-- SECTION 1 — the fault matrix. This is the number you report.
--   Every row must show finding_count = 0.
-- ---------------------------------------------------------------------
SELECT
  'P01 line sum vs posted amount' AS check_name,
  CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'BLOCKER' END AS severity,
  COUNT(*) AS finding_count,
  'Purchases whose posted amount differs from their line sum without being marked as an override.' AS details,
  'The amount is computed from the lines unless the user set it by hand, which sets amountOverride and requires a reason.' AS recommendation
FROM (
  SELECT t."id"
  FROM "supplier_transactions" t
  JOIN "supplier_purchase_lines" l ON l."supplierTransactionId" = t."id"
  WHERE t."amountOverride" = false
  GROUP BY t."id", t."amount"
  HAVING SUM(l."lineTotal") <> t."amount"
) AS mismatched

UNION ALL SELECT
  'P02 purchase line quantity vs receiving line quantity',
  CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'BLOCKER' END,
  COUNT(*),
  'Purchase lines whose quantity differs from the receiving line they are linked to.',
  'Both are written in one transaction from the same value. A difference means one was edited afterwards.'
FROM "supplier_purchase_lines" l
JOIN "supplier_receiving_items" ri ON ri."id" = l."receivingItemId"
WHERE ri."quantity" IS DISTINCT FROM l."quantity"

UNION ALL SELECT
  'P03 purchase line product vs receiving line product',
  CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'BLOCKER' END,
  COUNT(*),
  'Purchase lines linked to a receiving line for a different product.',
  'The stock would have been credited to a product other than the one billed. Investigate both before trusting either quantity.'
FROM "supplier_purchase_lines" l
JOIN "supplier_receiving_items" ri ON ri."id" = l."receivingItemId"
WHERE ri."productId" IS DISTINCT FROM l."productId"

UNION ALL SELECT
  'P04 linked receiving belongs to the same purchase',
  CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'BLOCKER' END,
  COUNT(*),
  'Purchase lines pointing at a receiving line that belongs to a different purchase''s receiving document.',
  'A purchase and its stock lines must share one receiving document.'
FROM "supplier_purchase_lines" l
JOIN "supplier_receiving_items" ri ON ri."id" = l."receivingItemId"
JOIN "supplier_transactions" t ON t."id" = l."supplierTransactionId"
WHERE ri."receivingId" IS DISTINCT FROM t."supplierReceivingId"

UNION ALL SELECT
  'P05 stock lines have a receiving document',
  CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'BLOCKER' END,
  COUNT(*),
  'Purchase lines linked to a receiving line on a purchase that has no receiving document.',
  'Contradictory: the line claims stock moved while its header claims nothing was received.'
FROM "supplier_purchase_lines" l
JOIN "supplier_transactions" t ON t."id" = l."supplierTransactionId"
WHERE l."receivingItemId" IS NOT NULL AND t."supplierReceivingId" IS NULL

UNION ALL SELECT
  'P06 receiving lines are billed at most once',
  CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'BLOCKER' END,
  COUNT(*),
  'Receiving lines claimed by more than one purchase line. The unique index should make this impossible.',
  'A second claim on the same received stock would double-bill it.'
FROM (
  SELECT "receivingItemId"
  FROM "supplier_purchase_lines"
  WHERE "receivingItemId" IS NOT NULL
  GROUP BY "receivingItemId"
  HAVING COUNT(*) > 1
) AS doubled

UNION ALL SELECT
  'P07 purchases are debts',
  CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'BLOCKER' END,
  COUNT(*),
  'Purchase lines attached to a transaction that is not a supplier debt.',
  'Payments, credits, and adjustments must never carry purchase lines.'
FROM "supplier_purchase_lines" l
JOIN "supplier_transactions" t ON t."id" = l."supplierTransactionId"
WHERE t."type" <> 'SUPPLIER_DEBT'

UNION ALL SELECT
  'P08 purchases increase what is owed',
  CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'BLOCKER' END,
  COUNT(*),
  'Purchases whose direction is not INCREASE_OWED.',
  'A purchase that decreased the balance would understate what the shop owes.'
FROM "supplier_transactions" t
WHERE t."direction" <> 'INCREASE_OWED'
  AND EXISTS (SELECT 1 FROM "supplier_purchase_lines" l WHERE l."supplierTransactionId" = t."id")

UNION ALL SELECT
  'P09 quick-added products are onboarded',
  CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'BLOCKER' END,
  COUNT(*),
  'Products bought on a purchase that moved stock but have no OPENING_BALANCE movement.',
  'Receiving requires a verified opening count. A product here would have bypassed onboarding.'
FROM (
  SELECT DISTINCT l."productId"
  FROM "supplier_purchase_lines" l
  WHERE l."productId" IS NOT NULL AND l."receivingItemId" IS NOT NULL
) AS bought
WHERE NOT EXISTS (
  SELECT 1 FROM "stock_movements" m
  WHERE m."productId" = bought."productId" AND m."movementType" = 'OPENING_BALANCE'
);


-- ---------------------------------------------------------------------
-- SECTION 2 — detail rows for anything section 1 flagged.
--   Returns nothing when the fault matrix is clean.
-- ---------------------------------------------------------------------
SELECT
  t."id" AS transaction_id,
  t."receiptNumber",
  t."transactionDate",
  t."amount" AS posted_amount,
  SUM(l."lineTotal") AS line_sum,
  t."amountOverride",
  t."amountOverrideReason",
  COUNT(l."id") AS line_count,
  COUNT(l."receivingItemId") AS stock_line_count,
  t."supplierReceivingId"
FROM "supplier_transactions" t
JOIN "supplier_purchase_lines" l ON l."supplierTransactionId" = t."id"
GROUP BY t."id", t."receiptNumber", t."transactionDate", t."amount", t."amountOverride", t."amountOverrideReason", t."supplierReceivingId"
HAVING (t."amountOverride" = false AND SUM(l."lineTotal") <> t."amount")
    OR (COUNT(l."receivingItemId") > 0 AND t."supplierReceivingId" IS NULL)
ORDER BY t."transactionDate" DESC, t."id";
