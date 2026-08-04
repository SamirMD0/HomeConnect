-- HomeConnect v1.0.7 business-PC database upgrade.
--
-- Adds the Product and Maintenance & Service database foundation required by
-- HomeConnect v1.0.7.
--
-- Safety:
--   - Additive only: no DROP, TRUNCATE, DELETE, or business-data updates.
--   - Safe to run more than once. Existing objects are left unchanged.
--   - Does not require or query the Prisma _prisma_migrations table.
--   - Runs schema changes in one transaction.
--
-- Before running:
--   1. Create a PostgreSQL backup.
--   2. Close HomeConnect.
--   3. In pgAdmin, select the homeconnect database and open Query Tool.
--   4. Open this file and execute the complete script once.
--   5. Confirm every verification row at the bottom says OK.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.users') IS NULL THEN
    RAISE EXCEPTION 'Required table public.users is missing. Confirm that the homeconnect database is selected.';
  END IF;

  IF to_regclass('public.customers') IS NULL THEN
    RAISE EXCEPTION 'Required table public.customers is missing. Confirm that the homeconnect database is selected.';
  END IF;
END $$;

-- Enums ---------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'ServiceRequestType'
  ) THEN
    CREATE TYPE "ServiceRequestType" AS ENUM (
      'ON_CALL',
      'WORKSHOP_DROP_OFF',
      'PART_REPLACEMENT'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'ServiceJobStatus'
  ) THEN
    CREATE TYPE "ServiceJobStatus" AS ENUM (
      'RECEIVED',
      'INSPECTION_PENDING',
      'IN_WORKSHOP_REPAIR',
      'SENT_TO_COMPANY',
      'WAITING_FOR_PART',
      'WAITING_CUSTOMER_APPROVAL',
      'READY_FOR_PICKUP',
      'DELIVERED_TO_CUSTOMER',
      'CANCELLED',
      'NOT_REPAIRABLE'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'ServiceRoutingDecision'
  ) THEN
    CREATE TYPE "ServiceRoutingDecision" AS ENUM (
      'WORKSHOP',
      'COMPANY',
      'CUSTOMER_DECISION',
      'NOT_REPAIRABLE'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'WarrantyStatus'
  ) THEN
    CREATE TYPE "WarrantyStatus" AS ENUM (
      'UNDER_WARRANTY',
      'NO_WARRANTY',
      'UNKNOWN'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'ServiceAuditRecordType'
  ) THEN
    CREATE TYPE "ServiceAuditRecordType" AS ENUM ('PRODUCT', 'SERVICE_JOB');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'ServiceAuditAction'
  ) THEN
    CREATE TYPE "ServiceAuditAction" AS ENUM (
      'CREATE',
      'UPDATE_DETAILS',
      'CHANGE_STATUS',
      'CHANGE_ROUTING',
      'CHANGE_WARRANTY',
      'CHANGE_PRICE',
      'CHANGE_DATES',
      'CANCEL',
      'REOPEN',
      'ARCHIVE',
      'RESTORE'
    );
  END IF;
END $$;

-- Tables --------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "products" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "barcode" TEXT,
  "brand" TEXT,
  "price" DECIMAL(12,2),
  "discount" DECIMAL(12,2),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "createdById" UUID NOT NULL,
  "updatedById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "service_jobs" (
  "id" UUID NOT NULL,
  "jobNumber" TEXT NOT NULL,
  "customerId" UUID NOT NULL,
  "productId" UUID,
  "manualProductName" TEXT,
  "manualProductModel" TEXT,
  "manualProductBrand" TEXT,
  "manualProductNotes" TEXT,
  "requestType" "ServiceRequestType" NOT NULL,
  "issueDescription" TEXT NOT NULL,
  "requestedPartName" TEXT,
  "routingDecision" "ServiceRoutingDecision",
  "companyName" TEXT,
  "sentToCompanyDate" DATE,
  "receivedFromCompanyDate" DATE,
  "warrantyStatus" "WarrantyStatus" NOT NULL DEFAULT 'UNKNOWN',
  "warrantyNotes" TEXT,
  "warrantyProvider" TEXT,
  "warrantyExpiresAt" DATE,
  "estimatedPrice" DECIMAL(12,2),
  "finalPrice" DECIMAL(12,2),
  "priceNotes" TEXT,
  "serviceCreatedDate" DATE NOT NULL,
  "homeVisitScheduledDate" DATE,
  "returnedToCustomerDate" DATE,
  "status" "ServiceJobStatus" NOT NULL DEFAULT 'RECEIVED',
  "notes" TEXT,
  "createdById" UUID NOT NULL,
  "updatedById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "cancelledById" UUID,
  "cancelledReason" TEXT,
  CONSTRAINT "service_jobs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "service_audits" (
  "id" UUID NOT NULL,
  "recordType" "ServiceAuditRecordType" NOT NULL,
  "recordId" UUID NOT NULL,
  "serviceJobId" UUID,
  "action" "ServiceAuditAction" NOT NULL,
  "changedById" UUID NOT NULL,
  "changedByName" TEXT NOT NULL,
  "changedByUsername" TEXT NOT NULL,
  "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reason" TEXT NOT NULL,
  "beforeValues" JSONB NOT NULL,
  "afterValues" JSONB NOT NULL,
  "requestId" TEXT,
  "ipAddress" TEXT,
  CONSTRAINT "service_audits_pkey" PRIMARY KEY ("id")
);

-- Indexes -------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS "products_barcode_key" ON "products"("barcode");
CREATE INDEX IF NOT EXISTS "products_name_idx" ON "products"("name");
CREATE INDEX IF NOT EXISTS "products_model_idx" ON "products"("model");
CREATE INDEX IF NOT EXISTS "products_brand_idx" ON "products"("brand");
CREATE INDEX IF NOT EXISTS "products_isActive_idx" ON "products"("isActive");

CREATE UNIQUE INDEX IF NOT EXISTS "service_jobs_jobNumber_key" ON "service_jobs"("jobNumber");
CREATE INDEX IF NOT EXISTS "service_jobs_customerId_idx" ON "service_jobs"("customerId");
CREATE INDEX IF NOT EXISTS "service_jobs_productId_idx" ON "service_jobs"("productId");
CREATE INDEX IF NOT EXISTS "service_jobs_status_idx" ON "service_jobs"("status");
CREATE INDEX IF NOT EXISTS "service_jobs_customerId_status_idx" ON "service_jobs"("customerId", "status");
CREATE INDEX IF NOT EXISTS "service_jobs_serviceCreatedDate_idx" ON "service_jobs"("serviceCreatedDate");
CREATE INDEX IF NOT EXISTS "service_jobs_status_serviceCreatedDate_idx" ON "service_jobs"("status", "serviceCreatedDate");
CREATE INDEX IF NOT EXISTS "service_jobs_requestType_idx" ON "service_jobs"("requestType");

CREATE INDEX IF NOT EXISTS "service_audits_recordType_recordId_changedAt_idx"
  ON "service_audits"("recordType", "recordId", "changedAt");
CREATE INDEX IF NOT EXISTS "service_audits_serviceJobId_changedAt_idx"
  ON "service_audits"("serviceJobId", "changedAt");
CREATE INDEX IF NOT EXISTS "service_audits_changedAt_idx" ON "service_audits"("changedAt");

-- Foreign keys --------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_createdById_fkey') THEN
    ALTER TABLE "products" ADD CONSTRAINT "products_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_updatedById_fkey') THEN
    ALTER TABLE "products" ADD CONSTRAINT "products_updatedById_fkey"
      FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_jobs_customerId_fkey') THEN
    ALTER TABLE "service_jobs" ADD CONSTRAINT "service_jobs_customerId_fkey"
      FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_jobs_productId_fkey') THEN
    ALTER TABLE "service_jobs" ADD CONSTRAINT "service_jobs_productId_fkey"
      FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_jobs_createdById_fkey') THEN
    ALTER TABLE "service_jobs" ADD CONSTRAINT "service_jobs_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_jobs_updatedById_fkey') THEN
    ALTER TABLE "service_jobs" ADD CONSTRAINT "service_jobs_updatedById_fkey"
      FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_jobs_cancelledById_fkey') THEN
    ALTER TABLE "service_jobs" ADD CONSTRAINT "service_jobs_cancelledById_fkey"
      FOREIGN KEY ("cancelledById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_audits_serviceJobId_fkey') THEN
    ALTER TABLE "service_audits" ADD CONSTRAINT "service_audits_serviceJobId_fkey"
      FOREIGN KEY ("serviceJobId") REFERENCES "service_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_audits_changedById_fkey') THEN
    ALTER TABLE "service_audits" ADD CONSTRAINT "service_audits_changedById_fkey"
      FOREIGN KEY ("changedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

COMMIT;

-- Verification --------------------------------------------------------------
-- Expected result: every row says OK.

SELECT object_name,
       CASE WHEN is_present THEN 'OK' ELSE 'MISSING' END AS result
FROM (
  SELECT 'products table' AS object_name, to_regclass('public.products') IS NOT NULL AS is_present
  UNION ALL
  SELECT 'service_jobs table', to_regclass('public.service_jobs') IS NOT NULL
  UNION ALL
  SELECT 'service_audits table', to_regclass('public.service_audits') IS NOT NULL
  UNION ALL
  SELECT 'ServiceRequestType enum', to_regtype('public."ServiceRequestType"') IS NOT NULL
  UNION ALL
  SELECT 'ServiceJobStatus enum', to_regtype('public."ServiceJobStatus"') IS NOT NULL
  UNION ALL
  SELECT 'ServiceRoutingDecision enum', to_regtype('public."ServiceRoutingDecision"') IS NOT NULL
  UNION ALL
  SELECT 'WarrantyStatus enum', to_regtype('public."WarrantyStatus"') IS NOT NULL
  UNION ALL
  SELECT 'ServiceAuditRecordType enum', to_regtype('public."ServiceAuditRecordType"') IS NOT NULL
  UNION ALL
  SELECT 'ServiceAuditAction enum', to_regtype('public."ServiceAuditAction"') IS NOT NULL
  UNION ALL
  SELECT 'product creator foreign key', EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_createdById_fkey'
  )
  UNION ALL
  SELECT 'service customer foreign key', EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'service_jobs_customerId_fkey'
  )
  UNION ALL
  SELECT 'service audit foreign key', EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'service_audits_serviceJobId_fkey'
  )
) checks
ORDER BY object_name;
