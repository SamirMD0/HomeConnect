-- Retail shelf/display prices are final customer-payable amounts by default.
--
-- The earlier VAT-foundation migration deliberately preserved historical
-- invoice and purchase lines as zero-VAT snapshots. This migration touches
-- products only: no historical line, VAT snapshot, or monetary total is
-- recalculated.
UPDATE "products"
SET "priceIncludesVat" = true
WHERE "priceIncludesVat" = false;

ALTER TABLE "products"
  ALTER COLUMN "priceIncludesVat" SET DEFAULT true;
