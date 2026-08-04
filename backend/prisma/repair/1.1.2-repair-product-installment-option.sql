-- HomeConnect product installment-option repair
-- Safe to run more than once against the HomeConnect business database.
-- Existing products remain installment-enabled; products created afterward
-- are cash-only unless the application explicitly enables installments.

DO $$
BEGIN
  IF to_regclass('public.products') IS NULL THEN
    RAISE EXCEPTION 'HomeConnect products table was not found. Check the selected database.';
  END IF;
END $$;

ALTER TABLE "products"
ADD COLUMN IF NOT EXISTS "installmentEnabled" BOOLEAN;

UPDATE "products"
SET "installmentEnabled" = true
WHERE "installmentEnabled" IS NULL;

ALTER TABLE "products"
ALTER COLUMN "installmentEnabled" SET NOT NULL;

ALTER TABLE "products"
ALTER COLUMN "installmentEnabled" SET DEFAULT false;

SELECT
  COUNT(*) AS "existingProducts",
  COUNT(*) FILTER (WHERE "installmentEnabled") AS "installmentEnabledProducts",
  COUNT(*) FILTER (WHERE NOT "installmentEnabled") AS "cashOnlyProducts"
FROM "products";
