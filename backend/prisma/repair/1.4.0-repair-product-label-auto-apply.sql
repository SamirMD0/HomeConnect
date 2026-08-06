-- HomeConnect business-PC repair (2 of 2): apply the AUTO label barcode source.
--
-- Makes AUTO the column default and flips products that were only on SKU
-- because that was the old default and which already carry a barcode. Products
-- with no barcode, and products deliberately set to MANUFACTURER, are left
-- alone.
--
-- Requires "product-label-auto-enum" to have been applied and committed first
-- (see that file for why). It is listed immediately before this one and repairs
-- run in manifest order. Applied on its own beforehand, this fails and rolls
-- back, changing nothing.
--
-- Safe to run more than once.

ALTER TABLE products ALTER COLUMN "labelBarcodeSource" SET DEFAULT 'AUTO';

UPDATE products
SET "labelBarcodeSource" = 'AUTO'
WHERE "labelBarcodeSource" = 'SKU' AND barcode IS NOT NULL;

SELECT count(*) AS "autoLabelDefault"
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'products'
  AND column_name = 'labelBarcodeSource'
  AND column_default LIKE '%AUTO%';
