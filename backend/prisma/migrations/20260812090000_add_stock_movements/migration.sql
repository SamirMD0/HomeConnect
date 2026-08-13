-- Inventory v1.8.0 is schema-only. Existing product quantities are unverified,
-- so this migration intentionally inserts no movements and changes no products.

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM (
  'OPENING_BALANCE',
  'MANUAL_ADD',
  'MANUAL_REMOVE',
  'STOCK_COUNT',
  'DAMAGE_LOSS',
  'RETURN_TO_STOCK',
  'PURCHASE_RECEIPT',
  'SALE_FULFILLMENT',
  'SALE_CANCEL_RESTORE',
  'SERVICE_PART_USED'
);

-- CreateTable
CREATE TABLE "stock_movements" (
  "id" UUID NOT NULL,
  "productId" UUID NOT NULL,
  "movementType" "StockMovementType" NOT NULL,
  "quantityChange" INTEGER NOT NULL,
  "quantityBefore" INTEGER NOT NULL,
  "quantityAfter" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "note" TEXT,
  "referenceType" TEXT,
  "referenceId" UUID,
  "createdById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "stock_movements_balance_equation_check"
    CHECK ("quantityBefore" + "quantityChange" = "quantityAfter"),
  CONSTRAINT "stock_movements_nonnegative_balances_check"
    CHECK ("quantityBefore" >= 0 AND "quantityAfter" >= 0),
  CONSTRAINT "stock_movements_nonzero_change_check"
    CHECK ("quantityChange" <> 0 OR "movementType" = 'OPENING_BALANCE'),
  CONSTRAINT "stock_movements_opening_starts_zero_check"
    CHECK ("movementType" <> 'OPENING_BALANCE' OR "quantityBefore" = 0),
  CONSTRAINT "stock_movements_reason_nonempty_check"
    CHECK (btrim("reason") <> '')
);

-- CreateIndex
CREATE INDEX "stock_movements_productId_createdAt_idx"
  ON "stock_movements"("productId", "createdAt");

-- CreateIndex
CREATE INDEX "stock_movements_movementType_createdAt_idx"
  ON "stock_movements"("movementType", "createdAt");

-- CreateIndex
CREATE INDEX "stock_movements_createdAt_idx"
  ON "stock_movements"("createdAt");

-- A product is onboarded exactly once. Prisma cannot express this partial index.
CREATE UNIQUE INDEX "stock_movements_one_opening_balance_per_product"
  ON "stock_movements"("productId")
  WHERE "movementType" = 'OPENING_BALANCE';

-- AddForeignKey
ALTER TABLE "stock_movements"
  ADD CONSTRAINT "stock_movements_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "products"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements"
  ADD CONSTRAINT "stock_movements_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
