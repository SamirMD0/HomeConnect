-- Inventory v1.9.0 links future explicit sales-order stock actions to their
-- movements. Existing orders, items, products, and stock movements are left
-- untouched; this migration intentionally inserts and updates no rows.

-- CreateEnum
CREATE TYPE "SalesOrderStockFulfillmentStatus" AS ENUM ('ACTIVE', 'REVERSED');

-- AddEnumValues
ALTER TYPE "SalesAuditAction" ADD VALUE 'DEDUCT_STOCK';
ALTER TYPE "SalesAuditAction" ADD VALUE 'RESTORE_STOCK';

-- CreateTable
CREATE TABLE "sales_order_stock_fulfillments" (
  "id" UUID NOT NULL,
  "salesOrderId" UUID NOT NULL,
  "salesOrderItemId" UUID NOT NULL,
  "productId" UUID NOT NULL,
  "quantity" INTEGER NOT NULL,
  "status" "SalesOrderStockFulfillmentStatus" NOT NULL DEFAULT 'ACTIVE',
  "stockMovementId" UUID NOT NULL,
  "reversalStockMovementId" UUID,
  "reversedAt" TIMESTAMP(3),
  "reversedById" UUID,
  "reversalReason" TEXT,
  "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "sales_order_stock_fulfillments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sales_order_stock_fulfillments_positive_quantity_check"
    CHECK ("quantity" > 0),
  CONSTRAINT "sales_order_stock_fulfillments_reversal_coherent_check"
    CHECK (
      ("status" = 'ACTIVE' AND "reversalStockMovementId" IS NULL AND "reversedAt" IS NULL
        AND "reversedById" IS NULL AND "reversalReason" IS NULL)
      OR
      ("status" = 'REVERSED' AND "reversalStockMovementId" IS NOT NULL AND "reversedAt" IS NOT NULL
        AND "reversedById" IS NOT NULL AND "reversalReason" IS NOT NULL)
    ),
  CONSTRAINT "sales_order_stock_fulfillments_reversal_reason_nonempty_check"
    CHECK ("reversalReason" IS NULL OR btrim("reversalReason") <> '')
);

-- CreateIndex
CREATE UNIQUE INDEX "sales_order_stock_fulfillments_stockMovementId_key"
  ON "sales_order_stock_fulfillments"("stockMovementId");

-- PostgreSQL permits multiple NULLs in a unique index, while ensuring that one
-- reversal movement can never be linked to two fulfillment histories.
CREATE UNIQUE INDEX "sales_order_stock_fulfillments_reversalStockMovementId_key"
  ON "sales_order_stock_fulfillments"("reversalStockMovementId");

CREATE INDEX "sales_order_stock_fulfillments_salesOrderId_idx"
  ON "sales_order_stock_fulfillments"("salesOrderId");

CREATE INDEX "sales_order_stock_fulfillments_productId_createdAt_idx"
  ON "sales_order_stock_fulfillments"("productId", "createdAt");

CREATE INDEX "sales_order_stock_fulfillments_status_idx"
  ON "sales_order_stock_fulfillments"("status");

-- Prisma cannot express this partial index. A line may be deducted again only
-- after its previous fulfillment has been explicitly reversed.
CREATE UNIQUE INDEX "sales_order_stock_fulfillments_one_active_per_item"
  ON "sales_order_stock_fulfillments"("salesOrderItemId")
  WHERE "status" = 'ACTIVE';

-- AddForeignKey
ALTER TABLE "sales_order_stock_fulfillments"
  ADD CONSTRAINT "sales_order_stock_fulfillments_salesOrderId_fkey"
  FOREIGN KEY ("salesOrderId") REFERENCES "sales_orders"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sales_order_stock_fulfillments"
  ADD CONSTRAINT "sales_order_stock_fulfillments_salesOrderItemId_fkey"
  FOREIGN KEY ("salesOrderItemId") REFERENCES "sales_order_items"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sales_order_stock_fulfillments"
  ADD CONSTRAINT "sales_order_stock_fulfillments_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "products"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sales_order_stock_fulfillments"
  ADD CONSTRAINT "sales_order_stock_fulfillments_stockMovementId_fkey"
  FOREIGN KEY ("stockMovementId") REFERENCES "stock_movements"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sales_order_stock_fulfillments"
  ADD CONSTRAINT "sales_order_stock_fulfillments_reversalStockMovementId_fkey"
  FOREIGN KEY ("reversalStockMovementId") REFERENCES "stock_movements"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sales_order_stock_fulfillments"
  ADD CONSTRAINT "sales_order_stock_fulfillments_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sales_order_stock_fulfillments"
  ADD CONSTRAINT "sales_order_stock_fulfillments_reversedById_fkey"
  FOREIGN KEY ("reversedById") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
