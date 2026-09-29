-- Delivery VAT is additive. Existing orders were priced with delivery outside
-- the VAT base, so they are backfilled as EXEMPT with zero VAT and their stored
-- totals remain byte-for-byte unchanged. New orders default to STANDARD.
CREATE TYPE "DeliveryTaxTreatment" AS ENUM ('STANDARD', 'ZERO_RATED', 'EXEMPT');

ALTER TABLE "sales_orders"
  ADD COLUMN "deliveryTaxTreatment" "DeliveryTaxTreatment" NOT NULL DEFAULT 'EXEMPT',
  ADD COLUMN "deliveryTaxRateSnapshot" DECIMAL(6,3) NOT NULL DEFAULT 0,
  ADD COLUMN "deliveryTaxCodeSnapshot" TEXT,
  ADD COLUMN "deliveryFeeExVat" DECIMAL(12,2),
  ADD COLUMN "deliveryVatAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "deliveryFeeIncVat" DECIMAL(12,2);

UPDATE "sales_orders"
SET
  "deliveryFeeExVat" = "deliveryFee",
  "deliveryFeeIncVat" = "deliveryFee"
WHERE "deliveryFee" IS NOT NULL
  AND "deliveryFeeExVat" IS NULL
  AND "deliveryFeeIncVat" IS NULL;

ALTER TABLE "sales_orders"
  ALTER COLUMN "deliveryTaxTreatment" SET DEFAULT 'STANDARD',
  ADD CONSTRAINT "sales_orders_delivery_tax_rate_snapshot_check"
    CHECK ("deliveryTaxRateSnapshot" >= 0 AND "deliveryTaxRateSnapshot" <= 100),
  ADD CONSTRAINT "sales_orders_delivery_vat_amount_check"
    CHECK ("deliveryVatAmount" >= 0),
  ADD CONSTRAINT "sales_orders_delivery_vat_total_check"
    CHECK (
      ("deliveryFeeExVat" IS NULL AND "deliveryFeeIncVat" IS NULL AND "deliveryFee" IS NULL AND "deliveryVatAmount" = 0)
      OR
      ("deliveryFeeExVat" IS NOT NULL AND "deliveryFeeIncVat" IS NOT NULL AND "deliveryFee" IS NOT NULL
        AND "deliveryFeeIncVat" = "deliveryFeeExVat" + "deliveryVatAmount"
        AND "deliveryFeeIncVat" = "deliveryFee")
    );

-- One shared business identity profile. All fields are nullable so an upgrade
-- needs no fabricated shop data; invoice templates render explicit placeholders.
CREATE TABLE "business_settings" (
  "id" TEXT NOT NULL DEFAULT 'primary',
  "shopName" TEXT,
  "address" TEXT,
  "phone" TEXT,
  "taxNumber" TEXT,
  "logoUrl" TEXT,
  "email" TEXT,
  "updatedById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "business_settings_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "business_settings"
  ADD CONSTRAINT "business_settings_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
