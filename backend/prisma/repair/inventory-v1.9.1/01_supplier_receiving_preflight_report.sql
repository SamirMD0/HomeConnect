-- =====================================================================
-- HomeConnect v1.9.1 — Supplier receiving preflight report (REPORT ONLY)
-- =====================================================================
--
-- PURPOSE
--   Decide whether a restored database is safe to carry the v1.9.1
--   supplier receiving release, and whether any receiving data already
--   present is internally consistent.
--
-- SAFETY
--   READ ONLY. SELECT and WITH only. No INSERT, UPDATE, DELETE, DROP,
--   TRUNCATE, ALTER, or CREATE appears anywhere in this file. It changes
--   no data and no schema, and is safe to run as often as you like.
--
-- WHEN TO RUN
--   * on a restored business-PC backup, BEFORE installing v1.9.1
--   * on a scratch database after applying the v1.9.1 migration
--   * any time receiving numbers look wrong
--
--   Never run any script from this folder against the live business
--   database as part of a rehearsal. Restore a backup and use that.
--
-- ---------------------------------------------------------------------
-- HOW THIS FILE IS ORGANISED — read this before running
-- ---------------------------------------------------------------------
--   SECTION A  schema presence.
--              Runs on ANY HomeConnect database, before or after the
--              v1.9.1 migration. It only asks whether things exist.
--
--   SECTION B  environment checks.
--              Runs on any database from v1.8.0 onward. Touches only
--              products, stock_movements and suppliers, all of which
--              predate v1.9.1.
--
--   SECTION C  receiving data integrity.
--              REQUIRES the two v1.9.1 tables. If section A reports them
--              as absent, STOP after section B — section C will report
--              'relation does not exist', which is the expected and
--              harmless outcome of running it too early, not a fault.
--
--   Sections A and B are deliberately kept free of any reference to the
--   new tables so that the useful half of this report still runs on a
--   pre-migration backup. This mirrors how v1.8.0 split its preflight
--   report from its reconciliation check.
--
-- ---------------------------------------------------------------------
-- SEVERITY
-- ---------------------------------------------------------------------
--   OK        nothing to do.
--   WARNING   look at it, decide, and record the decision. Does not by
--             itself stop the release.
--   BLOCKER   do not install v1.9.1 until it is understood and resolved.
--
-- ---------------------------------------------------------------------
-- BUSINESS DATE CONVERSION — why the idiom below looks long-winded
-- ---------------------------------------------------------------------
--   stock_movements."createdAt" is `timestamp without time zone` and
--   Prisma stores UTC in it. The application converts it to a business
--   date with Intl in the Asia/Beirut zone.
--
--   The faithful SQL equivalent is therefore:
--       ("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Beirut')::date
--
--   The shorter ("createdAt" AT TIME ZONE 'Asia/Beirut')::date is NOT
--   equivalent: with the session timezone set to Asia/Beirut it round
--   trips back to the stored UTC wall value, so it yields the UTC date.
--   The two disagree for anything recorded after 21:00 UTC, where the
--   Beirut date is already the following day. Using the short form here
--   would make this report disagree with the application about exactly
--   the late-evening opening counts the date guard exists to protect.
-- =====================================================================


-- =====================================================================
-- SECTION A — schema presence. Safe on any database.
-- =====================================================================

SELECT
  'A1 supplier_receivings table' AS check_name,
  CASE WHEN to_regclass('public.supplier_receivings') IS NOT NULL
       THEN 'OK' ELSE 'WARNING' END AS severity,
  (to_regclass('public.supplier_receivings') IS NOT NULL)::int::bigint AS finding_count,
  CASE WHEN to_regclass('public.supplier_receivings') IS NOT NULL
       THEN 'Present. The v1.9.1 migration has been applied here.'
       ELSE 'Absent. This database has not yet taken the v1.9.1 migration.' END AS details,
  CASE WHEN to_regclass('public.supplier_receivings') IS NOT NULL
       THEN 'Continue to sections B and C.'
       ELSE 'Expected on a pre-upgrade backup. Run sections A and B only; stop before section C.' END AS recommendation

UNION ALL SELECT
  'A2 supplier_receiving_items table',
  CASE WHEN to_regclass('public.supplier_receiving_items') IS NOT NULL
       THEN 'OK' ELSE 'WARNING' END,
  (to_regclass('public.supplier_receiving_items') IS NOT NULL)::int::bigint,
  CASE WHEN to_regclass('public.supplier_receiving_items') IS NOT NULL
       THEN 'Present.'
       ELSE 'Absent. This database has not yet taken the v1.9.1 migration.' END,
  'Both v1.9.1 tables must be present or both absent. One without the other is a half-applied migration.'

UNION ALL SELECT
  'A3 PURCHASE_RECEIPT enum value',
  CASE WHEN EXISTS (
         SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
         WHERE t.typname = 'StockMovementType' AND e.enumlabel = 'PURCHASE_RECEIPT')
       THEN 'OK' ELSE 'BLOCKER' END,
  (SELECT COUNT(*) FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'StockMovementType' AND e.enumlabel = 'PURCHASE_RECEIPT'),
  'PURCHASE_RECEIPT has existed in the StockMovementType enum since v1.8.0. v1.9.1 adds no enum value.',
  'If absent, this database predates v1.8.0 and must take the earlier migrations first.'

UNION ALL SELECT
  'A4 receiving table constraints',
  CASE WHEN to_regclass('public.supplier_receiving_items') IS NULL THEN 'OK'
       WHEN (SELECT COUNT(*) FROM pg_constraint
             WHERE conname IN ('supplier_receiving_items_positive_quantity_check',
                               'supplier_receiving_items_quantity_limit_check',
                               'supplier_receivings_reference_nonempty_check')) = 3
       THEN 'OK' ELSE 'BLOCKER' END,
  (SELECT COUNT(*) FROM pg_constraint
    WHERE conname IN ('supplier_receiving_items_positive_quantity_check',
                      'supplier_receiving_items_quantity_limit_check',
                      'supplier_receivings_reference_nonempty_check')),
  'Expect 3 once migrated, 0 before. These are the quantity floor, the quantity ceiling, and the non-blank reference rule.',
  'A migrated database missing any of these has a half-applied migration. Do not install.'

UNION ALL SELECT
  'A5 receiving unique indexes',
  CASE WHEN to_regclass('public.supplier_receiving_items') IS NULL THEN 'OK'
       WHEN (SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public'
             AND indexname IN ('supplier_receiving_items_stockMovementId_key',
                               'supplier_receiving_items_receivingId_productId_key')) = 2
       THEN 'OK' ELSE 'BLOCKER' END,
  (SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public'
    AND indexname IN ('supplier_receiving_items_stockMovementId_key',
                      'supplier_receiving_items_receivingId_productId_key')),
  'Expect 2 once migrated, 0 before. One movement backs one line; one line per product per document.',
  'Without these two indexes the database cannot enforce the v1.9.1 invariants. Do not install.'

ORDER BY 1;


-- ---------------------------------------------------------------------
-- SECTION A6 — is the v1.9.1 migration recorded?
--   Kept as its own statement so a database without _prisma_migrations
--   cannot take the whole of section A down with it.
-- ---------------------------------------------------------------------
SELECT
  'A6 v1.9.1 migration recorded' AS check_name,
  CASE WHEN COUNT(*) FILTER (WHERE finished_at IS NOT NULL) = 1 THEN 'OK'
       WHEN COUNT(*) = 0 THEN 'WARNING'
       ELSE 'BLOCKER' END AS severity,
  COUNT(*) AS finding_count,
  'Rows in _prisma_migrations for 20260814110000_add_supplier_receivings.' AS details,
  CASE WHEN COUNT(*) = 0
       THEN 'Expected on a pre-upgrade backup.'
       ELSE 'A recorded row with a null finished_at is an interrupted migration. Resolve before installing.' END AS recommendation
FROM "_prisma_migrations"
WHERE migration_name = '20260814110000_add_supplier_receivings';


-- =====================================================================
-- SECTION B — environment checks.
--   Touches only products, stock_movements and suppliers. Safe on any
--   database from v1.8.0 onward, before or after the v1.9.1 migration.
-- =====================================================================

SELECT
  'B1 pre-existing PURCHASE_RECEIPT movements' AS check_name,
  CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'WARNING' END AS severity,
  COUNT(*) AS finding_count,
  'Stock movements already typed PURCHASE_RECEIPT.' AS details,
  'On a backup taken before v1.9.1 this should be 0: no code path wrote this type. Any row here predates receiving and will appear as unlinked in report 02.' AS recommendation
FROM "stock_movements"
WHERE "movementType" = 'PURCHASE_RECEIPT'

UNION ALL SELECT
  'B2 tracked products without opening count',
  CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'WARNING' END,
  COUNT(*),
  'Products with trackStock = true and no verified OPENING_BALANCE movement.',
  'Not a fault. These cannot receive stock until an administrator verifies an opening count. This is the onboarding work queue, not a release blocker.'
FROM "products" p
WHERE p."trackStock" = true
  AND NOT EXISTS (
    SELECT 1 FROM "stock_movements" m
    WHERE m."productId" = p."id" AND m."movementType" = 'OPENING_BALANCE')

UNION ALL SELECT
  'B3 products with duplicate opening counts',
  CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'BLOCKER' END,
  COUNT(*),
  'Products holding more than one OPENING_BALANCE movement.',
  'A product must have exactly one opening count. More than one makes every later date comparison ambiguous, including the receiving date guard.'
FROM (
  SELECT m."productId"
  FROM "stock_movements" m
  WHERE m."movementType" = 'OPENING_BALANCE'
  GROUP BY m."productId"
  HAVING COUNT(*) > 1
) duplicated_openings

UNION ALL SELECT
  'B4 negative product stock',
  CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'BLOCKER' END,
  COUNT(*),
  'Products holding a negative stockQuantity.',
  'v1.8.0 forbids negative stock absolutely. Investigate before adding a new way to change stock.'
FROM "products"
WHERE "stockQuantity" < 0

UNION ALL SELECT
  'B5 negative-stock constraint present',
  CASE WHEN COUNT(*) = 1 THEN 'OK' ELSE 'BLOCKER' END,
  COUNT(*),
  'The products_stockQuantity_check constraint from v1.8.0.',
  'If this returns 0 an additive migration silently dropped a live safety constraint. Treat as a release blocker.'
FROM pg_constraint
WHERE conrelid = '"products"'::regclass
  AND conname = 'products_stockQuantity_check'

UNION ALL SELECT
  'B6 archived suppliers',
  'OK',
  COUNT(*),
  'Suppliers currently archived.',
  'Informational. Archived suppliers cannot be named on a new receiving document; existing documents keep their supplier.'
FROM "suppliers"
WHERE "isActive" = false

ORDER BY 1;


-- =====================================================================
-- SECTION C — receiving data integrity.
--   REQUIRES the two v1.9.1 tables. Skip if section A reported them
--   absent; 'relation does not exist' there is expected, not a fault.
-- =====================================================================

-- ---------------------------------------------------------------------
-- SECTION C1 — the summary matrix. This is what you report.
--   Every BLOCKER row must show finding_count = 0.
-- ---------------------------------------------------------------------
SELECT
  'C01 receiving documents' AS check_name,
  'OK' AS severity,
  COUNT(*) AS finding_count,
  'Total supplier receiving documents.' AS details,
  'Informational. Expect 0 on a freshly migrated backup: the migration creates no history.' AS recommendation
FROM "supplier_receivings"

UNION ALL SELECT
  'C02 receiving lines',
  'OK',
  COUNT(*),
  'Total supplier receiving item lines.',
  'Informational. Expect 0 on a freshly migrated backup.'
FROM "supplier_receiving_items"

UNION ALL SELECT
  'C03 PURCHASE_RECEIPT movements',
  'OK',
  COUNT(*),
  'Stock movements typed PURCHASE_RECEIPT.',
  'Informational. Once receiving is in use this should equal the receiving line count exactly.'
FROM "stock_movements"
WHERE "movementType" = 'PURCHASE_RECEIPT'

UNION ALL SELECT
  'C04 lines whose movement row is missing',
  CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'BLOCKER' END,
  COUNT(*),
  'Receiving lines whose stockMovementId points at no stock_movements row.',
  'The foreign key is ON DELETE RESTRICT, so this should be impossible. Any row means history was altered outside the application.'
FROM "supplier_receiving_items" ri
LEFT JOIN "stock_movements" m ON m."id" = ri."stockMovementId"
WHERE m."id" IS NULL

UNION ALL SELECT
  'C05 lines whose movement is not PURCHASE_RECEIPT',
  CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'BLOCKER' END,
  COUNT(*),
  'Receiving lines linked to a movement of some other type.',
  'A receiving line must always back a PURCHASE_RECEIPT movement. Investigate before trusting any stock number.'
FROM "supplier_receiving_items" ri
JOIN "stock_movements" m ON m."id" = ri."stockMovementId"
WHERE m."movementType" <> 'PURCHASE_RECEIPT'

UNION ALL SELECT
  'C06 duplicate product lines in one document',
  CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'BLOCKER' END,
  COUNT(*),
  'Product/document pairs appearing more than once.',
  'Prevented by supplier_receiving_items_receivingId_productId_key. Any row means that unique index is missing or was bypassed.'
FROM (
  SELECT ri."receivingId", ri."productId"
  FROM "supplier_receiving_items" ri
  GROUP BY ri."receivingId", ri."productId"
  HAVING COUNT(*) > 1
) duplicated_lines

UNION ALL SELECT
  'C07 documents with missing required fields',
  CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'BLOCKER' END,
  COUNT(*),
  'Documents with a null receivedOn or receivedById, or a blank-but-not-null reference number.',
  'All three are forbidden by NOT NULL or by the reference-nonempty check constraint.'
FROM "supplier_receivings" r
WHERE r."receivedOn" IS NULL
   OR r."receivedById" IS NULL
   OR (r."referenceNumber" IS NOT NULL AND btrim(r."referenceNumber") = '')

UNION ALL SELECT
  'C08 lines with quantity at or below zero',
  CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'BLOCKER' END,
  COUNT(*),
  'Receiving lines with quantity <= 0.',
  'Forbidden by supplier_receiving_items_positive_quantity_check. A receipt adds goods; it never removes them.'
FROM "supplier_receiving_items"
WHERE "quantity" <= 0

UNION ALL SELECT
  'C09 lines above the quantity ceiling',
  CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'BLOCKER' END,
  COUNT(*),
  'Receiving lines with quantity > 100000.',
  'Forbidden by supplier_receiving_items_quantity_limit_check, which mirrors INVENTORY_QUANTITY_LIMIT in the application.'
FROM "supplier_receiving_items"
WHERE "quantity" > 100000

UNION ALL SELECT
  'C10 documents naming a missing supplier',
  CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'BLOCKER' END,
  COUNT(*),
  'Documents with a non-null supplierId that matches no supplier row.',
  'A null supplierId is legitimate and is not counted here: cash purchases and walk-in restocks need no supplier.'
FROM "supplier_receivings" r
LEFT JOIN "suppliers" s ON s."id" = r."supplierId"
WHERE r."supplierId" IS NOT NULL AND s."id" IS NULL

UNION ALL SELECT
  'C11 lines naming a missing product',
  CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'BLOCKER' END,
  COUNT(*),
  'Receiving lines whose productId matches no product row.',
  'The foreign key is ON DELETE RESTRICT, so this should be impossible.'
FROM "supplier_receiving_items" ri
LEFT JOIN "products" p ON p."id" = ri."productId"
WHERE p."id" IS NULL

UNION ALL SELECT
  'C12 lines on products that do not track stock',
  CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'WARNING' END,
  COUNT(*),
  'Receiving lines whose product now has trackStock = false.',
  'Receiving requires trackStock = true at posting time, so this means tracking was turned off afterwards. The historical movement stays valid; check why tracking changed.'
FROM "supplier_receiving_items" ri
JOIN "products" p ON p."id" = ri."productId"
WHERE p."trackStock" = false

UNION ALL SELECT
  'C13 lines on products without an opening count',
  CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'BLOCKER' END,
  COUNT(*),
  'Receiving lines whose product has no verified OPENING_BALANCE movement.',
  'Receiving refuses such a product, so any row here means stock was written around the service layer. That ledger can never reconcile.'
FROM "supplier_receiving_items" ri
WHERE NOT EXISTS (
  SELECT 1 FROM "stock_movements" m
  WHERE m."productId" = ri."productId" AND m."movementType" = 'OPENING_BALANCE')

UNION ALL SELECT
  'C14 documents dated before the opening count',
  CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'BLOCKER' END,
  COUNT(*),
  'Receiving lines whose document date precedes the product opening count, in Asia/Beirut.',
  'Stock captured by the opening count would be counted twice. The service rejects this, so any row means a write bypassed it.'
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
  'C15 duplicate supplier and reference pairs',
  CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'WARNING' END,
  COUNT(*),
  'Supplier/reference combinations used by more than one document. Documents with no supplier are grouped together and are included.',
  'WARNING ONLY, never a blocker. Suppliers reuse and omit invoice numbers, and a second delivery under one reference is legitimate. Confirm each pair is a real second delivery and not a double entry.'
FROM (
  SELECT r."supplierId", lower(btrim(r."referenceNumber")) AS normalized_reference
  FROM "supplier_receivings" r
  WHERE r."referenceNumber" IS NOT NULL
  GROUP BY r."supplierId", lower(btrim(r."referenceNumber"))
  HAVING COUNT(*) > 1
) duplicated_references

ORDER BY 1;


-- ---------------------------------------------------------------------
-- SECTION C2 — detail rows for anything section C1 counted.
--   Each of these returns zero rows on a healthy database.
-- ---------------------------------------------------------------------

-- C2a — broken movement links, in one listing.
SELECT
  'C2a broken movement link' AS section,
  ri."id" AS receiving_item_id,
  ri."receivingId" AS receiving_id,
  ri."productId",
  p."sku",
  p."name",
  ri."quantity",
  ri."stockMovementId",
  m."movementType"::text AS movement_type,
  m."quantityChange" AS movement_quantity_change,
  CASE
    WHEN m."id" IS NULL THEN 'movement row is missing'
    WHEN m."movementType" <> 'PURCHASE_RECEIPT' THEN 'movement is not a PURCHASE_RECEIPT'
    WHEN m."productId" <> ri."productId" THEN 'movement belongs to a different product'
    ELSE 'movement quantity does not match the line'
  END AS fault
FROM "supplier_receiving_items" ri
LEFT JOIN "stock_movements" m ON m."id" = ri."stockMovementId"
LEFT JOIN "products" p ON p."id" = ri."productId"
WHERE m."id" IS NULL
   OR m."movementType" <> 'PURCHASE_RECEIPT'
   OR m."productId" <> ri."productId"
   OR m."quantityChange" <> ri."quantity"
ORDER BY ri."createdAt" DESC;

-- C2b — lines that should never have been receivable.
SELECT
  'C2b line not receivable' AS section,
  ri."id" AS receiving_item_id,
  r."id" AS receiving_id,
  r."receivedOn",
  r."referenceNumber",
  p."sku",
  p."name",
  p."trackStock",
  ri."quantity",
  (opening.opened_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Beirut')::date AS opening_business_date,
  concat_ws('; ',
    CASE WHEN p."id" IS NULL THEN 'product row is missing' END,
    CASE WHEN p."trackStock" = false THEN 'product does not track stock' END,
    CASE WHEN opening.opened_at IS NULL THEN 'product has no verified opening count' END,
    CASE WHEN opening.opened_at IS NOT NULL
           AND r."receivedOn" < (opening.opened_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Beirut')::date
         THEN 'received before the opening count' END
  ) AS fault
FROM "supplier_receiving_items" ri
JOIN "supplier_receivings" r ON r."id" = ri."receivingId"
LEFT JOIN "products" p ON p."id" = ri."productId"
LEFT JOIN LATERAL (
  SELECT MIN(m."createdAt") AS opened_at
  FROM "stock_movements" m
  WHERE m."productId" = ri."productId" AND m."movementType" = 'OPENING_BALANCE'
) opening ON true
WHERE p."id" IS NULL
   OR p."trackStock" = false
   OR opening.opened_at IS NULL
   OR r."receivedOn" < (opening.opened_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Beirut')::date
ORDER BY r."receivedOn" DESC;

-- C2c — duplicate supplier/reference pairs, for human review.
--   WARNING ONLY. Read the documents and confirm each pair is a genuine
--   second delivery rather than the same delivery entered twice.
SELECT
  'C2c duplicate reference' AS section,
  s."name" AS supplier_name,
  r."supplierId",
  r."referenceNumber",
  COUNT(*) AS document_count,
  MIN(r."receivedOn") AS first_received_on,
  MAX(r."receivedOn") AS last_received_on,
  array_agg(r."id" ORDER BY r."receivedOn", r."createdAt") AS receiving_ids
FROM "supplier_receivings" r
LEFT JOIN "suppliers" s ON s."id" = r."supplierId"
WHERE r."referenceNumber" IS NOT NULL
GROUP BY s."name", r."supplierId", r."referenceNumber"
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC, s."name";

-- =====================================================================
-- END OF PREFLIGHT REPORT — no data was changed.
--
-- PASS CRITERIA
--   section A  : A3 OK. On a migrated database, A1, A2, A4, A5 OK and
--                A6 exactly one finished row. On a pre-upgrade backup,
--                A1, A2 and A6 WARNING is the expected reading.
--   section B  : every BLOCKER row shows 0. B1 should be 0 on a backup
--                taken before v1.9.1. B2 may be any number.
--   section C1 : every BLOCKER row shows 0. C15 may be non-zero.
--   section C2 : C2a and C2b return zero rows. C2c may return rows.
-- =====================================================================
