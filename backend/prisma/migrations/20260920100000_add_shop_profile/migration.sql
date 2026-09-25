DO $$ BEGIN
  CREATE TYPE "CurrencyDisplayMode" AS ENUM ('SYMBOL', 'CODE', 'SYMBOL_AND_CODE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "PricingCardRolloutMode" AS ENUM ('LEGACY_ONLY', 'BOTH', 'PRICING_CARD_ONLY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TYPE "ServiceAuditRecordType" ADD VALUE IF NOT EXISTS 'SHOP_PROFILE';

CREATE TABLE IF NOT EXISTS "shop_profiles" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL DEFAULT 'Home Connect',
  "tagline" TEXT,
  "logoBytes" BYTEA,
  "logoMimeType" TEXT,
  "logoByteSize" INTEGER,
  "currencyCode" TEXT NOT NULL DEFAULT 'USD',
  "currencyDisplay" "CurrencyDisplayMode" NOT NULL DEFAULT 'SYMBOL',
  "defaultPricingCardTemplateId" UUID,
  "defaultCardValidityDays" INTEGER NOT NULL DEFAULT 30,
  "snapshotPrintedCards" BOOLEAN NOT NULL DEFAULT true,
  "pricingCardRolloutMode" "PricingCardRolloutMode" NOT NULL DEFAULT 'BOTH',
  "updatedById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "shop_profiles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "shop_profiles_currency_code_check" CHECK ("currencyCode" ~ '^[A-Z]{3}$'),
  CONSTRAINT "shop_profiles_validity_days_check" CHECK ("defaultCardValidityDays" BETWEEN 0 AND 3650),
  CONSTRAINT "shop_profiles_logo_size_check" CHECK ("logoByteSize" IS NULL OR "logoByteSize" BETWEEN 0 AND 524288)
);

DO $$ BEGIN
  ALTER TABLE "shop_profiles" ADD CONSTRAINT "shop_profiles_updatedById_fkey"
    FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

INSERT INTO "shop_profiles" (
  "id", "name", "currencyCode", "currencyDisplay", "defaultCardValidityDays",
  "snapshotPrintedCards", "pricingCardRolloutMode"
) VALUES (
  '4c2b1e9f-8c4b-4a2f-8a10-30c9a04c6d21', 'Home Connect', 'USD', 'SYMBOL', 30, true, 'BOTH'
) ON CONFLICT ("id") DO NOTHING;
