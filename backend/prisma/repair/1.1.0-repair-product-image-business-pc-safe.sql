-- HomeConnect v1.1.0 product image additive repair script.
-- Back up the homeconnect database and close HomeConnect before execution.
-- This script creates missing structures only. It does not delete or rewrite
-- product rows, and it never touches existing image data.
--
-- Safe to run more than once: every statement is guarded, so a second run on an
-- already-upgraded database succeeds and changes nothing.
--
-- Run this when the Products screen reports a missing column or table for the
-- product image feature, or when the v1.1.0 installer was applied to a business
-- PC whose database was never migrated.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- Section 0 — prerequisite
-- ============================================================================

DO $$ BEGIN
  IF to_regclass('public.products') IS NULL THEN
    RAISE EXCEPTION 'products table is missing. Apply the v1.0.7 service/product upgrade first.';
  END IF;
END $$;

-- ============================================================================
-- Section 1 — external image link on the product row
-- ============================================================================

ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;

-- ============================================================================
-- Section 2 — uploaded image bytes
-- Kept in its own table so product queries never load image payloads.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "product_images" (
  "productId" UUID NOT NULL,
  "data" BYTEA NOT NULL,
  "mimeType" TEXT NOT NULL,
  "byteSize" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "product_images_pkey" PRIMARY KEY ("productId")
);

DO $$ BEGIN
  ALTER TABLE "product_images" ADD CONSTRAINT "product_images_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- Section 3 — migration history
-- Defensive only. The packaged app does not run `prisma migrate deploy`, but a
-- machine that later gets the repo would otherwise try to re-apply this
-- migration and fail because the table already exists.
--
-- The preferred way to do this is the Prisma CLI, on a machine that has the repo:
--     npx prisma migrate resolve --applied 20260803090000_add_product_image --schema backend/prisma/schema.prisma
-- The block below does the same thing directly, for a machine that only has psql.
-- The checksum is the SHA-256 of
-- backend/prisma/migrations/20260803090000_add_product_image/migration.sql.
-- If Prisma later reports a checksum mismatch, re-run the CLI command above.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = '_prisma_migrations') THEN
    RAISE NOTICE 'No _prisma_migrations table; nothing to reconcile.';
    RETURN;
  END IF;

  -- Already recorded as applied: leave history untouched.
  IF EXISTS (
    SELECT 1 FROM "_prisma_migrations"
     WHERE migration_name = '20260803090000_add_product_image'
       AND finished_at IS NOT NULL
       AND rolled_back_at IS NULL
  ) THEN
    RAISE NOTICE 'Migration already recorded as applied; history unchanged.';
    RETURN;
  END IF;

  -- Retire any failed attempt so Prisma stops treating it as blocking.
  UPDATE "_prisma_migrations"
     SET rolled_back_at = now()
   WHERE migration_name = '20260803090000_add_product_image'
     AND finished_at IS NULL
     AND rolled_back_at IS NULL;

  INSERT INTO "_prisma_migrations" (
    id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count
  ) VALUES (
    gen_random_uuid()::text,
    '67cb92e0ae2ee9a543ccfd6dd15dbb6d52ff486f3ccc3dc5dd6d18a04f555936',
    now(),
    '20260803090000_add_product_image',
    'Applied manually by release/1.1.0/repair-v1.1.0-product-image-business-pc-safe.sql',
    NULL,
    now(),
    1
  );

  RAISE NOTICE 'Migration marked as applied.';
END $$;

-- ============================================================================
-- Section 4 — verification
-- Expected: product_images non-null, imageUrl_column = 1, fk_constraint = 1.
-- ============================================================================

SELECT
  to_regclass('public.product_images')::text AS product_images,
  (SELECT count(*) FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'imageUrl') AS "imageUrl_column",
  (SELECT count(*) FROM information_schema.table_constraints
    WHERE constraint_name = 'product_images_productId_fkey') AS fk_constraint,
  (SELECT count(*) FROM "product_images") AS stored_images;
