-- v2.0.1: shop-internal EAN-13 barcodes for products that have no manufacturer
-- barcode. Format: 200 + 9-digit sequence + EAN-13 check digit (GS1 in-store
-- range, never a real retail code). Stored in "products"."barcode" so scanning,
-- uniqueness and labels work unchanged. Mirrors product-internal-barcode.ts.
--
-- Idempotent: the sequence is created only if missing and only products whose
-- barcode is still NULL are filled, so re-running changes nothing. Existing
-- manufacturer barcodes are never touched.
CREATE SEQUENCE IF NOT EXISTS "product_internal_barcode_seq" START WITH 1 INCREMENT BY 1;

DO $$
DECLARE
  product_row RECORD;
  body TEXT;
  total INT;
  candidate TEXT;
BEGIN
  FOR product_row IN SELECT "id" FROM "products" WHERE "barcode" IS NULL ORDER BY "createdAt", "id" LOOP
    LOOP
      body := '200' || lpad(nextval('product_internal_barcode_seq')::text, 9, '0');
      total := 0;
      FOR digit_index IN 1..12 LOOP
        total := total + substr(body, digit_index, 1)::int * CASE WHEN digit_index % 2 = 1 THEN 1 ELSE 3 END;
      END LOOP;
      candidate := body || ((10 - total % 10) % 10)::text;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM "products" WHERE lower("barcode") = lower(candidate));
    END LOOP;
    UPDATE "products" SET "barcode" = candidate WHERE "id" = product_row."id" AND "barcode" IS NULL;
  END LOOP;
END $$;
