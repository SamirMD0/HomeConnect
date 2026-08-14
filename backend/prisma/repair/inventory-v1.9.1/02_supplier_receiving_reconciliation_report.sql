-- =====================================================================
-- HomeConnect v1.9.1 — Supplier receiving reconciliation (REPORT ONLY)
-- =====================================================================
--
-- PURPOSE
--   Prove that receiving documents, receiving lines, PURCHASE_RECEIPT
--   stock movements and product stock history all tell the same story.
--
-- SAFETY
--   READ ONLY. SELECT and WITH only. No INSERT, UPDATE, DELETE, DROP,
--   TRUNCATE, ALTER, or CREATE appears anywhere in this file.
--
-- WHEN TO RUN
--   * after applying the v1.9.1 migration to a restored backup
--   * after posting test receiving documents on a scratch database
--   * before approving the business-PC upgrade
--   * any time received quantities look wrong
--
-- REQUIREMENTS
--   This file REQUIRES the two v1.9.1 tables. Run
--   01_supplier_receiving_preflight_report.sql first: if its section A
--   reports the tables as absent, this file is not yet applicable.
--
-- EXPECTED RESULT ON A FRESHLY MIGRATED BACKUP
--   Every fault count is 0 and every detail section returns zero rows,
--   because the migration creates no receiving history at all.
--
-- BUSINESS DATES
--   stock_movements."createdAt" is `timestamp without time zone` holding
--   UTC, so the Beirut business date is
--       ("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Beirut')::date
--   For now(), which is already timestamptz, the equivalent is
--       (now() AT TIME ZONE 'Asia/Beirut')::date
--   The two idioms differ because the inputs differ. See the long note in
--   file 01 for why the shorter form is wrong for the stored column.
-- =====================================================================


-- ---------------------------------------------------------------------
-- SECTION 1 — the fault matrix. This is the number you report.
--   Every row must show finding_count = 0.
-- ---------------------------------------------------------------------
SELECT
  'R01 line quantity vs movement quantity' AS check_name,
  CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'BLOCKER' END AS severity,
  COUNT(*) AS finding_count,
  'Receiving lines whose quantity differs from their movement quantityChange.' AS details,
  'The line and its movement are written in one transaction from the same value. A difference means one of them was edited afterwards.' AS recommendation
FROM "supplier_receiving_items" ri
JOIN "stock_movements" m ON m."id" = ri."stockMovementId"
WHERE m."quantityChange" <> ri."quantity"

UNION ALL SELECT
  'R02 line product vs movement product',
  CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'BLOCKER' END,
  COUNT(*),
  'Receiving lines whose product differs from their movement product.',
  'The movement would have credited stock to the wrong product. Investigate both products before trusting either quantity.'
FROM "supplier_receiving_items" ri
JOIN "stock_movements" m ON m."id" = ri."stockMovementId"
WHERE m."productId" <> ri."productId"

UNION ALL SELECT
  'R03 receipts that do not add stock',
  CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'BLOCKER' END,
  COUNT(*),
  'PURCHASE_RECEIPT movements with quantityChange <= 0.',
  'A receipt always adds goods. A zero or negative receipt is a corrupted row.'
FROM "stock_movements"
WHERE "movementType" = 'PURCHASE_RECEIPT' AND "quantityChange" <= 0

UNION ALL SELECT
  'R04 broken receipt arithmetic',
  CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'BLOCKER' END,
  COUNT(*),
  'PURCHASE_RECEIPT movements where quantityAfter - quantityBefore <> quantityChange.',
  'The running balance drifted. Every movement row must satisfy before + change = after.'
FROM "stock_movements"
WHERE "movementType" = 'PURCHASE_RECEIPT'
  AND "quantityAfter" - "quantityBefore" <> "quantityChange"

UNION ALL SELECT
  'R05 lines with a missing movement link',
  CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'BLOCKER' END,
  COUNT(*),
  'Receiving lines whose stockMovementId resolves to no movement row.',
  'The link is NOT NULL with an ON DELETE RESTRICT foreign key, so this should be impossible.'
FROM "supplier_receiving_items" ri
LEFT JOIN "stock_movements" m ON m."id" = ri."stockMovementId"
WHERE m."id" IS NULL

UNION ALL SELECT
  'R06 receipts not linked to a line',
  CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'BLOCKER' END,
  COUNT(*),
  'PURCHASE_RECEIPT movements with no receiving line pointing at them.',
  'Supplier receiving is the only writer of this movement type. An orphan means stock rose without a document, or the row predates v1.9.1.'
FROM "stock_movements" m
WHERE m."movementType" = 'PURCHASE_RECEIPT'
  AND NOT EXISTS (
    SELECT 1 FROM "supplier_receiving_items" ri WHERE ri."stockMovementId" = m."id")

UNION ALL SELECT
  'R07 documents with no lines',
  CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'BLOCKER' END,
  COUNT(*),
  'Receiving documents holding zero item lines.',
  'The service requires at least one line and writes the document and its lines in one transaction. An empty document means a partial write survived.'
FROM "supplier_receivings" r
WHERE NOT EXISTS (
  SELECT 1 FROM "supplier_receiving_items" ri WHERE ri."receivingId" = r."id")

UNION ALL SELECT
  'R08 documents dated in the future',
  CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'WARNING' END,
  COUNT(*),
  'Receiving documents whose receivedOn is after today in Asia/Beirut.',
  'The service rejects future dates. A row here usually means a clock problem on the machine that wrote it, or a direct SQL insert.'
FROM "supplier_receivings"
WHERE "receivedOn" > (now() AT TIME ZONE 'Asia/Beirut')::date

UNION ALL SELECT
  'R09 documents dated before the opening count',
  CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'BLOCKER' END,
  COUNT(*),
  'Receiving lines dated before their product opening count, in Asia/Beirut.',
  'Stock already captured by the opening count would be counted a second time. This is the double-count guard the service enforces.'
FROM "supplier_receiving_items" ri
JOIN "supplier_receivings" r ON r."id" = ri."receivingId"
JOIN LATERAL (
  SELECT MIN(m."createdAt") AS opened_at
  FROM "stock_movements" m
  WHERE m."productId" = ri."productId" AND m."movementType" = 'OPENING_BALANCE'
) opening ON true
WHERE opening.opened_at IS NOT NULL
  AND r."receivedOn" < (opening.opened_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Beirut')::date

UNION ALL SELECT
  'R10 received units vs receipt movement units',
  CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'BLOCKER' END,
  COUNT(*),
  'Products where total received line quantity differs from total PURCHASE_RECEIPT movement quantity.',
  'The two totals are written from the same numbers and must agree per product. Section 2 lists the offending products.'
FROM (
  SELECT
    COALESCE(lines."productId", receipts."productId") AS "productId"
  FROM (
    SELECT ri."productId", SUM(ri."quantity") AS units
    FROM "supplier_receiving_items" ri
    GROUP BY ri."productId"
  ) lines
  FULL OUTER JOIN (
    SELECT m."productId", SUM(m."quantityChange") AS units
    FROM "stock_movements" m
    WHERE m."movementType" = 'PURCHASE_RECEIPT'
      AND EXISTS (
        SELECT 1 FROM "supplier_receiving_items" ri WHERE ri."stockMovementId" = m."id")
    GROUP BY m."productId"
  ) receipts ON receipts."productId" = lines."productId"
  WHERE COALESCE(lines.units, 0) <> COALESCE(receipts.units, 0)
) mismatched_products

UNION ALL SELECT
  'R11 product ledger vs stored quantity',
  CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'BLOCKER' END,
  COUNT(*),
  'Tracked products whose stockQuantity differs from the sum of their movement ledger.',
  'Carried over from the v1.8.0 and v1.9.0 checks. Receiving must not break the invariant that the ledger explains the stored number.'
FROM "products" p
WHERE p."trackStock" = true
  AND p."stockQuantity" <> COALESCE((
    SELECT SUM(m."quantityChange") FROM "stock_movements" m WHERE m."productId" = p."id"), 0)

ORDER BY 1;


-- ---------------------------------------------------------------------
-- SECTION 2 — received units by product.
--   The readable form of R06 and R10 together. A healthy database returns
--   'MATCH' on every row.
--
--   The verdict separates three different faults, because they have
--   different causes and different fixes:
--     MATCH            line units and receipt movement units agree.
--     ORPHAN_MOVEMENT  receipt movements exist with no receiving line.
--                      Counted by R06, deliberately NOT by R10.
--     MISSING_MOVEMENT receiving lines exist with no receipt movement.
--     MISMATCH         both sides exist but the unit totals differ.
--                      This is what R10 counts.
--
--   R10 excludes orphans on purpose, so that one orphan movement does not
--   also inflate the quantity-mismatch count and make one fault look like
--   two. Without this split, S2 and R10 would appear to contradict.
-- ---------------------------------------------------------------------
WITH lines AS (
  SELECT ri."productId", SUM(ri."quantity") AS line_units, COUNT(*) AS line_count
  FROM "supplier_receiving_items" ri
  GROUP BY ri."productId"
),
receipts AS (
  SELECT m."productId", SUM(m."quantityChange") AS movement_units, COUNT(*) AS movement_count
  FROM "stock_movements" m
  WHERE m."movementType" = 'PURCHASE_RECEIPT'
  GROUP BY m."productId"
)
SELECT
  'S2 received by product' AS section,
  COALESCE(l."productId", rc."productId") AS product_id,
  p."sku",
  p."name",
  COALESCE(l.line_count, 0) AS receiving_lines,
  COALESCE(l.line_units, 0) AS received_units,
  COALESCE(rc.movement_count, 0) AS receipt_movements,
  COALESCE(rc.movement_units, 0) AS movement_units,
  COALESCE(l.line_units, 0) - COALESCE(rc.movement_units, 0) AS difference,
  CASE
    WHEN COALESCE(l.line_units, 0) = COALESCE(rc.movement_units, 0) THEN 'MATCH'
    WHEN COALESCE(l.line_count, 0) = 0 THEN 'ORPHAN_MOVEMENT'
    WHEN COALESCE(rc.movement_count, 0) = 0 THEN 'MISSING_MOVEMENT'
    ELSE 'MISMATCH'
  END AS verdict
FROM lines l
FULL OUTER JOIN receipts rc ON rc."productId" = l."productId"
LEFT JOIN "products" p ON p."id" = COALESCE(l."productId", rc."productId")
ORDER BY
  CASE WHEN COALESCE(l.line_units, 0) = COALESCE(rc.movement_units, 0) THEN 1 ELSE 0 END,
  abs(COALESCE(l.line_units, 0) - COALESCE(rc.movement_units, 0)) DESC,
  p."name";


-- ---------------------------------------------------------------------
-- SECTION 3 — orphan PURCHASE_RECEIPT movements.
--   Zero rows expected. Any row is stock that rose without a document.
-- ---------------------------------------------------------------------
SELECT
  'S3 orphan receipt movement' AS section,
  m."id" AS movement_id,
  m."productId",
  p."sku",
  p."name",
  m."quantityBefore",
  m."quantityChange",
  m."quantityAfter",
  m."referenceType",
  m."referenceId",
  m."createdAt",
  (m."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Beirut')::date AS created_business_date,
  m."reason"
FROM "stock_movements" m
LEFT JOIN "products" p ON p."id" = m."productId"
WHERE m."movementType" = 'PURCHASE_RECEIPT'
  AND NOT EXISTS (
    SELECT 1 FROM "supplier_receiving_items" ri WHERE ri."stockMovementId" = m."id")
ORDER BY m."createdAt" DESC;


-- ---------------------------------------------------------------------
-- SECTION 4 — document-level faults.
--   Zero rows expected.
-- ---------------------------------------------------------------------
SELECT
  'S4 document fault' AS section,
  r."id" AS receiving_id,
  r."receivedOn",
  r."referenceNumber",
  s."name" AS supplier_name,
  u."fullName" AS received_by,
  COALESCE(counted.line_count, 0) AS line_count,
  concat_ws('; ',
    CASE WHEN COALESCE(counted.line_count, 0) = 0 THEN 'document has no lines' END,
    CASE WHEN r."receivedOn" > (now() AT TIME ZONE 'Asia/Beirut')::date THEN 'received date is in the future' END,
    CASE WHEN r."supplierId" IS NOT NULL AND s."id" IS NULL THEN 'supplier row is missing' END,
    CASE WHEN r."referenceNumber" IS NOT NULL AND btrim(r."referenceNumber") = '' THEN 'reference number is blank' END
  ) AS fault
FROM "supplier_receivings" r
LEFT JOIN "suppliers" s ON s."id" = r."supplierId"
LEFT JOIN "users" u ON u."id" = r."receivedById"
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS line_count
  FROM "supplier_receiving_items" ri
  WHERE ri."receivingId" = r."id"
) counted ON true
WHERE COALESCE(counted.line_count, 0) = 0
   OR r."receivedOn" > (now() AT TIME ZONE 'Asia/Beirut')::date
   OR (r."supplierId" IS NOT NULL AND s."id" IS NULL)
   OR (r."referenceNumber" IS NOT NULL AND btrim(r."referenceNumber") = '')
ORDER BY r."receivedOn" DESC;


-- ---------------------------------------------------------------------
-- SECTION 5 — receiving activity by month.
--   Informational only. A quick shape check that the volume matches what
--   the business remembers doing.
-- ---------------------------------------------------------------------
SELECT
  'S5 receiving by month' AS section,
  to_char(date_trunc('month', r."receivedOn"), 'YYYY-MM') AS month,
  COUNT(DISTINCT r."id") AS documents,
  COUNT(ri."id") AS lines,
  COALESCE(SUM(ri."quantity"), 0) AS units,
  COUNT(DISTINCT r."supplierId") FILTER (WHERE r."supplierId" IS NOT NULL) AS named_suppliers,
  COUNT(DISTINCT r."id") FILTER (WHERE r."supplierId" IS NULL) AS documents_without_supplier
FROM "supplier_receivings" r
LEFT JOIN "supplier_receiving_items" ri ON ri."receivingId" = r."id"
GROUP BY date_trunc('month', r."receivedOn")
ORDER BY month DESC;


-- ---------------------------------------------------------------------
-- SECTION 6 — financial isolation proof.
--   v1.9.1 must not have created a single supplier ledger row. This does
--   not prove causation, but a receiving-shaped supplier transaction is
--   exactly what an accidental coupling would look like.
-- ---------------------------------------------------------------------
SELECT
  'S6 supplier transactions referencing a receiving id' AS check_name,
  CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'BLOCKER' END AS severity,
  COUNT(*) AS finding_count,
  'Supplier transactions whose reference text matches a receiving document id.' AS details,
  'Receiving must never create a supplier payable. Any row means something bridged inventory into the supplier ledger automatically.' AS recommendation
FROM "supplier_transactions" st
WHERE st."reference" IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM "supplier_receivings" r
    WHERE r."id"::text = btrim(st."reference"));

-- =====================================================================
-- END OF RECONCILIATION REPORT — no data was changed.
--
-- PASS CRITERIA
--   section 1 : every row shows finding_count = 0, except R08 which is a
--               WARNING and may be non-zero if a clock was wrong.
--   section 2 : every row reads MATCH.
--   section 3 : zero rows.
--   section 4 : zero rows.
--   section 5 : informational; any shape is acceptable.
--   section 6 : finding_count = 0.
-- =====================================================================
