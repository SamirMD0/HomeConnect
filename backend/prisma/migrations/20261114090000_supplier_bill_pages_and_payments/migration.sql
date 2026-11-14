-- Phase B: bills link to payments, have several pages, and keep replaced and
-- deleted pages as history. Additive only: nothing is dropped or rewritten.
-- AlterTable
ALTER TABLE "supplier_receiving_receipts" ADD COLUMN     "billGroupId" UUID,
ADD COLUMN     "deleteReason" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedById" UUID,
ADD COLUMN     "pageNumber" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "replacedAt" TIMESTAMP(3),
ADD COLUMN     "replacedById" UUID,
ADD COLUMN     "supplierTransactionId" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "supplier_receiving_receipts_replacedById_key" ON "supplier_receiving_receipts"("replacedById");

-- CreateIndex
CREATE INDEX "supplier_receiving_receipts_supplierTransactionId_idx" ON "supplier_receiving_receipts"("supplierTransactionId");

-- CreateIndex
CREATE INDEX "supplier_receiving_receipts_billGroupId_idx" ON "supplier_receiving_receipts"("billGroupId");

-- AddForeignKey
ALTER TABLE "supplier_receiving_receipts" ADD CONSTRAINT "supplier_receiving_receipts_supplierTransactionId_fkey" FOREIGN KEY ("supplierTransactionId") REFERENCES "supplier_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_receiving_receipts" ADD CONSTRAINT "supplier_receiving_receipts_replacedById_fkey" FOREIGN KEY ("replacedById") REFERENCES "supplier_receiving_receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_receiving_receipts" ADD CONSTRAINT "supplier_receiving_receipts_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Every existing page is its own one-page bill.
UPDATE "supplier_receiving_receipts" SET "billGroupId" = "id" WHERE "billGroupId" IS NULL;
