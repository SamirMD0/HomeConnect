-- Additive VAT foundation. Existing documents are genuine non-VAT history:
-- their original totals remain unchanged and are snapshotted at a zero rate.
CREATE TABLE "tax_rates" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "ratePercent" DECIMAL(6,3) NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tax_rates_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tax_rates_rate_percent_check" CHECK ("ratePercent" >= 0 AND "ratePercent" <= 100),
    CONSTRAINT "tax_rates_effective_dates_check" CHECK ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom")
);

CREATE UNIQUE INDEX "tax_rates_code_key" ON "tax_rates"("code");
CREATE INDEX "tax_rates_isActive_effectiveFrom_effectiveTo_idx"
ON "tax_rates"("isActive", "effectiveFrom", "effectiveTo");

ALTER TABLE "tax_rates"
ADD CONSTRAINT "tax_rates_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "tax_profiles" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "taxRateId" UUID NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "tax_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tax_profiles_code_key" ON "tax_profiles"("code");
CREATE INDEX "tax_profiles_taxRateId_idx" ON "tax_profiles"("taxRateId");
CREATE INDEX "tax_profiles_isActive_isDefault_idx" ON "tax_profiles"("isActive", "isDefault");
CREATE UNIQUE INDEX "tax_profiles_one_active_default_key"
ON "tax_profiles"("isDefault") WHERE "isDefault" = true AND "isActive" = true;

ALTER TABLE "tax_profiles"
ADD CONSTRAINT "tax_profiles_taxRateId_fkey"
FOREIGN KEY ("taxRateId") REFERENCES "tax_rates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "products"
  ADD COLUMN "taxProfileId" UUID,
  ADD COLUMN "priceIncludesVat" BOOLEAN;
UPDATE "products" SET "priceIncludesVat" = false WHERE "priceIncludesVat" IS NULL;
ALTER TABLE "products"
  ALTER COLUMN "priceIncludesVat" SET NOT NULL,
  ALTER COLUMN "priceIncludesVat" SET DEFAULT false,
  ADD CONSTRAINT "products_taxProfileId_fkey"
    FOREIGN KEY ("taxProfileId") REFERENCES "tax_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "products_taxProfileId_idx" ON "products"("taxProfileId");

ALTER TABLE "sales_order_items"
  ADD COLUMN "taxRateSnapshot" DECIMAL(6,3),
  ADD COLUMN "taxCodeSnapshot" TEXT,
  ADD COLUMN "unitPriceExVat" DECIMAL(12,2),
  ADD COLUMN "vatAmount" DECIMAL(12,2),
  ADD COLUMN "lineTotalIncVat" DECIMAL(12,2);
UPDATE "sales_order_items" SET "taxRateSnapshot" = 0 WHERE "taxRateSnapshot" IS NULL;
UPDATE "sales_order_items" SET "unitPriceExVat" = "unitPrice" WHERE "unitPriceExVat" IS NULL;
UPDATE "sales_order_items" SET "vatAmount" = 0 WHERE "vatAmount" IS NULL;
UPDATE "sales_order_items" SET "lineTotalIncVat" = "lineTotal" WHERE "lineTotalIncVat" IS NULL;
ALTER TABLE "sales_order_items"
  ALTER COLUMN "taxRateSnapshot" SET NOT NULL,
  ALTER COLUMN "unitPriceExVat" SET NOT NULL,
  ALTER COLUMN "vatAmount" SET NOT NULL,
  ALTER COLUMN "lineTotalIncVat" SET NOT NULL,
  ADD CONSTRAINT "sales_order_items_tax_rate_snapshot_check" CHECK ("taxRateSnapshot" >= 0 AND "taxRateSnapshot" <= 100),
  ADD CONSTRAINT "sales_order_items_vat_amount_check" CHECK ("vatAmount" >= 0),
  ADD CONSTRAINT "sales_order_items_vat_total_check" CHECK ("lineTotalIncVat" = "lineTotal" + "vatAmount");

ALTER TABLE "supplier_purchase_lines"
  ADD COLUMN "taxRateSnapshot" DECIMAL(6,3),
  ADD COLUMN "taxCodeSnapshot" TEXT,
  ADD COLUMN "unitPriceExVat" DECIMAL(12,2),
  ADD COLUMN "vatAmount" DECIMAL(12,2),
  ADD COLUMN "lineTotalIncVat" DECIMAL(12,2);
UPDATE "supplier_purchase_lines" SET "taxRateSnapshot" = 0 WHERE "taxRateSnapshot" IS NULL;
UPDATE "supplier_purchase_lines" SET "unitPriceExVat" = COALESCE("unitPrice", "lineTotal") WHERE "unitPriceExVat" IS NULL;
UPDATE "supplier_purchase_lines" SET "vatAmount" = 0 WHERE "vatAmount" IS NULL;
UPDATE "supplier_purchase_lines" SET "lineTotalIncVat" = "lineTotal" WHERE "lineTotalIncVat" IS NULL;
ALTER TABLE "supplier_purchase_lines"
  ALTER COLUMN "taxRateSnapshot" SET NOT NULL,
  ALTER COLUMN "unitPriceExVat" SET NOT NULL,
  ALTER COLUMN "vatAmount" SET NOT NULL,
  ALTER COLUMN "lineTotalIncVat" SET NOT NULL,
  ADD CONSTRAINT "supplier_purchase_lines_tax_rate_snapshot_check" CHECK ("taxRateSnapshot" >= 0 AND "taxRateSnapshot" <= 100),
  ADD CONSTRAINT "supplier_purchase_lines_vat_amount_check" CHECK ("vatAmount" >= 0),
  ADD CONSTRAINT "supplier_purchase_lines_vat_total_check" CHECK ("lineTotalIncVat" = "lineTotal" + "vatAmount");
