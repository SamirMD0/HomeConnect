-- CreateEnum
CREATE TYPE "SupplierTransactionType" AS ENUM ('SUPPLIER_DEBT', 'SUPPLIER_PAYMENT', 'SUPPLIER_CREDIT', 'SUPPLIER_ADJUSTMENT');

-- CreateEnum
CREATE TYPE "SupplierTransactionDirection" AS ENUM ('INCREASE_OWED', 'DECREASE_OWED');

-- CreateEnum
CREATE TYPE "SupplierTransactionStatus" AS ENUM ('ACTIVE', 'REMOVED');

-- CreateEnum
CREATE TYPE "SupplierAuditRecordType" AS ENUM ('SUPPLIER', 'SUPPLIER_TRANSACTION');

-- CreateEnum
CREATE TYPE "SupplierAuditAction" AS ENUM ('CREATE', 'UPDATE', 'ARCHIVE', 'RESTORE', 'REMOVE', 'RESTORE_TRANSACTION', 'DELETE');

-- CreateTable
CREATE TABLE "suppliers" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "companyName" TEXT,
  "secondaryPhone" TEXT,
  "email" TEXT,
  "notes" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "archivedAt" TIMESTAMP(3),
  "archivedReason" TEXT,
  "createdById" UUID NOT NULL,
  "updatedById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_transactions" (
  "id" UUID NOT NULL,
  "supplierId" UUID NOT NULL,
  "type" "SupplierTransactionType" NOT NULL,
  "direction" "SupplierTransactionDirection" NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "transactionDate" DATE NOT NULL,
  "description" TEXT NOT NULL,
  "reference" TEXT,
  "notes" TEXT,
  "status" "SupplierTransactionStatus" NOT NULL DEFAULT 'ACTIVE',
  "removedAt" TIMESTAMP(3),
  "removedById" UUID,
  "removedReason" TEXT,
  "createdById" UUID NOT NULL,
  "updatedById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "supplier_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_audits" (
  "id" UUID NOT NULL,
  "recordType" "SupplierAuditRecordType" NOT NULL,
  "recordId" UUID NOT NULL,
  "supplierId" UUID,
  "supplierTransactionId" UUID,
  "action" "SupplierAuditAction" NOT NULL,
  "changedById" UUID NOT NULL,
  "changedByName" TEXT NOT NULL,
  "changedByUsername" TEXT NOT NULL,
  "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reason" TEXT NOT NULL,
  "beforeValues" JSONB NOT NULL,
  "afterValues" JSONB NOT NULL,
  "affectedTotals" JSONB,
  "requestId" TEXT,
  "ipAddress" TEXT,
  CONSTRAINT "supplier_audits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "suppliers_name_idx" ON "suppliers"("name");
CREATE INDEX "suppliers_phone_idx" ON "suppliers"("phone");
CREATE INDEX "suppliers_companyName_idx" ON "suppliers"("companyName");
CREATE INDEX "suppliers_isActive_idx" ON "suppliers"("isActive");
CREATE INDEX "supplier_transactions_supplierId_idx" ON "supplier_transactions"("supplierId");
CREATE INDEX "supplier_transactions_supplierId_status_idx" ON "supplier_transactions"("supplierId", "status");
CREATE INDEX "supplier_transactions_transactionDate_idx" ON "supplier_transactions"("transactionDate");
CREATE INDEX "supplier_transactions_type_idx" ON "supplier_transactions"("type");
CREATE INDEX "supplier_transactions_status_idx" ON "supplier_transactions"("status");
CREATE INDEX "supplier_audits_recordType_recordId_changedAt_idx" ON "supplier_audits"("recordType", "recordId", "changedAt");
CREATE INDEX "supplier_audits_supplierId_changedAt_idx" ON "supplier_audits"("supplierId", "changedAt");
CREATE INDEX "supplier_audits_changedAt_idx" ON "supplier_audits"("changedAt");

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_transactions" ADD CONSTRAINT "supplier_transactions_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_transactions" ADD CONSTRAINT "supplier_transactions_removedById_fkey" FOREIGN KEY ("removedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_transactions" ADD CONSTRAINT "supplier_transactions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_transactions" ADD CONSTRAINT "supplier_transactions_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_audits" ADD CONSTRAINT "supplier_audits_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_audits" ADD CONSTRAINT "supplier_audits_supplierTransactionId_fkey" FOREIGN KEY ("supplierTransactionId") REFERENCES "supplier_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_audits" ADD CONSTRAINT "supplier_audits_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
