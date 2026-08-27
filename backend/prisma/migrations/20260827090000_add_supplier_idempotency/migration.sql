-- Nullable keys keep existing callers and rows backward compatible. PostgreSQL
-- unique indexes permit multiple NULLs while rejecting duplicate request keys.
ALTER TABLE "supplier_transactions" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "supplier_receivings" ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "supplier_transactions_idempotencyKey_key"
ON "supplier_transactions"("idempotencyKey");

CREATE UNIQUE INDEX "supplier_receivings_idempotencyKey_key"
ON "supplier_receivings"("idempotencyKey");
