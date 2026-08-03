-- HomeConnect 1.2.0 business-PC repair: Sales Orders schema.
--
-- Fixes: PostgreSQL error "table public.sales_orders does not exist".
-- Covers Prisma migration: 20260804120000_add_sales_orders
--
-- Before running:
--   1. Close HomeConnect on the business PC.
--   2. Back up the homeconnect database.
--   3. Run with ON_ERROR_STOP enabled against the homeconnect database.
--
-- Example:
--   psql -h localhost -p 5433 -U postgres -d homeconnect \
--     -v ON_ERROR_STOP=1 -f 1.2.0-repair.sql
--
-- This script is additive and idempotent. It creates missing Sales Orders
-- structures and records the covered Prisma migration. It does not delete,
-- truncate, update, or backfill business data.

BEGIN;

-- ---------------------------------------------------------------------------
-- Prerequisites
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.users') IS NULL THEN
    RAISE EXCEPTION 'users table is missing. Apply the base HomeConnect database setup first.';
  END IF;
  IF to_regclass('public.customers') IS NULL THEN
    RAISE EXCEPTION 'customers table is missing. Apply the base HomeConnect database setup first.';
  END IF;
  IF to_regclass('public.products') IS NULL THEN
    RAISE EXCEPTION 'products table is missing. Apply the service/product database upgrade first.';
  END IF;
  IF to_regclass('public.debts') IS NULL THEN
    RAISE EXCEPTION 'debts table is missing. Apply the financial-domain database upgrade first.';
  END IF;
  IF to_regclass('public.installment_plans') IS NULL THEN
    RAISE EXCEPTION 'installment_plans table is missing. Apply the financial-domain database upgrade first.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Sales Orders enums
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE "SalesChannel" AS ENUM ('SHOP_DIRECT', 'SHOP_DELIVERY', 'PHONE_ORDER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "SalesOrderFulfillmentStatus" AS ENUM (
    'DRAFT', 'CONFIRMED', 'PREPARING', 'READY_FOR_DELIVERY',
    'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'RETURNED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "SalesOrderPaymentStatus" AS ENUM ('UNPAID', 'PARTIALLY_PAID', 'PAID');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "SalesOrderSettlement" AS ENUM ('NONE', 'DEBT', 'INSTALLMENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "SalesAuditRecordType" AS ENUM ('SALES_ORDER', 'SALES_ORDER_ITEM');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "SalesAuditAction" AS ENUM (
    'CREATE', 'UPDATE_DETAILS', 'CHANGE_FULFILLMENT_STATUS', 'CHANGE_PAYMENT',
    'ADD_ITEM', 'UPDATE_ITEM', 'REMOVE_ITEM', 'LINK_DEBT',
    'LINK_INSTALLMENT_PLAN', 'UNLINK_FINANCIAL', 'CANCEL', 'RESTORE', 'RETURN'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "sales_orders" (
  "id" UUID NOT NULL,
  "orderNumber" TEXT NOT NULL,
  "customerId" UUID,
  "salesChannel" "SalesChannel" NOT NULL,
  "orderDate" DATE NOT NULL,
  "deliveryDate" DATE,
  "deliveredAt" DATE,
  "fulfillmentStatus" "SalesOrderFulfillmentStatus" NOT NULL DEFAULT 'DRAFT',
  "paymentStatus" "SalesOrderPaymentStatus" NOT NULL DEFAULT 'UNPAID',
  "settlement" "SalesOrderSettlement" NOT NULL DEFAULT 'NONE',
  "itemsSubtotal" DECIMAL(12,2) NOT NULL,
  "deliveryFee" DECIMAL(12,2),
  "totalAmount" DECIMAL(12,2) NOT NULL,
  "paidAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "remainingAmount" DECIMAL(12,2) NOT NULL,
  "deliveryAddressSnapshot" TEXT,
  "deliveryNotes" TEXT,
  "notes" TEXT,
  "debtId" UUID,
  "installmentPlanId" UUID,
  "createdById" UUID NOT NULL,
  "updatedById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "cancelledAt" TIMESTAMP(3),
  "cancelledById" UUID,
  "cancelledReason" TEXT,
  CONSTRAINT "sales_orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "sales_order_items" (
  "id" UUID NOT NULL,
  "salesOrderId" UUID NOT NULL,
  "productId" UUID,
  "manualProductName" TEXT,
  "manualProductModel" TEXT,
  "productNameSnapshot" TEXT NOT NULL,
  "productModelSnapshot" TEXT,
  "skuSnapshot" TEXT,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "unitPrice" DECIMAL(12,2) NOT NULL,
  "discountAmount" DECIMAL(12,2),
  "lineTotal" DECIMAL(12,2) NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sales_order_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "sales_audits" (
  "id" UUID NOT NULL,
  "recordType" "SalesAuditRecordType" NOT NULL,
  "recordId" UUID NOT NULL,
  "salesOrderId" UUID,
  "action" "SalesAuditAction" NOT NULL,
  "changedById" UUID NOT NULL,
  "changedByName" TEXT NOT NULL,
  "changedByUsername" TEXT NOT NULL,
  "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reason" TEXT NOT NULL,
  "beforeValues" JSONB NOT NULL,
  "afterValues" JSONB NOT NULL,
  "requestId" TEXT,
  "ipAddress" TEXT,
  CONSTRAINT "sales_audits_pkey" PRIMARY KEY ("id")
);

-- A customer is optional only for an admin-recorded, fully-paid sale. The
-- application enforces that rule; dropping this constraint lets those cash
-- sales persist without a fabricated walk-in customer record.
ALTER TABLE "sales_orders" ALTER COLUMN "customerId" DROP NOT NULL;

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS "sales_orders_orderNumber_key" ON "sales_orders"("orderNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "sales_orders_debtId_key" ON "sales_orders"("debtId");
CREATE UNIQUE INDEX IF NOT EXISTS "sales_orders_installmentPlanId_key" ON "sales_orders"("installmentPlanId");
CREATE INDEX IF NOT EXISTS "sales_orders_customerId_idx" ON "sales_orders"("customerId");
CREATE INDEX IF NOT EXISTS "sales_orders_orderDate_idx" ON "sales_orders"("orderDate");
CREATE INDEX IF NOT EXISTS "sales_orders_deliveryDate_idx" ON "sales_orders"("deliveryDate");
CREATE INDEX IF NOT EXISTS "sales_orders_fulfillmentStatus_idx" ON "sales_orders"("fulfillmentStatus");
CREATE INDEX IF NOT EXISTS "sales_orders_paymentStatus_idx" ON "sales_orders"("paymentStatus");
CREATE INDEX IF NOT EXISTS "sales_orders_salesChannel_idx" ON "sales_orders"("salesChannel");
CREATE INDEX IF NOT EXISTS "sales_orders_settlement_idx" ON "sales_orders"("settlement");
CREATE INDEX IF NOT EXISTS "sales_orders_fulfillmentStatus_orderDate_idx" ON "sales_orders"("fulfillmentStatus", "orderDate");
CREATE INDEX IF NOT EXISTS "sales_orders_customerId_fulfillmentStatus_idx" ON "sales_orders"("customerId", "fulfillmentStatus");
CREATE INDEX IF NOT EXISTS "sales_order_items_salesOrderId_idx" ON "sales_order_items"("salesOrderId");
CREATE INDEX IF NOT EXISTS "sales_order_items_productId_idx" ON "sales_order_items"("productId");
CREATE INDEX IF NOT EXISTS "sales_audits_recordType_recordId_changedAt_idx" ON "sales_audits"("recordType", "recordId", "changedAt");
CREATE INDEX IF NOT EXISTS "sales_audits_salesOrderId_changedAt_idx" ON "sales_audits"("salesOrderId", "changedAt");
CREATE INDEX IF NOT EXISTS "sales_audits_changedAt_idx" ON "sales_audits"("changedAt");

-- ---------------------------------------------------------------------------
-- Foreign keys
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_debtId_fkey"
    FOREIGN KEY ("debtId") REFERENCES "debts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_installmentPlanId_fkey"
    FOREIGN KEY ("installmentPlanId") REFERENCES "installment_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_updatedById_fkey"
    FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_cancelledById_fkey"
    FOREIGN KEY ("cancelledById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_salesOrderId_fkey"
    FOREIGN KEY ("salesOrderId") REFERENCES "sales_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "sales_audits" ADD CONSTRAINT "sales_audits_salesOrderId_fkey"
    FOREIGN KEY ("salesOrderId") REFERENCES "sales_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "sales_audits" ADD CONSTRAINT "sales_audits_changedById_fkey"
    FOREIGN KEY ("changedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- Prisma migration history
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
  "id" VARCHAR(36) NOT NULL,
  "checksum" VARCHAR(64) NOT NULL,
  "finished_at" TIMESTAMPTZ,
  "migration_name" VARCHAR(255) NOT NULL,
  "logs" TEXT,
  "rolled_back_at" TIMESTAMPTZ,
  "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "applied_steps_count" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "_prisma_migrations_pkey" PRIMARY KEY ("id")
);

UPDATE "_prisma_migrations"
SET "rolled_back_at" = now()
WHERE "migration_name" = '20260804120000_add_sales_orders'
  AND "finished_at" IS NULL
  AND "rolled_back_at" IS NULL;

-- The customer-optional adjustment changed this not-yet-released migration's
-- checksum. Reconcile any successful row written by an earlier copy of this
-- repair file so future Prisma checks see the final migration content.
UPDATE "_prisma_migrations"
SET "checksum" = 'ce81c636caef439fab7bfc9b0ec79c3ac58f0a4ee70ca0fea2c0b930e66c289f'
WHERE "migration_name" = '20260804120000_add_sales_orders'
  AND "finished_at" IS NOT NULL
  AND "rolled_back_at" IS NULL
  AND "checksum" <> 'ce81c636caef439fab7bfc9b0ec79c3ac58f0a4ee70ca0fea2c0b930e66c289f';

INSERT INTO "_prisma_migrations" (
  "id", "checksum", "finished_at", "migration_name", "logs",
  "rolled_back_at", "started_at", "applied_steps_count"
)
SELECT
  'manual-20260804120000-sales-orders',
  'ce81c636caef439fab7bfc9b0ec79c3ac58f0a4ee70ca0fea2c0b930e66c289f',
  now(),
  '20260804120000_add_sales_orders',
  'Applied manually by release/1.2.0/1.2.0-repair.sql',
  NULL,
  now(),
  1
WHERE NOT EXISTS (
  SELECT 1
  FROM "_prisma_migrations"
  WHERE "migration_name" = '20260804120000_add_sales_orders'
    AND "finished_at" IS NOT NULL
    AND "rolled_back_at" IS NULL
)
ON CONFLICT DO NOTHING;

COMMIT;

-- ---------------------------------------------------------------------------
-- Verification
-- Expected: all three *_ready values are true, migration_rows is 1, and every
-- *_columns count matches the expected value shown in its alias.
-- ---------------------------------------------------------------------------

SELECT
  to_regclass('public.sales_orders') IS NOT NULL AS sales_orders_ready,
  to_regclass('public.sales_order_items') IS NOT NULL AS sales_order_items_ready,
  to_regclass('public.sales_audits') IS NOT NULL AS sales_audits_ready,
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sales_orders') AS sales_orders_columns_expected_27,
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sales_order_items') AS sales_order_items_columns_expected_15,
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sales_audits') AS sales_audits_columns_expected_14,
  (SELECT count(*) FROM "_prisma_migrations"
    WHERE "migration_name" = '20260804120000_add_sales_orders'
      AND "finished_at" IS NOT NULL
      AND "rolled_back_at" IS NULL) AS migration_rows_expected_1;
