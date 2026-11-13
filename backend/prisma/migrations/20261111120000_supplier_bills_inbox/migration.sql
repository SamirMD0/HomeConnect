BEGIN;

ALTER TABLE "supplier_receiving_receipts"
  ADD COLUMN "supplierId" UUID,
  ADD COLUMN "branchId" UUID,
  ADD COLUMN "note" TEXT;

UPDATE "supplier_receiving_receipts"
SET "supplierId" = receiving."supplierId", "branchId" = receiving."branchId"
FROM "supplier_receivings" AS receiving
WHERE "supplier_receiving_receipts"."supplierReceivingId" = receiving.id
  AND "supplier_receiving_receipts"."supplierId" IS NULL
  AND "supplier_receiving_receipts"."branchId" IS NULL;

-- A receiving can historically have no supplier. Never invent an owner or
-- discard a photo: abort atomically so an operator can assign its supplier.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "supplier_receiving_receipts" WHERE "supplierId" IS NULL OR "branchId" IS NULL) THEN
    RAISE EXCEPTION 'Supplier bill migration: assign a supplier to every receiving with receipt photos, then retry. No receipt data was changed.';
  END IF;
END $$;

ALTER TABLE "supplier_receiving_receipts"
  ALTER COLUMN "supplierId" SET NOT NULL,
  ALTER COLUMN "branchId" SET NOT NULL,
  ALTER COLUMN "supplierReceivingId" DROP NOT NULL,
  ADD CONSTRAINT "supplier_receiving_receipts_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "supplier_receiving_receipts_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "supplier_receiving_receipts_supplierId_capturedAt_idx" ON "supplier_receiving_receipts"("supplierId", "capturedAt");
CREATE INDEX "supplier_receiving_receipts_branchId_idx" ON "supplier_receiving_receipts"("branchId");

CREATE TABLE "supplier_receipt_blobs" (
  "receiptId" UUID PRIMARY KEY,
  "data" BYTEA NOT NULL,
  CONSTRAINT "supplier_receipt_blobs_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "supplier_receiving_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

COMMIT;
