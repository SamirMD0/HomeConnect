ALTER TYPE "ServiceAuditRecordType" ADD VALUE IF NOT EXISTS 'PRICING_CARD_PRINT';

CREATE TABLE IF NOT EXISTS "pricing_card_prints" (
  "id" UUID NOT NULL,
  "productId" UUID NOT NULL,
  "templateId" UUID NOT NULL,
  "snapshot" JSONB NOT NULL,
  "validUntil" DATE,
  "currencyCode" TEXT NOT NULL,
  "publicPrice" DECIMAL(12,2) NOT NULL,
  "staffLabelCode" TEXT,
  "barcodeValue" TEXT NOT NULL,
  "copiesPrinted" INTEGER NOT NULL DEFAULT 1,
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "generatedById" UUID NOT NULL,
  "hiddenPricingPresetId" UUID,
  "encodingPresetId" UUID,
  CONSTRAINT "pricing_card_prints_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pricing_card_prints_currency_code_check" CHECK ("currencyCode" ~ '^[A-Z]{3}$'),
  CONSTRAINT "pricing_card_prints_public_price_check" CHECK ("publicPrice" >= 0),
  CONSTRAINT "pricing_card_prints_copies_check" CHECK ("copiesPrinted" BETWEEN 1 AND 1000),
  CONSTRAINT "pricing_card_prints_snapshot_size_check" CHECK (octet_length("snapshot"::text) <= 8192)
);

CREATE INDEX IF NOT EXISTS "pricing_card_prints_productId_generatedAt_idx" ON "pricing_card_prints"("productId", "generatedAt");
CREATE INDEX IF NOT EXISTS "pricing_card_prints_templateId_generatedAt_idx" ON "pricing_card_prints"("templateId", "generatedAt");
CREATE INDEX IF NOT EXISTS "pricing_card_prints_generatedAt_idx" ON "pricing_card_prints"("generatedAt");

DO $$ BEGIN ALTER TABLE "pricing_card_prints" ADD CONSTRAINT "pricing_card_prints_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "pricing_card_prints" ADD CONSTRAINT "pricing_card_prints_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "pricing_card_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "pricing_card_prints" ADD CONSTRAINT "pricing_card_prints_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
