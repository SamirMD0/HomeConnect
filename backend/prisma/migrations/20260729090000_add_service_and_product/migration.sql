-- CreateEnum
CREATE TYPE "ServiceRequestType" AS ENUM ('ON_CALL', 'WORKSHOP_DROP_OFF', 'PART_REPLACEMENT');

-- CreateEnum
CREATE TYPE "ServiceJobStatus" AS ENUM ('RECEIVED', 'INSPECTION_PENDING', 'IN_WORKSHOP_REPAIR', 'SENT_TO_COMPANY', 'WAITING_FOR_PART', 'WAITING_CUSTOMER_APPROVAL', 'READY_FOR_PICKUP', 'DELIVERED_TO_CUSTOMER', 'CANCELLED', 'NOT_REPAIRABLE');

-- CreateEnum
CREATE TYPE "ServiceRoutingDecision" AS ENUM ('WORKSHOP', 'COMPANY', 'CUSTOMER_DECISION', 'NOT_REPAIRABLE');

-- CreateEnum
CREATE TYPE "WarrantyStatus" AS ENUM ('UNDER_WARRANTY', 'NO_WARRANTY', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ServiceAuditRecordType" AS ENUM ('PRODUCT', 'SERVICE_JOB');

-- CreateEnum
CREATE TYPE "ServiceAuditAction" AS ENUM ('CREATE', 'UPDATE_DETAILS', 'CHANGE_STATUS', 'CHANGE_ROUTING', 'CHANGE_WARRANTY', 'CHANGE_PRICE', 'CHANGE_DATES', 'CANCEL', 'REOPEN', 'ARCHIVE', 'RESTORE');

-- CreateTable
CREATE TABLE "products" (
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

-- CreateTable
CREATE TABLE "service_jobs" (
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

-- CreateTable
CREATE TABLE "service_audits" (
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

-- CreateIndex
CREATE UNIQUE INDEX "products_barcode_key" ON "products"("barcode");

-- CreateIndex
CREATE INDEX "products_name_idx" ON "products"("name");

-- CreateIndex
CREATE INDEX "products_model_idx" ON "products"("model");

-- CreateIndex
CREATE INDEX "products_brand_idx" ON "products"("brand");

-- CreateIndex
CREATE INDEX "products_isActive_idx" ON "products"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "service_jobs_jobNumber_key" ON "service_jobs"("jobNumber");

-- CreateIndex
CREATE INDEX "service_jobs_customerId_idx" ON "service_jobs"("customerId");

-- CreateIndex
CREATE INDEX "service_jobs_productId_idx" ON "service_jobs"("productId");

-- CreateIndex
CREATE INDEX "service_jobs_status_idx" ON "service_jobs"("status");

-- CreateIndex
CREATE INDEX "service_jobs_customerId_status_idx" ON "service_jobs"("customerId", "status");

-- CreateIndex
CREATE INDEX "service_jobs_serviceCreatedDate_idx" ON "service_jobs"("serviceCreatedDate");

-- CreateIndex
CREATE INDEX "service_jobs_status_serviceCreatedDate_idx" ON "service_jobs"("status", "serviceCreatedDate");

-- CreateIndex
CREATE INDEX "service_jobs_requestType_idx" ON "service_jobs"("requestType");

-- CreateIndex
CREATE INDEX "service_audits_recordType_recordId_changedAt_idx" ON "service_audits"("recordType", "recordId", "changedAt");

-- CreateIndex
CREATE INDEX "service_audits_serviceJobId_changedAt_idx" ON "service_audits"("serviceJobId", "changedAt");

-- CreateIndex
CREATE INDEX "service_audits_changedAt_idx" ON "service_audits"("changedAt");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_jobs" ADD CONSTRAINT "service_jobs_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_jobs" ADD CONSTRAINT "service_jobs_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_jobs" ADD CONSTRAINT "service_jobs_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_jobs" ADD CONSTRAINT "service_jobs_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_jobs" ADD CONSTRAINT "service_jobs_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_audits" ADD CONSTRAINT "service_audits_serviceJobId_fkey" FOREIGN KEY ("serviceJobId") REFERENCES "service_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_audits" ADD CONSTRAINT "service_audits_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
