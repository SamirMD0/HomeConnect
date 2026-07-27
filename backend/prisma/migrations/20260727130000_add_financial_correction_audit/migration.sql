-- CreateEnum
CREATE TYPE "FinancialCorrectionRecordType" AS ENUM ('DEBT', 'INSTALLMENT_PLAN', 'INSTALLMENT', 'PAYMENT', 'PAYMENT_ALLOCATION', 'CUSTOMER_BILLING');

-- CreateEnum
CREATE TYPE "FinancialCorrectionAction" AS ENUM ('CORRECT_DETAILS', 'CORRECT_AMOUNT', 'CORRECT_DATE', 'VOID_PAYMENT', 'REISSUE_PAYMENT', 'REALLOCATE_PAYMENT', 'CANCEL_RECORD');

-- CreateEnum
CREATE TYPE "FinancialCorrectionSourceScreen" AS ENUM ('LEDGER', 'CUSTOMER_PROFILE', 'PLAN_DETAILS', 'REPORTS', 'API');

-- CreateEnum
CREATE TYPE "AdminVerificationOutcome" AS ENUM ('SUCCESS', 'FAILURE', 'LOCKED');

-- AlterTable
ALTER TABLE "payment_allocations"
  ADD COLUMN "voidedAt" TIMESTAMP(3),
  ADD COLUMN "voidedById" UUID,
  ADD COLUMN "correctionId" UUID;

-- CreateTable
CREATE TABLE "financial_correction_audits" (
    "id" UUID NOT NULL,
    "recordType" "FinancialCorrectionRecordType" NOT NULL,
    "recordId" UUID NOT NULL,
    "customerId" UUID,
    "action" "FinancialCorrectionAction" NOT NULL,
    "correctedById" UUID NOT NULL,
    "correctedByName" TEXT NOT NULL,
    "correctedByUsername" TEXT NOT NULL,
    "correctedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT NOT NULL,
    "beforeValues" JSONB NOT NULL,
    "afterValues" JSONB NOT NULL,
    "affectedTotals" JSONB,
    "sourceScreen" "FinancialCorrectionSourceScreen" NOT NULL,
    "requestId" TEXT,
    "ipAddress" TEXT,

    CONSTRAINT "financial_correction_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_verification_logs" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "outcome" "AdminVerificationOutcome" NOT NULL,
    "action" TEXT NOT NULL,
    "ipAddress" TEXT,

    CONSTRAINT "admin_verification_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_allocations_voidedAt_idx" ON "payment_allocations"("voidedAt");

-- CreateIndex
CREATE INDEX "payment_allocations_correctionId_idx" ON "payment_allocations"("correctionId");

-- CreateIndex
CREATE INDEX "financial_correction_audits_recordType_recordId_idx" ON "financial_correction_audits"("recordType", "recordId");

-- CreateIndex
CREATE INDEX "financial_correction_audits_customerId_correctedAt_idx" ON "financial_correction_audits"("customerId", "correctedAt");

-- CreateIndex
CREATE INDEX "financial_correction_audits_correctedAt_idx" ON "financial_correction_audits"("correctedAt");

-- CreateIndex
CREATE INDEX "admin_verification_logs_userId_attemptedAt_idx" ON "admin_verification_logs"("userId", "attemptedAt");

-- CreateIndex
CREATE INDEX "admin_verification_logs_attemptedAt_idx" ON "admin_verification_logs"("attemptedAt");

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_correctionId_fkey" FOREIGN KEY ("correctionId") REFERENCES "financial_correction_audits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_correction_audits" ADD CONSTRAINT "financial_correction_audits_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_correction_audits" ADD CONSTRAINT "financial_correction_audits_correctedById_fkey" FOREIGN KEY ("correctedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_verification_logs" ADD CONSTRAINT "admin_verification_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
