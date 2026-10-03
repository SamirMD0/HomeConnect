-- CreateTable
CREATE TABLE "supplier_receiving_receipts" (
    "id" UUID NOT NULL,
    "supplierReceivingId" UUID NOT NULL,
    "filename" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "capturedById" UUID NOT NULL,

    CONSTRAINT "supplier_receiving_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "supplier_receiving_receipts_supplierReceivingId_idx" ON "supplier_receiving_receipts"("supplierReceivingId");

-- CreateIndex
CREATE INDEX "supplier_receiving_receipts_capturedAt_idx" ON "supplier_receiving_receipts"("capturedAt");

-- AddForeignKey
ALTER TABLE "supplier_receiving_receipts" ADD CONSTRAINT "supplier_receiving_receipts_supplierReceivingId_fkey" FOREIGN KEY ("supplierReceivingId") REFERENCES "supplier_receivings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_receiving_receipts" ADD CONSTRAINT "supplier_receiving_receipts_capturedById_fkey" FOREIGN KEY ("capturedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
