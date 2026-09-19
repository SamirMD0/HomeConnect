ALTER TYPE "ServiceAuditRecordType" ADD VALUE IF NOT EXISTS 'PRICING_CARD_TEMPLATE';
DO $$ BEGIN CREATE TYPE "PricingCardPaperMode" AS ENUM ('SINGLE_STICKER', 'SHEET'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "PricingCardPaperSize" AS ENUM ('A4', 'LETTER'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "pricing_card_templates" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "paperMode" "PricingCardPaperMode" NOT NULL,
  "paperSize" "PricingCardPaperSize",
  "cardWidthMm" DECIMAL(6,2) NOT NULL,
  "cardHeightMm" DECIMAL(6,2) NOT NULL,
  "configVersion" INTEGER NOT NULL DEFAULT 1,
  "config" JSONB NOT NULL,
  "featureMax" INTEGER NOT NULL DEFAULT 4,
  "specKeyOrder" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "defaultValidityDays" INTEGER,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "archivedAt" TIMESTAMP(3),
  "archivedReason" TEXT,
  "createdById" UUID,
  "updatedById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pricing_card_templates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pricing_card_templates_size_check" CHECK ("cardWidthMm" BETWEEN 20 AND 210 AND "cardHeightMm" BETWEEN 20 AND 210),
  CONSTRAINT "pricing_card_templates_feature_max_check" CHECK ("featureMax" BETWEEN 0 AND 8),
  CONSTRAINT "pricing_card_templates_config_size_check" CHECK (octet_length("config"::text) <= 16384)
);
CREATE UNIQUE INDEX IF NOT EXISTS "pricing_card_templates_name_key" ON "pricing_card_templates"("name");
CREATE INDEX IF NOT EXISTS "pricing_card_templates_isActive_idx" ON "pricing_card_templates"("isActive");
DO $$ BEGIN ALTER TABLE "pricing_card_templates" ADD CONSTRAINT "pricing_card_templates_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "pricing_card_templates" ADD CONSTRAINT "pricing_card_templates_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "shop_profiles" ADD CONSTRAINT "shop_profiles_defaultPricingCardTemplateId_fkey" FOREIGN KEY ("defaultPricingCardTemplateId") REFERENCES "pricing_card_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

INSERT INTO "pricing_card_templates" ("id","name","description","paperMode","paperSize","cardWidthMm","cardHeightMm","configVersion","config","featureMax","specKeyOrder","defaultValidityDays") VALUES
('20000000-0000-4000-8000-000000000001','TV Large Card','Large television pricing card','SINGLE_STICKER',NULL,148,105,1,$${"configVersion":1,"header":{"companyLogo":{"show":true,"sizeMm":18,"position":"left"},"brand":{"display":"logo+text","position":"right","sizeMm":16}},"body":{"title":{"show":true,"maxLines":2,"fontScale":1.25},"model":{"show":true,"prefix":"Model:"},"dimensions":{"show":true},"specs":{"show":true,"maxRows":4},"image":{"show":true,"columnWidthPct":34}},"features":{"show":true,"layout":"grid-3x2","showLabels":true,"showValues":true},"price":{"show":true,"fontScale":1.6,"weight":900,"emphasis":"boxed","validUntil":{"show":true,"format":"d-mon-y"}},"sku":{"show":true,"showSecretCode":true,"prefix":"SKU:"},"barcode":{"show":true,"showDigits":true,"targetWidthMm":62},"appearance":{"marginMm":5,"innerGapMm":3,"borderPx":1,"sectionDividers":true,"fontScale":1,"orientation":"landscape"}}$$::jsonb,6,ARRAY['screen_size','resolution','refresh_rate','dimensions'],30),
('20000000-0000-4000-8000-000000000002','Appliance Shelf Card','Shelf card for appliances','SINGLE_STICKER',NULL,120,80,1,$${"configVersion":1,"header":{"companyLogo":{"show":true,"sizeMm":14,"position":"left"},"brand":{"display":"logo+text","position":"right","sizeMm":12}},"body":{"title":{"show":true,"maxLines":2,"fontScale":1.1},"model":{"show":true,"prefix":"Model:"},"dimensions":{"show":true},"specs":{"show":true,"maxRows":5},"image":{"show":false,"columnWidthPct":0}},"features":{"show":true,"layout":"grid-2x3","showLabels":true,"showValues":true},"price":{"show":true,"fontScale":1.4,"weight":900,"emphasis":"underlined","validUntil":{"show":true,"format":"dmy"}},"sku":{"show":true,"showSecretCode":true,"prefix":"SKU:"},"barcode":{"show":true,"showDigits":true,"targetWidthMm":55},"appearance":{"marginMm":4,"innerGapMm":2,"borderPx":1,"sectionDividers":true,"fontScale":1,"orientation":"landscape"}}$$::jsonb,4,ARRAY['capacity_kg','capacity_l','spin_speed_rpm','energy_rating','dimensions'],30),
('20000000-0000-4000-8000-000000000003','Compact Legacy 58x40','Legacy compact sticker','SINGLE_STICKER',NULL,58,40,1,$${"configVersion":1,"header":{"companyLogo":{"show":false,"sizeMm":8,"position":"left"},"brand":{"display":"text","position":"left","sizeMm":8}},"body":{"title":{"show":true,"maxLines":2,"fontScale":1},"model":{"show":true,"prefix":"Model:"},"dimensions":{"show":false},"specs":{"show":false,"maxRows":0},"image":{"show":false,"columnWidthPct":0}},"features":{"show":false,"layout":"row","showLabels":false,"showValues":false},"price":{"show":true,"fontScale":1,"weight":800,"emphasis":"plain","validUntil":{"show":false,"format":"dmy"}},"sku":{"show":true,"showSecretCode":true,"prefix":"SKU:"},"barcode":{"show":true,"showDigits":true,"targetWidthMm":50},"appearance":{"marginMm":2,"innerGapMm":1,"borderPx":0,"sectionDividers":false,"fontScale":0.8,"orientation":"landscape"}}$$::jsonb,0,ARRAY[]::TEXT[],NULL),
('20000000-0000-4000-8000-000000000004','Legacy Large 72x50','Legacy large sticker','SINGLE_STICKER',NULL,72,50,1,$${"configVersion":1,"header":{"companyLogo":{"show":false,"sizeMm":8,"position":"left"},"brand":{"display":"text","position":"left","sizeMm":9}},"body":{"title":{"show":true,"maxLines":2,"fontScale":1},"model":{"show":true,"prefix":"Model:"},"dimensions":{"show":false},"specs":{"show":false,"maxRows":0},"image":{"show":false,"columnWidthPct":0}},"features":{"show":false,"layout":"row","showLabels":false,"showValues":false},"price":{"show":true,"fontScale":1.1,"weight":800,"emphasis":"plain","validUntil":{"show":false,"format":"dmy"}},"sku":{"show":true,"showSecretCode":true,"prefix":"SKU:"},"barcode":{"show":true,"showDigits":true,"targetWidthMm":62},"appearance":{"marginMm":3,"innerGapMm":1.5,"borderPx":0,"sectionDividers":false,"fontScale":0.9,"orientation":"landscape"}}$$::jsonb,0,ARRAY[]::TEXT[],NULL)
ON CONFLICT ("id") DO NOTHING;

UPDATE "shop_profiles"
SET "defaultPricingCardTemplateId" = '20000000-0000-4000-8000-000000000001'
WHERE "defaultPricingCardTemplateId" IS NULL;
