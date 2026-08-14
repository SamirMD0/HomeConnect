-- HomeConnect Inventory v1.9.0 document-link preflight (REPORT ONLY)
-- No statement in this file writes data.
--
-- BUSINESS DATE CONVERSION (corrected in CP-1918C, 2026-08-14)
--   stock_movements."createdAt" is `timestamp without time zone` and Prisma
--   stores UTC in it, so converting it to a Beirut business date takes two
--   steps: label it UTC, then read it in Asia/Beirut.
--
--       ("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Beirut')::date
--
--   This file previously used the one-step ("createdAt" AT TIME ZONE
--   'Asia/Beirut')::date. With the session timezone set to Asia/Beirut that
--   form round-trips back to the stored UTC wall value, so it yielded the UTC
--   date rather than the Beirut date. The two disagree for opening counts
--   recorded after 21:00 UTC, where the Beirut date is already the next day,
--   which could shift a PREDATES_OPENING_COUNT verdict by one day.
--
--   The application has always used the two-step form for this comparison
--   (see InventoryRepository.querySalesOrderIdsAwaitingStockDeduction, which
--   is covered by a test asserting the exact idiom). This is a report-only
--   correction that brings the report back in line with the application; no
--   application behaviour and no stored data are affected.

WITH line_state AS (
  SELECT
    o."id" AS "salesOrderId",
    o."orderNumber",
    i."id" AS "salesOrderItemId",
    i."productId",
    i."quantity",
    p."stockQuantity",
    CASE
      WHEN i."productId" IS NULL THEN 'NOT_INVENTORY_LINE'
      WHEN p."trackStock" = false THEN 'STOCK_NOT_TRACKED'
      WHEN opening."createdAt" IS NULL THEN 'NEEDS_OPENING_COUNT'
      WHEN o."orderDate" < (opening."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Beirut')::date THEN 'PREDATES_OPENING_COUNT'
      WHEN o."fulfillmentStatus"::text NOT IN ('CONFIRMED', 'PREPARING', 'READY_FOR_DELIVERY', 'OUT_FOR_DELIVERY', 'DELIVERED') THEN 'ORDER_NOT_ELIGIBLE'
      WHEN active_fulfillment."id" IS NOT NULL THEN 'ALREADY_DEDUCTED'
      WHEN p."stockQuantity" < i."quantity" THEN 'INSUFFICIENT_STOCK'
      WHEN reversed_fulfillment."id" IS NOT NULL THEN 'RESTORED'
      ELSE 'AVAILABLE'
    END AS "inventoryState"
  FROM "sales_orders" o
  JOIN "sales_order_items" i ON i."salesOrderId" = o."id"
  LEFT JOIN "products" p ON p."id" = i."productId"
  LEFT JOIN "stock_movements" opening
    ON opening."productId" = p."id" AND opening."movementType" = 'OPENING_BALANCE'
  LEFT JOIN "sales_order_stock_fulfillments" active_fulfillment
    ON active_fulfillment."salesOrderItemId" = i."id" AND active_fulfillment."status" = 'ACTIVE'
  LEFT JOIN LATERAL (
    SELECT f."id"
    FROM "sales_order_stock_fulfillments" f
    WHERE f."salesOrderItemId" = i."id" AND f."status" = 'REVERSED'
    ORDER BY f."createdAt" DESC
    LIMIT 1
  ) reversed_fulfillment ON true
)
SELECT "inventoryState", COUNT(*) AS "lineCount", COUNT(DISTINCT "salesOrderId") AS "orderCount"
FROM line_state
GROUP BY "inventoryState"
ORDER BY "inventoryState";

WITH opening_dates AS (
  SELECT "productId", ("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Beirut')::date AS "openingBusinessDate"
  FROM "stock_movements"
  WHERE "movementType" = 'OPENING_BALANCE'
)
SELECT COUNT(*) AS "ordersPredatingOpeningCount"
FROM "sales_orders" o
JOIN "sales_order_items" i ON i."salesOrderId" = o."id"
JOIN opening_dates opening ON opening."productId" = i."productId"
WHERE o."orderDate" < opening."openingBusinessDate";
