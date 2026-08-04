-- HomeConnect v1.0.8 prepaid-purchase delivery schema repair.
--
-- Adds the prepaid delivery tracking introduced in v1.0.8: the
-- "prepaid_purchases" companion table, the PrepaidPurchaseStatus type, and the
-- correction-audit enum values used by the deliver / revert-delivery actions.
-- Every existing prepaid debt is given a companion row marked PENDING.
--
-- OPTIONAL / EMERGENCY-ONLY: use only when the normal Prisma migration
-- (20260731090000_add_prepaid_purchase_delivery) was not applied correctly.
--
-- Safety:
--   - No DROP, TRUNCATE, DELETE, or financial amount changes.
--   - Existing debts, payments, and payment allocations are never modified.
--   - Safe to run more than once.
--   - Does not require or query the Prisma _prisma_migrations table.
--
-- Requires PostgreSQL 12 or newer (ALTER TYPE ... ADD VALUE).
--
-- Before running:
--   1. Create a PostgreSQL backup.
--   2. Close HomeConnect.
--   3. In pgAdmin, select the homeconnect database and open Query Tool.
--   4. Open this file and execute the complete script.
--   5. Confirm every verification row at the bottom says OK.
--
-- Note on backfilled records:
--   Delivery was never recorded before v1.0.8, so every existing prepaid record
--   is backfilled as PENDING (awaiting delivery). Any item already handed to the
--   customer must be marked delivered once from the Prepaid Purchases screen.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- 1. Types. Run outside a transaction: ALTER TYPE ... ADD VALUE may not be used
--    inside a transaction block on older PostgreSQL versions.
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE "PrepaidPurchaseStatus" AS ENUM ('PENDING','DELIVERED','CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TYPE "FinancialCorrectionRecordType" ADD VALUE IF NOT EXISTS 'PREPAID_PURCHASE';
ALTER TYPE "FinancialCorrectionAction" ADD VALUE IF NOT EXISTS 'DELIVER_PREPAID';
ALTER TYPE "FinancialCorrectionAction" ADD VALUE IF NOT EXISTS 'REVERT_PREPAID_DELIVERY';
ALTER TYPE "FinancialCorrectionSourceScreen" ADD VALUE IF NOT EXISTS 'PREPAID';

-- ---------------------------------------------------------------------------
-- 2. Table, indexes, foreign keys, and backfill.
-- ---------------------------------------------------------------------------

BEGIN;

CREATE TABLE IF NOT EXISTS "prepaid_purchases" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "debtId" UUID NOT NULL,
  "status" "PrepaidPurchaseStatus" NOT NULL DEFAULT 'PENDING',
  "deliveredAt" DATE,
  "deliveredById" UUID,
  "deliveryNotes" TEXT,
  "remainderDebtId" UUID,
  "productId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "prepaid_purchases_debtId_key" ON "prepaid_purchases"("debtId");
CREATE UNIQUE INDEX IF NOT EXISTS "prepaid_purchases_remainderDebtId_key" ON "prepaid_purchases"("remainderDebtId");
CREATE INDEX IF NOT EXISTS "prepaid_purchases_status_idx" ON "prepaid_purchases"("status");
CREATE INDEX IF NOT EXISTS "prepaid_purchases_deliveredAt_idx" ON "prepaid_purchases"("deliveredAt");
CREATE INDEX IF NOT EXISTS "prepaid_purchases_productId_idx" ON "prepaid_purchases"("productId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='prepaid_purchases_debtId_fkey') THEN
    ALTER TABLE "prepaid_purchases" ADD CONSTRAINT "prepaid_purchases_debtId_fkey"
      FOREIGN KEY ("debtId") REFERENCES "debts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='prepaid_purchases_deliveredById_fkey') THEN
    ALTER TABLE "prepaid_purchases" ADD CONSTRAINT "prepaid_purchases_deliveredById_fkey"
      FOREIGN KEY ("deliveredById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='prepaid_purchases_remainderDebtId_fkey') THEN
    ALTER TABLE "prepaid_purchases" ADD CONSTRAINT "prepaid_purchases_remainderDebtId_fkey"
      FOREIGN KEY ("remainderDebtId") REFERENCES "debts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='prepaid_purchases_productId_fkey') THEN
    ALTER TABLE "prepaid_purchases" ADD CONSTRAINT "prepaid_purchases_productId_fkey"
      FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- Backfill: one companion row per prepaid debt. Re-running inserts nothing new.
INSERT INTO "prepaid_purchases" ("id", "debtId", "status", "createdAt", "updatedAt")
SELECT
  gen_random_uuid(),
  d."id",
  CASE
    WHEN d."status" = 'CANCELLED' THEN 'CANCELLED'::"PrepaidPurchaseStatus"
    ELSE 'PENDING'::"PrepaidPurchaseStatus"
  END,
  d."createdAt",
  CURRENT_TIMESTAMP
FROM "debts" d
WHERE d."kind" = 'PREPAID_PURCHASE'
  AND NOT EXISTS (
    SELECT 1 FROM "prepaid_purchases" p WHERE p."debtId" = d."id"
  );

COMMIT;

-- ---------------------------------------------------------------------------
-- 3. Verification. Every row must report OK.
-- ---------------------------------------------------------------------------

SELECT object_name, CASE WHEN ok THEN 'OK' ELSE 'FAIL' END AS result
FROM (
  SELECT 'PrepaidPurchaseStatus type' AS object_name,
         EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PrepaidPurchaseStatus') AS ok
  UNION ALL
  SELECT 'prepaid_purchases table',
         to_regclass('public.prepaid_purchases') IS NOT NULL
  UNION ALL
  -- Identifiers are quoted: to_regclass folds unquoted names to lower case,
  -- which would never match the mixed-case index names Prisma creates.
  SELECT 'prepaid_purchases debtId unique',
         to_regclass('public."prepaid_purchases_debtId_key"') IS NOT NULL
  UNION ALL
  SELECT 'prepaid_purchases remainderDebtId unique',
         to_regclass('public."prepaid_purchases_remainderDebtId_key"') IS NOT NULL
  UNION ALL
  SELECT 'prepaid_purchases status index',
         to_regclass('public."prepaid_purchases_status_idx"') IS NOT NULL
  UNION ALL
  SELECT 'prepaid_purchases deliveredAt index',
         to_regclass('public."prepaid_purchases_deliveredAt_idx"') IS NOT NULL
  UNION ALL
  SELECT 'prepaid_purchases productId index',
         to_regclass('public."prepaid_purchases_productId_idx"') IS NOT NULL
  UNION ALL
  SELECT 'prepaid_purchases foreign keys',
         (SELECT count(*) FROM pg_constraint
           WHERE conname IN ('prepaid_purchases_debtId_fkey',
                             'prepaid_purchases_deliveredById_fkey',
                             'prepaid_purchases_remainderDebtId_fkey',
                             'prepaid_purchases_productId_fkey')) = 4
  UNION ALL
  SELECT 'correction record type value',
         EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
                  WHERE t.typname = 'FinancialCorrectionRecordType'
                    AND e.enumlabel = 'PREPAID_PURCHASE')
  UNION ALL
  SELECT 'correction action values',
         (SELECT count(*) FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
           WHERE t.typname = 'FinancialCorrectionAction'
             AND e.enumlabel IN ('DELIVER_PREPAID','REVERT_PREPAID_DELIVERY')) = 2
  UNION ALL
  SELECT 'correction source screen value',
         EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
                  WHERE t.typname = 'FinancialCorrectionSourceScreen'
                    AND e.enumlabel = 'PREPAID')
  UNION ALL
  SELECT 'every prepaid debt has a companion row',
         NOT EXISTS (
           SELECT 1 FROM "debts" d
           WHERE d."kind" = 'PREPAID_PURCHASE'
             AND NOT EXISTS (SELECT 1 FROM "prepaid_purchases" p WHERE p."debtId" = d."id")
         )
  UNION ALL
  SELECT 'no orphan companion rows',
         NOT EXISTS (
           SELECT 1 FROM "prepaid_purchases" p
           LEFT JOIN "debts" d ON d."id" = p."debtId"
           WHERE d."id" IS NULL
         )
) checks
ORDER BY object_name;

-- Records needing attention: anything already handed to the customer before the
-- upgrade will appear here as PENDING and should be marked delivered once.
SELECT p."id" AS prepaid_id, c."name" AS customer, d."description" AS item,
       d."originalAmount" AS full_price, p."status"
FROM "prepaid_purchases" p
JOIN "debts" d ON d."id" = p."debtId"
JOIN "customers" c ON c."id" = d."customerId"
WHERE p."status" = 'PENDING'
ORDER BY d."createdAt";
