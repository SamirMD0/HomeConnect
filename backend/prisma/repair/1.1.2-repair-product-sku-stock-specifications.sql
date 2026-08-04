-- HomeConnect product SKU, label, stock, and specification repair.
-- Safe to run more than once against the HomeConnect database.

CREATE SEQUENCE IF NOT EXISTS "product_sku_seq" START WITH 1 INCREMENT BY 1;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LabelBarcodeSource') THEN
    CREATE TYPE "LabelBarcodeSource" AS ENUM ('SKU', 'MANUFACTURER');
  END IF;
END $$;

ALTER TYPE "ServiceAuditAction" ADD VALUE IF NOT EXISTS 'CHANGE_SKU';
ALTER TYPE "ServiceAuditAction" ADD VALUE IF NOT EXISTS 'REGENERATE_SKU';
ALTER TYPE "ServiceAuditAction" ADD VALUE IF NOT EXISTS 'CHANGE_STOCK';
ALTER TYPE "ServiceAuditAction" ADD VALUE IF NOT EXISTS 'CHANGE_SPECIFICATIONS';

ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "sku" TEXT;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "labelBarcodeSource" "LabelBarcodeSource" NOT NULL DEFAULT 'SKU';
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "trackStock" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "stockQuantity" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "lowStockThreshold" INTEGER;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "specifications" JSONB;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "specificationNotes" TEXT;

WITH missing AS (
  SELECT "id", row_number() OVER (ORDER BY "createdAt", "id") AS row_number
  FROM "products"
  WHERE "sku" IS NULL
), current_max AS (
  SELECT COALESCE(MAX(NULLIF(regexp_replace("sku", '[^0-9]', '', 'g'), '')::bigint), 0) AS value
  FROM "products"
)
UPDATE "products" AS product
SET "sku" = 'HC-' || lpad((current_max.value + missing.row_number)::text, 6, '0')
FROM missing, current_max
WHERE product."id" = missing."id";

SELECT setval(
  'product_sku_seq',
  GREATEST((SELECT COALESCE(MAX(NULLIF(regexp_replace("sku", '[^0-9]', '', 'g'), '')::bigint), 0) FROM "products"), 1),
  true
);

ALTER TABLE "products" ALTER COLUMN "sku" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "products_sku_key" ON "products"("sku");
CREATE INDEX IF NOT EXISTS "products_sku_idx" ON "products"("sku");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_stockQuantity_check') THEN
    ALTER TABLE "products" ADD CONSTRAINT "products_stockQuantity_check" CHECK ("stockQuantity" >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_lowStockThreshold_check') THEN
    ALTER TABLE "products" ADD CONSTRAINT "products_lowStockThreshold_check" CHECK ("lowStockThreshold" IS NULL OR "lowStockThreshold" >= 0);
  END IF;
END $$;
