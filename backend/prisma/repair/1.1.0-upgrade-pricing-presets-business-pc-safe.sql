-- HomeConnect v1.1.0 pricing presets additive repair script.
-- Back up the homeconnect database and close HomeConnect before execution.
-- This script creates missing structures only. It does not delete or rewrite product rows.

DO $$ BEGIN
  CREATE TYPE "PricingCalculationMode" AS ENUM ('COMPOUND', 'SIMPLE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "PricingRoundingMode" AS ENUM ('NONE', 'NEAREST_0_50', 'NEAREST_1', 'CEIL_1');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE "ServiceAuditRecordType" ADD VALUE IF NOT EXISTS 'PRICING_PRESET';
EXCEPTION WHEN undefined_object THEN
  RAISE EXCEPTION 'ServiceAuditRecordType is missing. Apply the v1.0.7 service/product upgrade first.';
END $$;

DO $$ BEGIN
  ALTER TYPE "ServiceAuditAction" ADD VALUE IF NOT EXISTS 'SET_DEFAULT';
EXCEPTION WHEN undefined_object THEN
  RAISE EXCEPTION 'ServiceAuditAction is missing. Apply the v1.0.7 service/product upgrade first.';
END $$;

CREATE TABLE IF NOT EXISTS "pricing_presets" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "productType" TEXT,
  "expensePercent" DECIMAL(6,3) NOT NULL,
  "profitPercent" DECIMAL(6,3) NOT NULL,
  "discountBufferPercent" DECIMAL(6,3) NOT NULL,
  "installmentMarkupPercent" DECIMAL(6,3) NOT NULL,
  "downPaymentPercent" DECIMAL(6,3) NOT NULL,
  "defaultInstallmentMonths" INTEGER NOT NULL,
  "calculationMode" "PricingCalculationMode" NOT NULL DEFAULT 'COMPOUND',
  "roundingMode" "PricingRoundingMode" NOT NULL DEFAULT 'NONE',
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "archivedAt" TIMESTAMP(3),
  "archivedReason" TEXT,
  "createdById" UUID NOT NULL,
  "updatedById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "pricing_presets_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "costPrice" DECIMAL(12,2);
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "pricingPresetId" UUID;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "useCustomPricing" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "customExpensePercent" DECIMAL(6,3);
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "customProfitPercent" DECIMAL(6,3);
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "customDiscountBufferPercent" DECIMAL(6,3);
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "customInstallmentMarkupPercent" DECIMAL(6,3);
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "customDownPaymentPercent" DECIMAL(6,3);
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "customInstallmentMonths" INTEGER;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "customCalculationMode" "PricingCalculationMode";

CREATE INDEX IF NOT EXISTS "pricing_presets_name_idx" ON "pricing_presets"("name");
CREATE INDEX IF NOT EXISTS "pricing_presets_productType_idx" ON "pricing_presets"("productType");
CREATE INDEX IF NOT EXISTS "pricing_presets_isActive_idx" ON "pricing_presets"("isActive");
CREATE UNIQUE INDEX IF NOT EXISTS "pricing_presets_single_default" ON "pricing_presets"("isDefault") WHERE "isDefault" = true AND "archivedAt" IS NULL;
CREATE INDEX IF NOT EXISTS "products_pricingPresetId_idx" ON "products"("pricingPresetId");

DO $$ BEGIN
  ALTER TABLE "pricing_presets" ADD CONSTRAINT "pricing_presets_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "pricing_presets" ADD CONSTRAINT "pricing_presets_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "products" ADD CONSTRAINT "products_pricingPresetId_fkey" FOREIGN KEY ("pricingPresetId") REFERENCES "pricing_presets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

SELECT to_regclass('public.pricing_presets') AS pricing_presets,
       to_regclass('public.pricing_presets_single_default') AS single_default_index,
       to_regclass('public.products_pricingPresetId_idx') AS product_preset_index;
