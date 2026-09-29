-- Additive scheduling metadata only. Existing transaction amounts, rates,
-- payments, status, and history remain unchanged; NULL means unscheduled.
ALTER TABLE "supplier_transactions" ADD COLUMN "dueDate" DATE;
CREATE INDEX "supplier_transactions_status_dueDate_idx"
  ON "supplier_transactions"("status", "dueDate");
