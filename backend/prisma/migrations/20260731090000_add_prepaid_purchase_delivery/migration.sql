-- CreateEnum
CREATE TYPE "PrepaidPurchaseStatus" AS ENUM ('PENDING', 'DELIVERED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "FinancialCorrectionRecordType" ADD VALUE 'PREPAID_PURCHASE';

-- AlterEnum
ALTER TYPE "FinancialCorrectionAction" ADD VALUE 'DELIVER_PREPAID';

-- AlterEnum
ALTER TYPE "FinancialCorrectionAction" ADD VALUE 'REVERT_PREPAID_DELIVERY';

-- AlterEnum
ALTER TYPE "FinancialCorrectionSourceScreen" ADD VALUE 'PREPAID';

-- CreateTable
CREATE TABLE "prepaid_purchases" (
  "id" UUID NOT NULL,
  "debtId" UUID NOT NULL,
  "status" "PrepaidPurchaseStatus" NOT NULL DEFAULT 'PENDING',
  "deliveredAt" DATE,
  "deliveredById" UUID,
  "deliveryNotes" TEXT,
  "remainderDebtId" UUID,
  "productId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "prepaid_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "prepaid_purchases_debtId_key" ON "prepaid_purchases"("debtId");

-- CreateIndex
CREATE UNIQUE INDEX "prepaid_purchases_remainderDebtId_key" ON "prepaid_purchases"("remainderDebtId");

-- CreateIndex
CREATE INDEX "prepaid_purchases_status_idx" ON "prepaid_purchases"("status");

-- CreateIndex
CREATE INDEX "prepaid_purchases_deliveredAt_idx" ON "prepaid_purchases"("deliveredAt");

-- CreateIndex
CREATE INDEX "prepaid_purchases_productId_idx" ON "prepaid_purchases"("productId");

-- AddForeignKey
ALTER TABLE "prepaid_purchases" ADD CONSTRAINT "prepaid_purchases_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "debts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prepaid_purchases" ADD CONSTRAINT "prepaid_purchases_deliveredById_fkey" FOREIGN KEY ("deliveredById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prepaid_purchases" ADD CONSTRAINT "prepaid_purchases_remainderDebtId_fkey" FOREIGN KEY ("remainderDebtId") REFERENCES "debts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prepaid_purchases" ADD CONSTRAINT "prepaid_purchases_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: every existing PREPAID_PURCHASE debt needs a companion row, or it
-- disappears from the new Prepaid Purchases section. Delivery was never recorded
-- before this migration, so non-cancelled records are backfilled as PENDING.
-- Any item already handed over must be marked delivered manually once.
INSERT INTO "prepaid_purchases" ("id", "debtId", "status", "createdAt", "updatedAt")
SELECT
  (md5(random()::text || clock_timestamp()::text || "d"."id"::text))::uuid,
  "d"."id",
  CASE
    WHEN "d"."status" = 'CANCELLED' THEN 'CANCELLED'::"PrepaidPurchaseStatus"
    ELSE 'PENDING'::"PrepaidPurchaseStatus"
  END,
  "d"."createdAt",
  CURRENT_TIMESTAMP
FROM "debts" "d"
WHERE "d"."kind" = 'PREPAID_PURCHASE';
