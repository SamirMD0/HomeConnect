-- Optional, explicit financial-to-inventory document link. This creates no
-- transactions and changes no existing receiving or ledger rows.
ALTER TABLE "supplier_transactions"
  ADD COLUMN "supplierReceivingId" UUID;

ALTER TABLE "supplier_transactions"
  ADD CONSTRAINT "supplier_transactions_receiving_requires_debt_check"
  CHECK ("supplierReceivingId" IS NULL OR "type" = 'SUPPLIER_DEBT');

CREATE UNIQUE INDEX "supplier_transactions_supplierReceivingId_key"
  ON "supplier_transactions"("supplierReceivingId");

CREATE UNIQUE INDEX "supplier_receivings_id_supplierId_key"
  ON "supplier_receivings"("id", "supplierId");

ALTER TABLE "supplier_transactions"
  ADD CONSTRAINT "supplier_transactions_supplierReceivingId_fkey"
  FOREIGN KEY ("supplierReceivingId", "supplierId") REFERENCES "supplier_receivings"("id", "supplierId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
