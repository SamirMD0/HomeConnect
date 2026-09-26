-- v2.0.1: allow several pricing presets to supply a staff-label price and
-- separate the display-only encoding rules from product/pricing identity.
-- Keep the old single-choice column/index in place for safe upgrade history;
-- the redesigned code no longer writes it. The new eligibility column is
-- additive, can hold many true values, and is seeded from the old choice.
ALTER TABLE "pricing_presets" ADD COLUMN IF NOT EXISTS "isLabelSecretAllowed" BOOLEAN;
UPDATE "pricing_presets" SET "isLabelSecretAllowed" = "isLabelSecret" WHERE "isLabelSecretAllowed" IS NULL;
ALTER TABLE "pricing_presets" ALTER COLUMN "isLabelSecretAllowed" SET DEFAULT false;
ALTER TABLE "pricing_presets" ALTER COLUMN "isLabelSecretAllowed" SET NOT NULL;

ALTER TYPE "ServiceAuditRecordType" ADD VALUE IF NOT EXISTS 'LABEL_SECRET_SETTINGS';

DO $$ BEGIN
  CREATE TYPE "LabelSecretEncodingMode" AS ENUM ('PRICE', 'DISCOUNT_PERCENTAGE', 'OFFSET_PRICE', 'DIGIT_MAP_PRICE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "label_secret_encoding_presets" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "mode" "LabelSecretEncodingMode" NOT NULL,
  "prefix" TEXT NOT NULL DEFAULT '',
  "suffix" TEXT NOT NULL DEFAULT '',
  "offset" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "digitMap" TEXT,
  "decimalPlaces" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdById" UUID,
  "updatedById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "label_secret_encoding_presets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "label_secret_settings" (
  "id" UUID NOT NULL,
  "defaultPricingPresetId" UUID,
  "defaultEncodingPresetId" UUID,
  "showCodeOnLabel" BOOLEAN NOT NULL DEFAULT true,
  "updatedById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "label_secret_settings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "label_secret_encoding_presets_name_idx" ON "label_secret_encoding_presets"("name");
CREATE INDEX IF NOT EXISTS "label_secret_encoding_presets_isActive_idx" ON "label_secret_encoding_presets"("isActive");

INSERT INTO "label_secret_encoding_presets" (
  "id", "name", "mode", "prefix", "suffix", "offset", "decimalPlaces", "isActive"
) VALUES (
  '6d66215e-8224-4c1c-9cd6-70c8c2ffde01', 'Legacy price code', 'PRICE', 'K', 'Z', 0, 0, true
) ON CONFLICT ("id") DO NOTHING;

INSERT INTO "label_secret_settings" (
  "id", "defaultPricingPresetId", "defaultEncodingPresetId", "showCodeOnLabel"
)
SELECT
  '6d66215e-8224-4c1c-9cd6-70c8c2ffde00',
  (SELECT "id" FROM "pricing_presets" WHERE "isLabelSecretAllowed" = true AND "isActive" = true AND "archivedAt" IS NULL ORDER BY "updatedAt" DESC LIMIT 1),
  '6d66215e-8224-4c1c-9cd6-70c8c2ffde01',
  true
ON CONFLICT ("id") DO NOTHING;

DO $$ BEGIN
  ALTER TABLE "label_secret_encoding_presets" ADD CONSTRAINT "label_secret_encoding_presets_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "label_secret_encoding_presets" ADD CONSTRAINT "label_secret_encoding_presets_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "label_secret_settings" ADD CONSTRAINT "label_secret_settings_defaultPricingPresetId_fkey" FOREIGN KEY ("defaultPricingPresetId") REFERENCES "pricing_presets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "label_secret_settings" ADD CONSTRAINT "label_secret_settings_defaultEncodingPresetId_fkey" FOREIGN KEY ("defaultEncodingPresetId") REFERENCES "label_secret_encoding_presets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "label_secret_settings" ADD CONSTRAINT "label_secret_settings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
