-- HomeConnect v1.0.8 supplier ledger emergency schema repair.
-- OPTIONAL / EMERGENCY-ONLY: use only when the normal Prisma migration was not
-- applied correctly. Back up the database and close HomeConnect before running.
-- This script is additive and idempotent. It does not delete or reset data.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$ BEGIN CREATE TYPE "SupplierTransactionType" AS ENUM ('SUPPLIER_DEBT','SUPPLIER_PAYMENT','SUPPLIER_CREDIT','SUPPLIER_ADJUSTMENT'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "SupplierTransactionDirection" AS ENUM ('INCREASE_OWED','DECREASE_OWED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "SupplierTransactionStatus" AS ENUM ('ACTIVE','REMOVED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "SupplierAuditRecordType" AS ENUM ('SUPPLIER','SUPPLIER_TRANSACTION'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "SupplierAuditAction" AS ENUM ('CREATE','UPDATE','ARCHIVE','RESTORE','REMOVE','RESTORE_TRANSACTION','DELETE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "suppliers" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "name" TEXT NOT NULL, "phone" TEXT NOT NULL,
  "companyName" TEXT, "secondaryPhone" TEXT, "email" TEXT, "notes" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true, "archivedAt" TIMESTAMP(3), "archivedReason" TEXT,
  "createdById" UUID NOT NULL, "updatedById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "supplier_transactions" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "supplierId" UUID NOT NULL,
  "type" "SupplierTransactionType" NOT NULL, "direction" "SupplierTransactionDirection" NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL, "transactionDate" DATE NOT NULL, "description" TEXT NOT NULL,
  "reference" TEXT, "notes" TEXT, "status" "SupplierTransactionStatus" NOT NULL DEFAULT 'ACTIVE',
  "removedAt" TIMESTAMP(3), "removedById" UUID, "removedReason" TEXT,
  "createdById" UUID NOT NULL, "updatedById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "supplier_audits" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "recordType" "SupplierAuditRecordType" NOT NULL,
  "recordId" UUID NOT NULL, "supplierId" UUID, "supplierTransactionId" UUID,
  "action" "SupplierAuditAction" NOT NULL, "changedById" UUID NOT NULL,
  "changedByName" TEXT NOT NULL, "changedByUsername" TEXT NOT NULL,
  "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "reason" TEXT NOT NULL,
  "beforeValues" JSONB NOT NULL, "afterValues" JSONB NOT NULL, "affectedTotals" JSONB,
  "requestId" TEXT, "ipAddress" TEXT
);

CREATE INDEX IF NOT EXISTS "suppliers_name_idx" ON "suppliers"("name");
CREATE INDEX IF NOT EXISTS "suppliers_phone_idx" ON "suppliers"("phone");
CREATE INDEX IF NOT EXISTS "suppliers_companyName_idx" ON "suppliers"("companyName");
CREATE INDEX IF NOT EXISTS "suppliers_isActive_idx" ON "suppliers"("isActive");
CREATE INDEX IF NOT EXISTS "supplier_transactions_supplierId_idx" ON "supplier_transactions"("supplierId");
CREATE INDEX IF NOT EXISTS "supplier_transactions_supplierId_status_idx" ON "supplier_transactions"("supplierId","status");
CREATE INDEX IF NOT EXISTS "supplier_transactions_transactionDate_idx" ON "supplier_transactions"("transactionDate");
CREATE INDEX IF NOT EXISTS "supplier_transactions_type_idx" ON "supplier_transactions"("type");
CREATE INDEX IF NOT EXISTS "supplier_transactions_status_idx" ON "supplier_transactions"("status");
CREATE INDEX IF NOT EXISTS "supplier_audits_recordType_recordId_changedAt_idx" ON "supplier_audits"("recordType","recordId","changedAt");
CREATE INDEX IF NOT EXISTS "supplier_audits_supplierId_changedAt_idx" ON "supplier_audits"("supplierId","changedAt");
CREATE INDEX IF NOT EXISTS "supplier_audits_changedAt_idx" ON "supplier_audits"("changedAt");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='suppliers_createdById_fkey') THEN ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='suppliers_updatedById_fkey') THEN ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='supplier_transactions_supplierId_fkey') THEN ALTER TABLE "supplier_transactions" ADD CONSTRAINT "supplier_transactions_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='supplier_transactions_removedById_fkey') THEN ALTER TABLE "supplier_transactions" ADD CONSTRAINT "supplier_transactions_removedById_fkey" FOREIGN KEY ("removedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='supplier_transactions_createdById_fkey') THEN ALTER TABLE "supplier_transactions" ADD CONSTRAINT "supplier_transactions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='supplier_transactions_updatedById_fkey') THEN ALTER TABLE "supplier_transactions" ADD CONSTRAINT "supplier_transactions_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='supplier_audits_supplierId_fkey') THEN ALTER TABLE "supplier_audits" ADD CONSTRAINT "supplier_audits_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='supplier_audits_supplierTransactionId_fkey') THEN ALTER TABLE "supplier_audits" ADD CONSTRAINT "supplier_audits_supplierTransactionId_fkey" FOREIGN KEY ("supplierTransactionId") REFERENCES "supplier_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='supplier_audits_changedById_fkey') THEN ALTER TABLE "supplier_audits" ADD CONSTRAINT "supplier_audits_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE; END IF;
END $$;

-- Verification: all three rows should return a table name.
SELECT to_regclass('public.suppliers') AS suppliers,
       to_regclass('public.supplier_transactions') AS supplier_transactions,
       to_regclass('public.supplier_audits') AS supplier_audits;
