-- Prefer the saved manufacturer barcode for new products and for existing
-- SKU-defaulted products that already have a barcode.
ALTER TABLE products ALTER COLUMN "labelBarcodeSource" SET DEFAULT 'AUTO';

UPDATE products
SET "labelBarcodeSource" = 'AUTO'
WHERE "labelBarcodeSource" = 'SKU' AND barcode IS NOT NULL;
