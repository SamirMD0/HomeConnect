-- HomeConnect Inventory v1.9.0 fulfillment reconciliation (REPORT ONLY)
-- Expected result: every FAULT count is zero.

SELECT 'FAULT_PRODUCT_LEDGER_MISMATCH' AS "check", COUNT(*) AS "faultCount"
FROM "products" p
WHERE p."trackStock" = true
  AND p."stockQuantity" <> COALESCE((
    SELECT SUM(m."quantityChange") FROM "stock_movements" m WHERE m."productId" = p."id"
  ), 0)
UNION ALL
SELECT 'FAULT_ACTIVE_FULFILLMENT_LINK', COUNT(*)
FROM "sales_order_stock_fulfillments" f
LEFT JOIN "stock_movements" deduction ON deduction."id" = f."stockMovementId"
WHERE f."status" = 'ACTIVE'
  AND (
    deduction."id" IS NULL
    OR deduction."movementType" <> 'SALE_FULFILLMENT'
    OR deduction."productId" <> f."productId"
    OR deduction."quantityChange" <> -f."quantity"
    OR f."reversalStockMovementId" IS NOT NULL
  )
UNION ALL
SELECT 'FAULT_REVERSED_FULFILLMENT_LINK', COUNT(*)
FROM "sales_order_stock_fulfillments" f
LEFT JOIN "stock_movements" deduction ON deduction."id" = f."stockMovementId"
LEFT JOIN "stock_movements" restoration ON restoration."id" = f."reversalStockMovementId"
WHERE f."status" = 'REVERSED'
  AND (
    deduction."id" IS NULL
    OR restoration."id" IS NULL
    OR deduction."movementType" <> 'SALE_FULFILLMENT'
    OR restoration."movementType" <> 'SALE_CANCEL_RESTORE'
    OR deduction."productId" <> f."productId"
    OR restoration."productId" <> f."productId"
    OR deduction."quantityChange" <> -f."quantity"
    OR restoration."quantityChange" <> f."quantity"
  )
UNION ALL
SELECT 'FAULT_MOVEMENT_WITHOUT_FULFILLMENT', COUNT(*)
FROM "stock_movements" m
WHERE m."movementType" IN ('SALE_FULFILLMENT', 'SALE_CANCEL_RESTORE')
  AND NOT EXISTS (
    SELECT 1
    FROM "sales_order_stock_fulfillments" f
    WHERE f."stockMovementId" = m."id" OR f."reversalStockMovementId" = m."id"
  );

SELECT
  f."status",
  COUNT(*) AS "fulfillmentCount",
  SUM(f."quantity") AS "unitCount"
FROM "sales_order_stock_fulfillments" f
GROUP BY f."status"
ORDER BY f."status";
