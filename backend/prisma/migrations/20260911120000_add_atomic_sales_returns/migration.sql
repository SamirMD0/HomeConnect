-- Atomic sales returns are append-only financial and inventory transactions.
ALTER TYPE "SalesOrderFulfillmentStatus" ADD VALUE 'PARTIALLY_RETURNED' BEFORE 'CANCELLED';
ALTER TYPE "StockMovementType" ADD VALUE 'SALE_RETURN_SELLABLE' AFTER 'SALE_CANCEL_RESTORE';
CREATE TYPE "SalesReturnStockDisposition" AS ENUM ('SELLABLE', 'DAMAGED', 'QUARANTINE');
CREATE TYPE "SalesReturnRefundMethod" AS ENUM ('NONE', 'CASH_OUT', 'STORE_CREDIT');

-- Preserve the original fulfillment and its cancellation constraints unchanged.
-- Returns are separate, FK-linked offsets; a customer return never pretends to
-- be a legacy cancellation or replaces its required reversal stock movement.

ALTER TABLE "business_settings"
  ADD COLUMN "returnWindowDays" INTEGER NOT NULL DEFAULT 14,
  ADD CONSTRAINT "business_settings_return_window_days_check"
    CHECK ("returnWindowDays" BETWEEN 1 AND 365);

INSERT INTO "business_settings" ("id", "returnWindowDays", "updatedAt")
VALUES ('primary', 14, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

CREATE TABLE "sales_returns" (
  "id" UUID NOT NULL,
  "returnNumber" TEXT NOT NULL,
  "salesOrderId" UUID NOT NULL,
  "sequence" INTEGER NOT NULL,
  "customerId" UUID,
  "returnDate" DATE NOT NULL,
  "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reason" TEXT NOT NULL,
  "windowDaysSnapshot" INTEGER NOT NULL,
  "returnDeadlineSnapshot" DATE NOT NULL,
  "windowOverride" BOOLEAN NOT NULL DEFAULT false,
  "windowOverrideReason" TEXT,
  "currency" "Currency" NOT NULL,
  "exchangeRate" DECIMAL(18,6) NOT NULL,
  "subtotalExVat" DECIMAL(12,2) NOT NULL,
  "vatAmount" DECIMAL(12,2) NOT NULL,
  "totalIncVat" DECIMAL(12,2) NOT NULL,
  "baseSubtotalExVat" DECIMAL(12,2) NOT NULL,
  "baseVatAmount" DECIMAL(12,2) NOT NULL,
  "baseTotalIncVat" DECIMAL(12,2) NOT NULL,
  "deliveryReturned" BOOLEAN NOT NULL DEFAULT false,
  "deliveryTaxTreatment" "DeliveryTaxTreatment",
  "deliveryTaxRateSnapshot" DECIMAL(6,3),
  "deliveryTaxCodeSnapshot" TEXT,
  "deliveryFeeExVat" DECIMAL(12,2),
  "deliveryVatAmount" DECIMAL(12,2),
  "deliveryFeeIncVat" DECIMAL(12,2),
  "baseDeliveryFeeExVat" DECIMAL(12,2),
  "baseDeliveryVatAmount" DECIMAL(12,2),
  "baseDeliveryFeeIncVat" DECIMAL(12,2),
  "receivableReliefAmount" DECIMAL(12,2) NOT NULL,
  "baseReceivableReliefAmount" DECIMAL(12,2) NOT NULL,
  "refundableAmount" DECIMAL(12,2) NOT NULL,
  "baseRefundableAmount" DECIMAL(12,2) NOT NULL,
  "refundMethod" "SalesReturnRefundMethod" NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "requestFingerprint" TEXT NOT NULL,
  "processedById" UUID NOT NULL,
  "processedByName" TEXT NOT NULL,
  "processedByUsername" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sales_returns_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sales_returns_sequence_check" CHECK ("sequence" > 0),
  CONSTRAINT "sales_returns_window_days_check" CHECK ("windowDaysSnapshot" BETWEEN 1 AND 365),
  CONSTRAINT "sales_returns_amounts_check" CHECK (
    "subtotalExVat" >= 0 AND "vatAmount" >= 0 AND "totalIncVat" >= 0 AND
    "baseSubtotalExVat" >= 0 AND "baseVatAmount" >= 0 AND "baseTotalIncVat" >= 0 AND
    "receivableReliefAmount" >= 0 AND "baseReceivableReliefAmount" >= 0 AND
    "refundableAmount" >= 0 AND "baseRefundableAmount" >= 0 AND
    "totalIncVat" = "receivableReliefAmount" + "refundableAmount"
  ),
  CONSTRAINT "sales_returns_override_reason_check" CHECK (
    ("windowOverride" = false AND "windowOverrideReason" IS NULL) OR
    ("windowOverride" = true AND length(trim("windowOverrideReason")) > 0)
  ),
  CONSTRAINT "sales_returns_refund_method_check" CHECK (
    ("refundableAmount" = 0 AND "refundMethod" = 'NONE') OR
    ("refundableAmount" > 0 AND "refundMethod" IN ('CASH_OUT', 'STORE_CREDIT'))
  ),
  CONSTRAINT "sales_returns_delivery_check" CHECK (
    ("deliveryReturned" = false AND "deliveryTaxTreatment" IS NULL AND "deliveryTaxRateSnapshot" IS NULL AND
      "deliveryFeeExVat" IS NULL AND "deliveryVatAmount" IS NULL AND "deliveryFeeIncVat" IS NULL) OR
    ("deliveryReturned" = true AND "deliveryTaxTreatment" IS NOT NULL AND "deliveryTaxRateSnapshot" IS NOT NULL AND
      "deliveryFeeExVat" IS NOT NULL AND "deliveryVatAmount" IS NOT NULL AND "deliveryFeeIncVat" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "sales_returns_returnNumber_key" ON "sales_returns"("returnNumber");
CREATE UNIQUE INDEX "sales_returns_idempotencyKey_key" ON "sales_returns"("idempotencyKey");
CREATE UNIQUE INDEX "sales_returns_salesOrderId_sequence_key" ON "sales_returns"("salesOrderId", "sequence");
CREATE INDEX "sales_returns_salesOrderId_returnDate_idx" ON "sales_returns"("salesOrderId", "returnDate");
CREATE INDEX "sales_returns_customerId_returnDate_idx" ON "sales_returns"("customerId", "returnDate");
CREATE INDEX "sales_returns_processedAt_idx" ON "sales_returns"("processedAt");

CREATE TABLE "sales_return_items" (
  "id" UUID NOT NULL,
  "salesReturnId" UUID NOT NULL,
  "salesOrderItemId" UUID NOT NULL,
  "salesOrderStockFulfillmentId" UUID,
  "productId" UUID,
  "quantity" INTEGER NOT NULL,
  "productNameSnapshot" TEXT NOT NULL,
  "productModelSnapshot" TEXT,
  "skuSnapshot" TEXT,
  "soldQuantitySnapshot" INTEGER NOT NULL,
  "unitPriceSnapshot" DECIMAL(12,2) NOT NULL,
  "discountAmount" DECIMAL(12,2) NOT NULL,
  "subtotalExVat" DECIMAL(12,2) NOT NULL,
  "vatAmount" DECIMAL(12,2) NOT NULL,
  "totalIncVat" DECIMAL(12,2) NOT NULL,
  "baseSubtotalExVat" DECIMAL(12,2) NOT NULL,
  "baseVatAmount" DECIMAL(12,2) NOT NULL,
  "baseTotalIncVat" DECIMAL(12,2) NOT NULL,
  "taxRateSnapshot" DECIMAL(6,3) NOT NULL,
  "taxCodeSnapshot" TEXT,
  "stockDisposition" "SalesReturnStockDisposition" NOT NULL,
  "conditionNote" TEXT,
  "stockMovementId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sales_return_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sales_return_items_quantity_check" CHECK ("quantity" > 0 AND "quantity" <= "soldQuantitySnapshot"),
  CONSTRAINT "sales_return_items_amounts_check" CHECK (
    "discountAmount" >= 0 AND "subtotalExVat" >= 0 AND "vatAmount" >= 0 AND "totalIncVat" > 0 AND
    "baseSubtotalExVat" >= 0 AND "baseVatAmount" >= 0 AND "baseTotalIncVat" > 0
  )
);

CREATE UNIQUE INDEX "sales_return_items_stockMovementId_key" ON "sales_return_items"("stockMovementId");
CREATE UNIQUE INDEX "sales_return_items_salesReturnId_salesOrderItemId_key" ON "sales_return_items"("salesReturnId", "salesOrderItemId");
CREATE INDEX "sales_return_items_salesOrderItemId_idx" ON "sales_return_items"("salesOrderItemId");
CREATE INDEX "sales_return_items_productId_stockDisposition_idx" ON "sales_return_items"("productId", "stockDisposition");

CREATE TABLE "sales_return_receivable_allocations" (
  "id" UUID NOT NULL,
  "salesReturnId" UUID NOT NULL,
  "debtId" UUID,
  "installmentId" UUID,
  "amount" DECIMAL(12,2) NOT NULL,
  "exchangeRate" DECIMAL(18,6) NOT NULL,
  "baseAmount" DECIMAL(12,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sales_return_receivable_allocations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sales_return_receivable_allocations_target_check" CHECK (("debtId" IS NOT NULL) <> ("installmentId" IS NOT NULL)),
  CONSTRAINT "sales_return_receivable_allocations_amount_check" CHECK ("amount" > 0 AND "baseAmount" > 0)
);

CREATE INDEX "sales_return_receivable_allocations_salesReturnId_idx" ON "sales_return_receivable_allocations"("salesReturnId");
CREATE INDEX "sales_return_receivable_allocations_debtId_idx" ON "sales_return_receivable_allocations"("debtId");
CREATE INDEX "sales_return_receivable_allocations_installmentId_idx" ON "sales_return_receivable_allocations"("installmentId");

CREATE TABLE "cash_refunds" (
  "id" UUID NOT NULL,
  "salesReturnId" UUID NOT NULL,
  "customerId" UUID,
  "amount" DECIMAL(12,2) NOT NULL,
  "currency" "Currency" NOT NULL,
  "exchangeRate" DECIMAL(18,6) NOT NULL,
  "baseAmount" DECIMAL(12,2) NOT NULL,
  "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedById" UUID NOT NULL,
  "processedByName" TEXT NOT NULL,
  "processedByUsername" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  CONSTRAINT "cash_refunds_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "cash_refunds_amount_check" CHECK ("amount" > 0 AND "baseAmount" > 0)
);
CREATE UNIQUE INDEX "cash_refunds_salesReturnId_key" ON "cash_refunds"("salesReturnId");
CREATE INDEX "cash_refunds_customerId_processedAt_idx" ON "cash_refunds"("customerId", "processedAt");

CREATE TABLE "customer_credits" (
  "id" UUID NOT NULL,
  "salesReturnId" UUID NOT NULL,
  "customerId" UUID NOT NULL,
  "issuedAmount" DECIMAL(12,2) NOT NULL,
  "currency" "Currency" NOT NULL,
  "exchangeRate" DECIMAL(18,6) NOT NULL,
  "baseAmount" DECIMAL(12,2) NOT NULL,
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "issuedById" UUID NOT NULL,
  "issuedByName" TEXT NOT NULL,
  "issuedByUsername" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  CONSTRAINT "customer_credits_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "customer_credits_amount_check" CHECK ("issuedAmount" > 0 AND "baseAmount" > 0)
);
CREATE UNIQUE INDEX "customer_credits_salesReturnId_key" ON "customer_credits"("salesReturnId");
CREATE INDEX "customer_credits_customerId_issuedAt_idx" ON "customer_credits"("customerId", "issuedAt");

CREATE TABLE "customer_credit_applications" (
  "id" UUID NOT NULL,
  "customerCreditId" UUID NOT NULL,
  "customerId" UUID NOT NULL,
  "salesOrderId" UUID NOT NULL,
  "debtId" UUID,
  "installmentId" UUID,
  "amount" DECIMAL(12,2) NOT NULL,
  "baseAmount" DECIMAL(12,2) NOT NULL,
  "exchangeRate" DECIMAL(18,6) NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "requestFingerprint" TEXT NOT NULL,
  "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "appliedById" UUID NOT NULL,
  "appliedByName" TEXT NOT NULL,
  "appliedByUsername" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  CONSTRAINT "customer_credit_applications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "customer_credit_applications_target_check" CHECK (("debtId" IS NOT NULL) <> ("installmentId" IS NOT NULL)),
  CONSTRAINT "customer_credit_applications_amount_check" CHECK ("amount" > 0 AND "baseAmount" > 0)
);
CREATE UNIQUE INDEX "customer_credit_applications_idempotencyKey_key" ON "customer_credit_applications"("idempotencyKey");
CREATE INDEX "customer_credit_applications_customerCreditId_appliedAt_idx" ON "customer_credit_applications"("customerCreditId", "appliedAt");
CREATE INDEX "customer_credit_applications_customerId_appliedAt_idx" ON "customer_credit_applications"("customerId", "appliedAt");

ALTER TABLE "sales_returns" ADD CONSTRAINT "sales_returns_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "sales_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_returns" ADD CONSTRAINT "sales_returns_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_returns" ADD CONSTRAINT "sales_returns_processedById_fkey" FOREIGN KEY ("processedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_return_items" ADD CONSTRAINT "sales_return_items_salesReturnId_fkey" FOREIGN KEY ("salesReturnId") REFERENCES "sales_returns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_return_items" ADD CONSTRAINT "sales_return_items_salesOrderItemId_fkey" FOREIGN KEY ("salesOrderItemId") REFERENCES "sales_order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_return_items" ADD CONSTRAINT "sales_return_items_salesOrderStockFulfillmentId_fkey" FOREIGN KEY ("salesOrderStockFulfillmentId") REFERENCES "sales_order_stock_fulfillments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_return_items" ADD CONSTRAINT "sales_return_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_return_items" ADD CONSTRAINT "sales_return_items_stockMovementId_fkey" FOREIGN KEY ("stockMovementId") REFERENCES "stock_movements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_return_receivable_allocations" ADD CONSTRAINT "sales_return_receivable_allocations_salesReturnId_fkey" FOREIGN KEY ("salesReturnId") REFERENCES "sales_returns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_return_receivable_allocations" ADD CONSTRAINT "sales_return_receivable_allocations_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "debts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_return_receivable_allocations" ADD CONSTRAINT "sales_return_receivable_allocations_installmentId_fkey" FOREIGN KEY ("installmentId") REFERENCES "installments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cash_refunds" ADD CONSTRAINT "cash_refunds_salesReturnId_fkey" FOREIGN KEY ("salesReturnId") REFERENCES "sales_returns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cash_refunds" ADD CONSTRAINT "cash_refunds_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cash_refunds" ADD CONSTRAINT "cash_refunds_processedById_fkey" FOREIGN KEY ("processedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_credits" ADD CONSTRAINT "customer_credits_salesReturnId_fkey" FOREIGN KEY ("salesReturnId") REFERENCES "sales_returns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_credits" ADD CONSTRAINT "customer_credits_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_credits" ADD CONSTRAINT "customer_credits_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_credit_applications" ADD CONSTRAINT "customer_credit_applications_customerCreditId_fkey" FOREIGN KEY ("customerCreditId") REFERENCES "customer_credits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_credit_applications" ADD CONSTRAINT "customer_credit_applications_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_credit_applications" ADD CONSTRAINT "customer_credit_applications_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "sales_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_credit_applications" ADD CONSTRAINT "customer_credit_applications_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "debts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_credit_applications" ADD CONSTRAINT "customer_credit_applications_installmentId_fkey" FOREIGN KEY ("installmentId") REFERENCES "installments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_credit_applications" ADD CONSTRAINT "customer_credit_applications_appliedById_fkey" FOREIGN KEY ("appliedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
