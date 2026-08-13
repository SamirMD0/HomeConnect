-- =====================================================================
-- HomeConnect v1.8.0 — Inventory preflight report
-- =====================================================================
--
-- PURPOSE
--   Report the current state of product stock data BEFORE any inventory
--   opening balances are created. This tells you which products are safe
--   to onboard and which need a human decision first.
--
-- SAFETY
--   READ ONLY. This script contains only SELECT statements.
--   It changes no data, no schema, no constraints. It is safe to run on
--   the business PC, on a restored copy, or on a development database,
--   as many times as you like.
--
-- WHEN TO RUN
--   1. Before the v1.8.0 migration, to see what you are dealing with.
--   2. Again after the migration, to pick which products to onboard.
--
-- HOW TO READ IT
--   Every section prints a section name so results stay identifiable when
--   run in pgAdmin, which shows one grid per statement.
--
--   Old stockQuantity values are NOT trusted. They were entered through an
--   absolute-overwrite screen with no history. Treat every number here as a
--   claim to be checked against a physical count, not as truth.
-- =====================================================================


-- ---------------------------------------------------------------------
-- SECTION 1 — Headline counts
-- ---------------------------------------------------------------------
SELECT
  'S1 headline'                                                       AS section,
  COUNT(*)                                                            AS total_products,
  COUNT(*) FILTER (WHERE "isActive")                                  AS active_products,
  COUNT(*) FILTER (WHERE NOT "isActive")                              AS inactive_products,
  COUNT(*) FILTER (WHERE "trackStock")                                AS tracked_products,
  COUNT(*) FILTER (WHERE "trackStock" AND "stockQuantity" > 0)        AS tracked_with_stock,
  COUNT(*) FILTER (WHERE "trackStock" AND "stockQuantity" = 0)        AS tracked_at_zero,
  COUNT(*) FILTER (WHERE NOT "trackStock" AND "stockQuantity" > 0)    AS untracked_with_stock,
  COUNT(*) FILTER (WHERE "lowStockThreshold" IS NOT NULL)             AS with_threshold
FROM "products";


-- ---------------------------------------------------------------------
-- SECTION 2 — Stock quantity distribution
--   Shows whether the ">1000" and ">10000" review thresholds are sensible
--   for this catalogue, or whether they need tuning.
-- ---------------------------------------------------------------------
SELECT
  'S2 distribution' AS section,
  CASE
    WHEN "stockQuantity" < 0      THEN 'a. NEGATIVE (should be impossible)'
    WHEN "stockQuantity" = 0      THEN 'b. zero'
    WHEN "stockQuantity" <= 10    THEN 'c. 1-10'
    WHEN "stockQuantity" <= 50    THEN 'd. 11-50'
    WHEN "stockQuantity" <= 200   THEN 'e. 51-200'
    WHEN "stockQuantity" <= 1000  THEN 'f. 201-1000'
    WHEN "stockQuantity" <= 10000 THEN 'g. 1001-10000  <-- review'
    ELSE                               'h. >10000      <-- decide per row'
  END                AS quantity_band,
  COUNT(*)           AS product_count,
  MIN("stockQuantity") AS band_min,
  MAX("stockQuantity") AS band_max
FROM "products"
GROUP BY quantity_band
ORDER BY quantity_band;


-- ---------------------------------------------------------------------
-- SECTION 3 — Negative stock
--   The CHECK constraint products_stockQuantity_check makes this
--   impossible. If this returns ANY row, STOP: the constraint has been
--   dropped or bypassed. Do not migrate until it is explained.
-- ---------------------------------------------------------------------
SELECT
  'S3 negative' AS section,
  "id", "sku", "name", "model", "trackStock", "stockQuantity", "isActive"
FROM "products"
WHERE "stockQuantity" < 0
ORDER BY "stockQuantity";


-- ---------------------------------------------------------------------
-- SECTION 4 — Tracking is OFF but a quantity was left behind
--   The most common real case. PATCH /products/:id/stock explicitly
--   permits trackStock = false alongside a positive quantity.
--   These products get NO opening balance. Listed so you know which ones
--   will need a verified count if tracking is ever switched on.
-- ---------------------------------------------------------------------
SELECT
  'S4 untracked with stock' AS section,
  "id", "sku", "barcode", "name", "model", "brand",
  "stockQuantity", "isActive", "updatedAt"
FROM "products"
WHERE NOT "trackStock"
  AND "stockQuantity" > 0
ORDER BY "stockQuantity" DESC, "name";


-- ---------------------------------------------------------------------
-- SECTION 5 — Active products carrying stock
--   The onboarding candidates. Every one of these needs a physical count
--   before it gets an opening balance.
-- ---------------------------------------------------------------------
SELECT
  'S5 active with stock' AS section,
  "id", "sku", "barcode", "name", "model", "brand",
  "trackStock", "stockQuantity", "lowStockThreshold", "updatedAt"
FROM "products"
WHERE "isActive"
  AND "stockQuantity" > 0
ORDER BY "stockQuantity" DESC, "name";


-- ---------------------------------------------------------------------
-- SECTION 6 — Archived / inactive products carrying stock
--   Needs a decision per row. If the units physically exist on a shelf,
--   they should be onboarded even though the product is inactive —
--   otherwise the ledger disagrees with the building.
-- ---------------------------------------------------------------------
SELECT
  'S6 inactive with stock' AS section,
  "id", "sku", "barcode", "name", "model",
  "trackStock", "stockQuantity", "updatedAt"
FROM "products"
WHERE NOT "isActive"
  AND "stockQuantity" > 0
ORDER BY "stockQuantity" DESC, "name";


-- ---------------------------------------------------------------------
-- SECTION 7 — Very high quantities
--   Almost always a typo through the old absolute-overwrite screen.
--   >1000 = eyeball it. >10000 = explicit per-row decision required.
-- ---------------------------------------------------------------------
SELECT
  'S7 high quantity' AS section,
  CASE WHEN "stockQuantity" > 10000 THEN 'DECIDE PER ROW' ELSE 'REVIEW' END AS severity,
  "id", "sku", "name", "model", "trackStock", "stockQuantity", "isActive"
FROM "products"
WHERE "stockQuantity" > 1000
ORDER BY "stockQuantity" DESC;


-- ---------------------------------------------------------------------
-- SECTION 8 — Missing identifiers
--   sku is NOT NULL and unique in the schema, so blanks here mean empty
--   strings rather than nulls. barcode is legitimately optional — it is
--   reported so scanning coverage is known, not because it is wrong.
-- ---------------------------------------------------------------------
SELECT
  'S8 missing identifiers' AS section,
  "id", "name", "model",
  "sku",
  "barcode",
  CASE
    WHEN "sku" IS NULL OR btrim("sku") = '' THEN 'SKU BLANK'
    WHEN "barcode" IS NULL                  THEN 'no barcode (scan by SKU only)'
    WHEN btrim("barcode") = ''              THEN 'BARCODE BLANK STRING'
  END AS identifier_issue,
  "trackStock", "stockQuantity", "isActive"
FROM "products"
WHERE "sku" IS NULL
   OR btrim("sku") = ''
   OR "barcode" IS NULL
   OR btrim("barcode") = ''
ORDER BY identifier_issue, "name";


-- ---------------------------------------------------------------------
-- SECTION 9 — Duplicate identifiers
--   sku and barcode each carry a UNIQUE index, so exact duplicates should
--   be impossible. This catches the cases the indexes do NOT catch:
--   case-insensitive collisions, and a barcode on one product equal to a
--   SKU on another — which is the ambiguity scanLookup reports as
--   alsoMatchedSku.
-- ---------------------------------------------------------------------

-- 9a. Case-insensitive SKU collisions
SELECT 'S9a sku case collision' AS section, lower(btrim("sku")) AS normalized_sku,
       COUNT(*) AS product_count, array_agg("id"::text ORDER BY "id") AS product_ids,
       array_agg("name" ORDER BY "id") AS names
FROM "products"
WHERE "sku" IS NOT NULL AND btrim("sku") <> ''
GROUP BY lower(btrim("sku"))
HAVING COUNT(*) > 1;

-- 9b. Case-insensitive barcode collisions
SELECT 'S9b barcode case collision' AS section, lower(btrim("barcode")) AS normalized_barcode,
       COUNT(*) AS product_count, array_agg("id"::text ORDER BY "id") AS product_ids,
       array_agg("name" ORDER BY "id") AS names
FROM "products"
WHERE "barcode" IS NOT NULL AND btrim("barcode") <> ''
GROUP BY lower(btrim("barcode"))
HAVING COUNT(*) > 1;

-- 9c. One product's barcode equals a DIFFERENT product's SKU.
--     A scan of this code is ambiguous: it matches two products.
SELECT
  'S9c barcode equals other sku' AS section,
  b."id"   AS barcode_product_id,
  b."name" AS barcode_product_name,
  b."barcode" AS scanned_code,
  s."id"   AS sku_product_id,
  s."name" AS sku_product_name,
  s."sku"  AS matching_sku
FROM "products" b
JOIN "products" s
  ON lower(btrim(b."barcode")) = lower(btrim(s."sku"))
 AND b."id" <> s."id"
WHERE b."barcode" IS NOT NULL AND btrim(b."barcode") <> '';


-- =====================================================================
-- END OF PREFLIGHT REPORT — no data was changed.
--
-- NOTE ON ONBOARDING PROGRESS
--   An earlier draft of this file ended with an onboarding-progress section
--   that queried "stock_movements". That table does not exist until the
--   v1.8.0 migration has run, so the section failed with
--   'relation "stock_movements" does not exist' on every pre-migration run.
--
--   That was a real defect, not a cosmetic one: a preflight report is meant
--   to be run BEFORE the migration, and a script that ends in an error
--   trains people to ignore its output.
--
--   Onboarding progress now lives in 03_inventory_reconciliation_check.sql,
--   which is designed to run AFTER the migration. This file is now safe to
--   run at any time, on any database, before or after the migration.
-- =====================================================================
