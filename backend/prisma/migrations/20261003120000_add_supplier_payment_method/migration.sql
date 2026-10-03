CREATE TYPE "SupplierPaymentMethod" AS ENUM ('CASH_USD', 'CASH_LBP', 'CHEQUE', 'BANK_TRANSFER');

ALTER TABLE "supplier_transactions"
ADD COLUMN "paymentMethod" "SupplierPaymentMethod";
