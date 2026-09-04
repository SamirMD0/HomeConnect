-- Additive USD/LBP foundation. Existing native amounts are never rewritten.
CREATE TYPE "Currency" AS ENUM ('USD', 'LBP');

CREATE TABLE "exchange_rates" (
    "id" UUID NOT NULL,
    "fromCurrency" "Currency" NOT NULL,
    "toCurrency" "Currency" NOT NULL,
    "rate" DECIMAL(18,6) NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "exchange_rates_positive_rate_check" CHECK ("rate" > 0),
    CONSTRAINT "exchange_rates_distinct_pair_check" CHECK ("fromCurrency" <> "toCurrency")
);

CREATE UNIQUE INDEX "exchange_rates_fromCurrency_toCurrency_effectiveFrom_key"
ON "exchange_rates"("fromCurrency", "toCurrency", "effectiveFrom");
CREATE INDEX "exchange_rates_fromCurrency_toCurrency_effectiveFrom_idx"
ON "exchange_rates"("fromCurrency", "toCurrency", "effectiveFrom");
CREATE INDEX "exchange_rates_createdAt_idx" ON "exchange_rates"("createdAt");

ALTER TABLE "exchange_rates"
ADD CONSTRAINT "exchange_rates_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "debts"
  ADD COLUMN "currency" "Currency" DEFAULT 'USD',
  ADD COLUMN "exchangeRate" DECIMAL(18,6),
  ADD COLUMN "baseOriginalAmount" DECIMAL(12,2);
UPDATE "debts" SET "exchangeRate" = 1, "baseOriginalAmount" = "originalAmount"
WHERE "exchangeRate" IS NULL AND "baseOriginalAmount" IS NULL;
ALTER TABLE "debts"
  ALTER COLUMN "currency" SET NOT NULL,
  ALTER COLUMN "exchangeRate" SET NOT NULL,
  ALTER COLUMN "exchangeRate" SET DEFAULT 1,
  ALTER COLUMN "baseOriginalAmount" SET NOT NULL,
  ADD CONSTRAINT "debts_positive_exchange_rate_check" CHECK ("exchangeRate" > 0),
  ADD CONSTRAINT "debts_usd_rate_check" CHECK ("currency" <> 'USD' OR "exchangeRate" = 1),
  ADD CONSTRAINT "debts_lbp_whole_amount_check" CHECK ("currency" <> 'LBP' OR trunc("originalAmount") = "originalAmount");

ALTER TABLE "installment_plans"
  ADD COLUMN "currency" "Currency" DEFAULT 'USD',
  ADD COLUMN "exchangeRate" DECIMAL(18,6),
  ADD COLUMN "baseTotalAmount" DECIMAL(12,2);
UPDATE "installment_plans" SET "exchangeRate" = 1, "baseTotalAmount" = "totalAmount"
WHERE "exchangeRate" IS NULL AND "baseTotalAmount" IS NULL;
ALTER TABLE "installment_plans"
  ALTER COLUMN "currency" SET NOT NULL,
  ALTER COLUMN "exchangeRate" SET NOT NULL,
  ALTER COLUMN "exchangeRate" SET DEFAULT 1,
  ALTER COLUMN "baseTotalAmount" SET NOT NULL,
  ADD CONSTRAINT "installment_plans_positive_exchange_rate_check" CHECK ("exchangeRate" > 0),
  ADD CONSTRAINT "installment_plans_usd_rate_check" CHECK ("currency" <> 'USD' OR "exchangeRate" = 1),
  ADD CONSTRAINT "installment_plans_lbp_whole_amount_check" CHECK ("currency" <> 'LBP' OR trunc("totalAmount") = "totalAmount");

ALTER TABLE "installments" ADD COLUMN "baseAmountDue" DECIMAL(12,2);
UPDATE "installments" SET "baseAmountDue" = "amountDue" WHERE "baseAmountDue" IS NULL;
ALTER TABLE "installments" ALTER COLUMN "baseAmountDue" SET NOT NULL;

ALTER TABLE "payments"
  ADD COLUMN "currency" "Currency" DEFAULT 'USD',
  ADD COLUMN "exchangeRate" DECIMAL(18,6),
  ADD COLUMN "baseAmount" DECIMAL(12,2);
UPDATE "payments" SET "exchangeRate" = 1, "baseAmount" = "totalAmount"
WHERE "exchangeRate" IS NULL AND "baseAmount" IS NULL;
ALTER TABLE "payments"
  ALTER COLUMN "currency" SET NOT NULL,
  ALTER COLUMN "exchangeRate" SET NOT NULL,
  ALTER COLUMN "exchangeRate" SET DEFAULT 1,
  ALTER COLUMN "baseAmount" SET NOT NULL,
  ADD CONSTRAINT "payments_positive_exchange_rate_check" CHECK ("exchangeRate" > 0),
  ADD CONSTRAINT "payments_usd_rate_check" CHECK ("currency" <> 'USD' OR "exchangeRate" = 1),
  ADD CONSTRAINT "payments_lbp_whole_amount_check" CHECK ("currency" <> 'LBP' OR trunc("totalAmount") = "totalAmount");

ALTER TABLE "payment_allocations"
  ADD COLUMN "paymentAmount" DECIMAL(12,2),
  ADD COLUMN "exchangeRate" DECIMAL(18,6);
UPDATE "payment_allocations" SET "paymentAmount" = "amount", "exchangeRate" = 1
WHERE "paymentAmount" IS NULL AND "exchangeRate" IS NULL;
ALTER TABLE "payment_allocations"
  ALTER COLUMN "paymentAmount" SET NOT NULL,
  ALTER COLUMN "exchangeRate" SET NOT NULL,
  ALTER COLUMN "exchangeRate" SET DEFAULT 1,
  ADD CONSTRAINT "payment_allocations_positive_exchange_rate_check" CHECK ("exchangeRate" > 0);

ALTER TABLE "products" ADD COLUMN "priceCurrency" "Currency" NOT NULL DEFAULT 'USD';
ALTER TABLE "products"
  ADD CONSTRAINT "products_lbp_whole_prices_check" CHECK (
    "priceCurrency" <> 'LBP'
    OR (("price" IS NULL OR trunc("price") = "price")
      AND ("discount" IS NULL OR trunc("discount") = "discount")
      AND ("costPrice" IS NULL OR trunc("costPrice") = "costPrice"))
  );

ALTER TABLE "service_jobs"
  ADD COLUMN "currency" "Currency" DEFAULT 'USD',
  ADD COLUMN "exchangeRate" DECIMAL(18,6),
  ADD COLUMN "baseEstimatedPrice" DECIMAL(12,2),
  ADD COLUMN "baseFinalPrice" DECIMAL(12,2);
UPDATE "service_jobs" SET
  "exchangeRate" = 1,
  "baseEstimatedPrice" = "estimatedPrice", "baseFinalPrice" = "finalPrice"
WHERE "exchangeRate" IS NULL
  AND "baseEstimatedPrice" IS NULL
  AND "baseFinalPrice" IS NULL;
ALTER TABLE "service_jobs"
  ALTER COLUMN "currency" SET NOT NULL,
  ALTER COLUMN "exchangeRate" SET NOT NULL,
  ALTER COLUMN "exchangeRate" SET DEFAULT 1,
  ADD CONSTRAINT "service_jobs_positive_exchange_rate_check" CHECK ("exchangeRate" > 0),
  ADD CONSTRAINT "service_jobs_usd_rate_check" CHECK ("currency" <> 'USD' OR "exchangeRate" = 1),
  ADD CONSTRAINT "service_jobs_lbp_whole_prices_check" CHECK (
    "currency" <> 'LBP'
    OR (("estimatedPrice" IS NULL OR trunc("estimatedPrice") = "estimatedPrice")
      AND ("finalPrice" IS NULL OR trunc("finalPrice") = "finalPrice"))
  );

ALTER TABLE "sales_orders"
  ADD COLUMN "currency" "Currency" DEFAULT 'USD',
  ADD COLUMN "exchangeRate" DECIMAL(18,6),
  ADD COLUMN "baseSubtotal" DECIMAL(12,2),
  ADD COLUMN "baseDeliveryFee" DECIMAL(12,2),
  ADD COLUMN "baseTotalAmount" DECIMAL(12,2),
  ADD COLUMN "basePaidAmount" DECIMAL(12,2),
  ADD COLUMN "baseRemainingAmount" DECIMAL(12,2);
UPDATE "sales_orders" SET
  "exchangeRate" = 1,
  "baseSubtotal" = "itemsSubtotal", "baseDeliveryFee" = "deliveryFee",
  "baseTotalAmount" = "totalAmount", "basePaidAmount" = "paidAmount",
  "baseRemainingAmount" = "remainingAmount"
WHERE "exchangeRate" IS NULL
  AND "baseSubtotal" IS NULL
  AND "baseDeliveryFee" IS NULL
  AND "baseTotalAmount" IS NULL
  AND "basePaidAmount" IS NULL
  AND "baseRemainingAmount" IS NULL;
ALTER TABLE "sales_orders"
  ALTER COLUMN "currency" SET NOT NULL,
  ALTER COLUMN "exchangeRate" SET NOT NULL,
  ALTER COLUMN "exchangeRate" SET DEFAULT 1,
  ALTER COLUMN "baseSubtotal" SET NOT NULL,
  ALTER COLUMN "baseTotalAmount" SET NOT NULL,
  ALTER COLUMN "basePaidAmount" SET NOT NULL,
  ALTER COLUMN "baseRemainingAmount" SET NOT NULL,
  ADD CONSTRAINT "sales_orders_positive_exchange_rate_check" CHECK ("exchangeRate" > 0),
  ADD CONSTRAINT "sales_orders_usd_rate_check" CHECK ("currency" <> 'USD' OR "exchangeRate" = 1),
  ADD CONSTRAINT "sales_orders_lbp_whole_amounts_check" CHECK (
    "currency" <> 'LBP'
    OR (trunc("itemsSubtotal") = "itemsSubtotal"
      AND ("deliveryFee" IS NULL OR trunc("deliveryFee") = "deliveryFee")
      AND trunc("totalAmount") = "totalAmount"
      AND trunc("paidAmount") = "paidAmount"
      AND trunc("remainingAmount") = "remainingAmount")
  );

ALTER TABLE "sales_order_items"
  ADD COLUMN "baseUnitPrice" DECIMAL(12,2),
  ADD COLUMN "baseDiscountAmount" DECIMAL(12,2),
  ADD COLUMN "baseLineTotal" DECIMAL(12,2);
UPDATE "sales_order_items" SET
  "baseUnitPrice" = "unitPrice", "baseDiscountAmount" = "discountAmount",
  "baseLineTotal" = "lineTotal"
WHERE "baseUnitPrice" IS NULL
  AND "baseDiscountAmount" IS NULL
  AND "baseLineTotal" IS NULL;
ALTER TABLE "sales_order_items"
  ALTER COLUMN "baseUnitPrice" SET NOT NULL,
  ALTER COLUMN "baseLineTotal" SET NOT NULL;

ALTER TABLE "supplier_transactions"
  ADD COLUMN "currency" "Currency" DEFAULT 'USD',
  ADD COLUMN "exchangeRate" DECIMAL(18,6),
  ADD COLUMN "baseAmount" DECIMAL(12,2);
UPDATE "supplier_transactions" SET "exchangeRate" = 1, "baseAmount" = "amount"
WHERE "exchangeRate" IS NULL AND "baseAmount" IS NULL;
ALTER TABLE "supplier_transactions"
  ALTER COLUMN "currency" SET NOT NULL,
  ALTER COLUMN "exchangeRate" SET NOT NULL,
  ALTER COLUMN "exchangeRate" SET DEFAULT 1,
  ALTER COLUMN "baseAmount" SET NOT NULL,
  ADD CONSTRAINT "supplier_transactions_positive_exchange_rate_check" CHECK ("exchangeRate" > 0),
  ADD CONSTRAINT "supplier_transactions_usd_rate_check" CHECK ("currency" <> 'USD' OR "exchangeRate" = 1),
  ADD CONSTRAINT "supplier_transactions_lbp_whole_amount_check" CHECK ("currency" <> 'LBP' OR trunc("amount") = "amount");

ALTER TABLE "supplier_purchase_lines"
  ADD COLUMN "baseUnitPrice" DECIMAL(12,2),
  ADD COLUMN "baseLineTotal" DECIMAL(12,2);
UPDATE "supplier_purchase_lines" SET "baseUnitPrice" = "unitPrice", "baseLineTotal" = "lineTotal"
WHERE "baseUnitPrice" IS NULL AND "baseLineTotal" IS NULL;
ALTER TABLE "supplier_purchase_lines" ALTER COLUMN "baseLineTotal" SET NOT NULL;
