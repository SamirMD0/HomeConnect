-- =====================================================================
-- HomeConnect v1.8.0 — Inventory reconciliation check
-- =====================================================================
--
-- PURPOSE
--   Prove that products."stockQuantity" and the stock_movements ledger tell
--   the same story, for every product that has been onboarded.
--
-- SAFETY
--   READ ONLY. SELECT statements only. Changes no data, no schema.
--   Safe to run any time, on any database, as often as you like.
--
-- WHEN TO RUN
--   * immediately after the v1.8.0 migration
--   * after every batch of verified opening balances
--   * after the migration rehearsal on a restored business PC copy
--   * any time the numbers look wrong
--
-- ---------------------------------------------------------------------
-- THE FOUR OUTCOMES — read this before panicking at section 1
-- ---------------------------------------------------------------------
--   NOT_IN_INVENTORY
--       The product is untracked, holds zero units, and has no movements.
--       It is normal catalogue data, not an onboarding work item.
--
--   OK
--       The product has an OPENING_BALANCE, stockQuantity equals the sum of
--       the ledger, and no movement row has broken arithmetic.
--
--   PENDING_ONBOARDING
--       The product is tracked or carries a quantity, but has no movements
--       and therefore no verified OPENING_BALANCE.
--       THIS IS EXPECTED, NOT A BUG. v1.8.0 deliberately does not backfill.
--       These products are waiting for a physical count. Normally onboard
--       them in the app with Verify Opening Count. Script 02 is reserved for
--       a reviewed, controlled bulk-onboarding batch.
--
--   MISMATCH
--       The product has movement activity without an OPENING_BALANCE, broken
--       movement arithmetic, or a ledger sum that does not match stockQuantity.
--       THIS IS A REAL DEFECT. It means a write escaped the ledger — the
--       one thing the whole design exists to prevent. Investigate before
--       trusting any inventory number.
--
--   The distinction matters. If every un-onboarded product reported as a
--   failure on day one, everyone would learn to ignore this check, and it
--   would be useless on the day it finally mattered.
-- =====================================================================


-- ---------------------------------------------------------------------
-- SECTION 1 — Summary. This is the number you report.
-- ---------------------------------------------------------------------
WITH ledger AS (
  SELECT
      p."id",
      COUNT(m."id")                                AS movement_count,
      COALESCE(SUM(m."quantityChange"), 0)         AS ledger_sum,
      COALESCE(BOOL_OR(m."movementType" = 'OPENING_BALANCE'), false) AS has_opening_balance,
      COUNT(*) FILTER (
        WHERE m."id" IS NOT NULL
          AND (
            m."quantityBefore" + m."quantityChange" <> m."quantityAfter"
            OR (m."quantityChange" = 0 AND m."movementType" <> 'OPENING_BALANCE')
            OR (m."movementType" = 'OPENING_BALANCE' AND m."quantityBefore" <> 0)
          )
      ) AS broken_movement_count
  FROM "products" p
  LEFT JOIN "stock_movements" m ON m."productId" = p."id"
  GROUP BY p."id"
),
classified AS (
  SELECT
    CASE
      -- Untracked AND holding nothing: this product is simply not part of
      -- inventory. It is NOT waiting to be counted, and calling it "pending"
      -- would inflate the work queue with products nobody has decided to
      -- track. Deciding what to track comes before counting it.
      WHEN l.movement_count = 0
       AND NOT p."trackStock"
       AND p."stockQuantity" = 0                     THEN 'NOT_IN_INVENTORY'
      WHEN l.movement_count = 0                      THEN 'PENDING_ONBOARDING'
      WHEN NOT l.has_opening_balance
        OR l.broken_movement_count > 0
        OR l.ledger_sum <> p."stockQuantity"         THEN 'MISMATCH'
      ELSE                                                'OK'
    END AS status
  FROM "products" p
  JOIN ledger l ON l."id" = p."id"
)
SELECT
  'S1 summary'                                          AS section,
  COUNT(*)                                              AS total_products,
  COUNT(*) FILTER (WHERE status = 'OK')                 AS ok,
  COUNT(*) FILTER (WHERE status = 'PENDING_ONBOARDING') AS pending_onboarding,
  COUNT(*) FILTER (WHERE status = 'NOT_IN_INVENTORY')   AS not_in_inventory,
  COUNT(*) FILTER (WHERE status = 'MISMATCH')           AS mismatch_MUST_BE_ZERO
FROM classified;


-- ---------------------------------------------------------------------
-- SECTION 1b — Onboarding progress
--   Moved here from the preflight report, which must be runnable BEFORE
--   the migration exists. This section needs "stock_movements", so it
--   belongs in the post-migration script.
--
--   "Onboarded" means the product has a verified OPENING_BALANCE. This is
--   the progress bar for the physical-count work: how much of the catalogue
--   has been counted and brought into the ledger.
-- ---------------------------------------------------------------------
SELECT
  'S1b onboarding progress' AS section,
  COUNT(*)                                                        AS products_in_scope,
  COUNT(*) FILTER (WHERE COALESCE(activity.has_opening_balance, false)) AS onboarded,
  COUNT(*) FILTER (
    WHERE NOT COALESCE(activity.has_opening_balance, false)
      AND COALESCE(activity.movement_count, 0) = 0
  )                                                               AS pending_onboarding,
  COUNT(*) FILTER (
    WHERE NOT COALESCE(activity.has_opening_balance, false)
      AND COALESCE(activity.movement_count, 0) > 0
  )                                                               AS mismatch_without_opening_balance,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE COALESCE(activity.has_opening_balance, false))
          / NULLIF(COUNT(*), 0)
  , 1)                                                AS percent_onboarded
FROM "products" p
LEFT JOIN (
  SELECT
    "productId",
    COUNT(*) AS movement_count,
    BOOL_OR("movementType" = 'OPENING_BALANCE') AS has_opening_balance
  FROM "stock_movements"
  GROUP BY "productId"
) activity ON activity."productId" = p."id"
WHERE p."stockQuantity" > 0 OR p."trackStock";


-- ---------------------------------------------------------------------
-- SECTION 2 — MISMATCHES. This must return zero rows.
--   Any row here means a stock write bypassed the ledger.
-- ---------------------------------------------------------------------
WITH ledger AS (
  SELECT
    p."id",
    COUNT(m."id")                        AS movement_count,
    COALESCE(SUM(m."quantityChange"), 0) AS ledger_sum,
    COUNT(*) FILTER (WHERE m."movementType" = 'OPENING_BALANCE') AS opening_balance_count,
    COUNT(*) FILTER (
      WHERE m."id" IS NOT NULL
        AND (
          m."quantityBefore" + m."quantityChange" <> m."quantityAfter"
          OR (m."quantityChange" = 0 AND m."movementType" <> 'OPENING_BALANCE')
          OR (m."movementType" = 'OPENING_BALANCE' AND m."quantityBefore" <> 0)
        )
    ) AS broken_movement_count,
    MAX(m."createdAt")                   AS last_movement_at
  FROM "products" p
  LEFT JOIN "stock_movements" m ON m."productId" = p."id"
  GROUP BY p."id"
)
SELECT
  'S2 MISMATCH' AS section,
  p."id", p."sku", p."name",
  p."stockQuantity"                      AS product_quantity,
  l.ledger_sum                           AS ledger_sum,
  p."stockQuantity" - l.ledger_sum       AS difference,
  l.movement_count,
  l.opening_balance_count,
  l.broken_movement_count,
  concat_ws('; ',
    CASE WHEN l.opening_balance_count = 0 THEN 'activity without opening balance' END,
    CASE WHEN l.broken_movement_count > 0 THEN 'broken movement arithmetic' END,
    CASE WHEN l.ledger_sum <> p."stockQuantity" THEN 'ledger sum does not match product quantity' END
  ) AS mismatch_reason,
  l.last_movement_at,
  p."trackStock", p."isActive"
FROM "products" p
JOIN ledger l ON l."id" = p."id"
WHERE l.movement_count > 0
  AND (
    l.opening_balance_count = 0
    OR l.broken_movement_count > 0
    OR l.ledger_sum <> p."stockQuantity"
  )
ORDER BY abs(p."stockQuantity" - l.ledger_sum) DESC;


-- ---------------------------------------------------------------------
-- SECTION 3 — Last-movement consistency.
--   The newest movement's quantityAfter must equal the product's current
--   quantity. This catches a different fault to section 2: a ledger whose
--   total happens to be right but whose running balance drifted.
-- ---------------------------------------------------------------------
WITH latest AS (
  SELECT DISTINCT ON ("productId")
    "productId", "quantityAfter", "movementType", "createdAt"
  FROM "stock_movements"
  ORDER BY "productId", "createdAt" DESC, "id" DESC
)
SELECT
  'S3 last movement drift' AS section,
  p."id", p."sku", p."name",
  p."stockQuantity"     AS product_quantity,
  lt."quantityAfter"    AS last_movement_quantity_after,
  lt."movementType"     AS last_movement_type,
  lt."createdAt"        AS last_movement_at
FROM "products" p
JOIN latest lt ON lt."productId" = p."id"
WHERE lt."quantityAfter" <> p."stockQuantity"
ORDER BY p."name";


-- ---------------------------------------------------------------------
-- SECTION 4 — Internal consistency of each movement row.
--   Every row must satisfy quantityBefore + quantityChange = quantityAfter.
--
--   quantityChange must be non-zero for every movement type EXCEPT
--   OPENING_BALANCE. A verified physical count of zero is a legitimate
--   result — "we counted, there are none" — and it must be recordable,
--   otherwise a product genuinely holding no stock could never be onboarded
--   and could therefore never accept any later stock action.
--
--   OPENING_BALANCE additionally requires quantityBefore = 0: the ledger
--   starts there by definition.
-- ---------------------------------------------------------------------
SELECT
  'S4 broken movement row' AS section,
  m."id", m."productId", p."sku", p."name",
  m."movementType", m."quantityBefore", m."quantityChange", m."quantityAfter",
  m."createdAt",
  CASE
    WHEN m."quantityBefore" + m."quantityChange" <> m."quantityAfter"
      THEN 'before + change <> after'
    WHEN m."movementType" = 'OPENING_BALANCE' AND m."quantityBefore" <> 0
      THEN 'opening balance must start from zero'
    ELSE 'zero change on a non-opening movement'
  END AS fault
FROM "stock_movements" m
JOIN "products" p ON p."id" = m."productId"
WHERE m."quantityBefore" + m."quantityChange" <> m."quantityAfter"
   OR (m."quantityChange" = 0 AND m."movementType" <> 'OPENING_BALANCE')
   OR (m."movementType" = 'OPENING_BALANCE' AND m."quantityBefore" <> 0)
ORDER BY m."createdAt" DESC;


-- ---------------------------------------------------------------------
-- SECTION 5 — Duplicate opening balances.
--   A product must have at most one OPENING_BALANCE. More than one means
--   the template was run twice with its idempotency guard removed.
-- ---------------------------------------------------------------------
SELECT
  'S5 duplicate opening balance' AS section,
  m."productId", p."sku", p."name",
  COUNT(*) AS opening_balance_count,
  SUM(m."quantityChange") AS combined_quantity
FROM "stock_movements" m
JOIN "products" p ON p."id" = m."productId"
WHERE m."movementType" = 'OPENING_BALANCE'
GROUP BY m."productId", p."sku", p."name"
HAVING COUNT(*) > 1;


-- ---------------------------------------------------------------------
-- SECTION 6 — Movements without an opening balance.
--   A product that has stock activity but never had a verified opening
--   count. Its ledger can never reconcile, because it started mid-story.
--   The service layer is supposed to make this impossible.
-- ---------------------------------------------------------------------
SELECT
  'S6 activity without opening balance' AS section,
  p."id", p."sku", p."name", p."stockQuantity",
  COUNT(m."id")      AS movement_count,
  MIN(m."createdAt") AS first_movement_at
FROM "products" p
JOIN "stock_movements" m ON m."productId" = p."id"
GROUP BY p."id", p."sku", p."name", p."stockQuantity"
HAVING COUNT(*) FILTER (WHERE m."movementType" = 'OPENING_BALANCE') = 0
ORDER BY p."name";


-- ---------------------------------------------------------------------
-- SECTION 7 — Pending onboarding.
--   Expected, not a fault. The work queue for physical counting.
-- ---------------------------------------------------------------------
SELECT
  'S7 pending onboarding' AS section,
  p."id", p."sku", p."barcode", p."name", p."model",
  p."stockQuantity" AS unverified_quantity,
  p."trackStock", p."isActive"
FROM "products" p
WHERE NOT EXISTS (SELECT 1 FROM "stock_movements" m WHERE m."productId" = p."id")
  AND (p."stockQuantity" > 0 OR p."trackStock")
ORDER BY p."stockQuantity" DESC, p."name";


-- ---------------------------------------------------------------------
-- SECTION 8 — The negative-stock constraint must still exist.
--   v1.8.0 forbids negative stock absolutely. If this returns no row, an
--   additive migration silently dropped a live safety constraint — treat
--   that as a release blocker.
-- ---------------------------------------------------------------------
SELECT
  'S8 constraint present' AS section,
  conname     AS constraint_name,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = '"products"'::regclass
  AND conname = 'products_stockQuantity_check';

-- =====================================================================
-- END OF RECONCILIATION CHECK — no data was changed.
--
-- PASS CRITERIA
--   section 1 : mismatch_MUST_BE_ZERO = 0
--   section 2 : zero rows
--   section 3 : zero rows
--   section 4 : zero rows
--   section 5 : zero rows
--   section 6 : zero rows
--   section 7 : any number of rows is fine — this is the work queue
--   section 8 : exactly one row
-- =====================================================================
