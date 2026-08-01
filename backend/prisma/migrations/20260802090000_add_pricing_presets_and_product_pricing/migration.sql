-- CreateEnum
CREATE TYPE "PricingCalculationMode" AS ENUM ('COMPOUND', 'SIMPLE');

-- CreateEnum
CREATE TYPE "PricingRoundingMode" AS ENUM ('NONE', 'NEAREST_0_50', 'NEAREST_1', 'CEIL_1');

-- ExtendEnum
ALTER TYPE "ServiceAuditRecordType" ADD VALUE 'PRICING_PRESET';
ALTER TYPE "ServiceAuditAction" ADD VALUE 'SET_DEFAULT';

-- CreateTable
CREATE TABLE "pricing_presets" (
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

-- AlterTable
ALTER TABLE "products"
  ADD COLUMN "costPrice" DECIMAL(12,2),
  ADD COLUMN "pricingPresetId" UUID,
  ADD COLUMN "useCustomPricing" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "customExpensePercent" DECIMAL(6,3),
  ADD COLUMN "customProfitPercent" DECIMAL(6,3),
  ADD COLUMN "customDiscountBufferPercent" DECIMAL(6,3),
  ADD COLUMN "customInstallmentMarkupPercent" DECIMAL(6,3),
  ADD COLUMN "customDownPaymentPercent" DECIMAL(6,3),
  ADD COLUMN "customInstallmentMonths" INTEGER,
  ADD COLUMN "customCalculationMode" "PricingCalculationMode";

-- CreateIndex
CREATE INDEX "pricing_presets_name_idx" ON "pricing_presets"("name");
CREATE INDEX "pricing_presets_productType_idx" ON "pricing_presets"("productType");
CREATE INDEX "pricing_presets_isActive_idx" ON "pricing_presets"("isActive");
CREATE UNIQUE INDEX "pricing_presets_single_default"
  ON "pricing_presets" ("isDefault")
  WHERE "isDefault" = true AND "archivedAt" IS NULL;
CREATE INDEX "products_pricingPresetId_idx" ON "products"("pricingPresetId");

-- AddForeignKey
ALTER TABLE "pricing_presets" ADD CONSTRAINT "pricing_presets_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pricing_presets" ADD CONSTRAINT "pricing_presets_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_pricingPresetId_fkey" FOREIGN KEY ("pricingPresetId") REFERENCES "pricing_presets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
