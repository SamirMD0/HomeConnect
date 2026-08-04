-- HomeConnect v1.1.2 business-PC compatibility repair.
--
-- Before running:
--   1. Create a current PostgreSQL backup.
--   2. Close HomeConnect.
--   3. Open pgAdmin Query Tool on the homeconnect database.
--   4. Execute this complete file once.
--
-- Safe behavior:
--   - creates missing structures only;
--   - does not delete, truncate, or update business rows;
--   - is safe to run more than once;
--   - does not require or modify the _prisma_migrations table.
--
-- v1.1.2 itself has no new database schema. This repair keeps a business PC
-- compatible with the pricing-preset and product-image structures introduced
-- by the preceding releases.

-- ---------------------------------------------------------------------------
-- Prerequisites
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.users') IS NULL THEN
    RAISE EXCEPTION 'users table is missing. Apply the base HomeConnect database setup first.';
  END IF;

  IF to_regclass('public.products') IS NULL THEN
    RAISE EXCEPTION 'products table is missing. Apply the v1.0.7 service/product upgrade first.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Pricing presets
-- ---------------------------------------------------------------------------

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
CREATE UNIQUE INDEX IF NOT EXISTS "pricing_presets_single_default"
  ON "pricing_presets"("isDefault")
  WHERE "isDefault" = true AND "archivedAt" IS NULL;
CREATE INDEX IF NOT EXISTS "products_pricingPresetId_idx" ON "products"("pricingPresetId");

DO $$ BEGIN
  ALTER TABLE "pricing_presets"
    ADD CONSTRAINT "pricing_presets_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "pricing_presets"
    ADD CONSTRAINT "pricing_presets_updatedById_fkey"
    FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "products"
    ADD CONSTRAINT "products_pricingPresetId_fkey"
    FOREIGN KEY ("pricingPresetId") REFERENCES "pricing_presets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- Product images
-- ---------------------------------------------------------------------------

ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;

CREATE TABLE IF NOT EXISTS "product_images" (
  "productId" UUID NOT NULL,
  "data" BYTEA NOT NULL,
  "mimeType" TEXT NOT NULL,
  "byteSize" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "product_images_pkey" PRIMARY KEY ("productId")
);

DO $$ BEGIN
  ALTER TABLE "product_images"
    ADD CONSTRAINT "product_images_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- Verification
-- Expected: all *_ready values are true and each *_count value is 1.
-- ---------------------------------------------------------------------------

SELECT
  to_regclass('public.products') IS NOT NULL AS products_ready,
  to_regclass('public.pricing_presets') IS NOT NULL AS pricing_presets_ready,
  to_regclass('public.product_images') IS NOT NULL AS product_images_ready,
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'pricingPresetId') AS pricing_column_count,
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'imageUrl') AS image_url_column_count,
  (SELECT count(*) FROM information_schema.table_constraints
    WHERE constraint_schema = 'public' AND constraint_name = 'product_images_productId_fkey') AS image_fk_count;
