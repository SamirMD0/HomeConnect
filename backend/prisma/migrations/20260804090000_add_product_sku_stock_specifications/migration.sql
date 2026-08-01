CREATE SEQUENCE IF NOT EXISTS "product_sku_seq" START WITH 1 INCREMENT BY 1;

CREATE TYPE "LabelBarcodeSource" AS ENUM ('SKU', 'MANUFACTURER');

ALTER TYPE "ServiceAuditAction" ADD VALUE IF NOT EXISTS 'CHANGE_SKU';
ALTER TYPE "ServiceAuditAction" ADD VALUE IF NOT EXISTS 'REGENERATE_SKU';
ALTER TYPE "ServiceAuditAction" ADD VALUE IF NOT EXISTS 'CHANGE_STOCK';
ALTER TYPE "ServiceAuditAction" ADD VALUE IF NOT EXISTS 'CHANGE_SPECIFICATIONS';

ALTER TABLE "products"
  ADD COLUMN "sku" TEXT,
  ADD COLUMN "labelBarcodeSource" "LabelBarcodeSource" NOT NULL DEFAULT 'SKU',
  ADD COLUMN "trackStock" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "stockQuantity" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lowStockThreshold" INTEGER,
  ADD COLUMN "specifications" JSONB,
  ADD COLUMN "specificationNotes" TEXT;

WITH numbered AS (
  SELECT "id", row_number() OVER (ORDER BY "createdAt", "id") AS sequence_number
  FROM "products"
)
UPDATE "products" AS product
SET "sku" = 'HC-' || lpad(numbered.sequence_number::text, 6, '0')
FROM numbered
WHERE product."id" = numbered."id";

SELECT setval(
  'product_sku_seq',
  GREATEST((SELECT count(*) FROM "products"), 1),
  (SELECT count(*) FROM "products") > 0
);

ALTER TABLE "products" ALTER COLUMN "sku" SET NOT NULL;
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");
CREATE INDEX "products_sku_idx" ON "products"("sku");

ALTER TABLE "products"
  ADD CONSTRAINT "products_stockQuantity_check" CHECK ("stockQuantity" >= 0),
  ADD CONSTRAINT "products_lowStockThreshold_check" CHECK ("lowStockThreshold" IS NULL OR "lowStockThreshold" >= 0);
