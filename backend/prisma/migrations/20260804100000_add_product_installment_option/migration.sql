-- Preserve the behavior of existing products, then make new products cash-only
-- unless installment pricing is explicitly enabled.
ALTER TABLE "products"
ADD COLUMN "installmentEnabled" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "products"
ALTER COLUMN "installmentEnabled" SET DEFAULT false;
