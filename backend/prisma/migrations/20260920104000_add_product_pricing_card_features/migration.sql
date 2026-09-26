CREATE TABLE IF NOT EXISTS "product_pricing_card_features" (
  "productId" UUID NOT NULL,
  "iconCode" TEXT NOT NULL,
  "label" TEXT,
  "value" TEXT,
  "position" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "product_pricing_card_features_pkey" PRIMARY KEY ("productId", "position"),
  CONSTRAINT "product_pricing_card_features_position_check" CHECK ("position" BETWEEN 1 AND 8),
  CONSTRAINT "product_pricing_card_features_icon_code_check" CHECK ("iconCode" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT "product_pricing_card_features_label_size_check" CHECK ("label" IS NULL OR char_length("label") BETWEEN 1 AND 100),
  CONSTRAINT "product_pricing_card_features_value_size_check" CHECK ("value" IS NULL OR char_length("value") BETWEEN 1 AND 120)
);

CREATE INDEX IF NOT EXISTS "product_pricing_card_features_productId_idx" ON "product_pricing_card_features"("productId");

DO $$ BEGIN ALTER TABLE "product_pricing_card_features" ADD CONSTRAINT "product_pricing_card_features_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
