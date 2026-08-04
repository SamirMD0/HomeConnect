-- HomeConnect Phase 12 safe repair for business PCs.
--
-- Purpose:
-- Add the Phase 12 correction/audit database objects needed by v1.0.5+.
--
-- Safe to run more than once:
-- This file uses IF NOT EXISTS, so "already exists, skipping" messages are OK.
--
-- Important:
-- This file does not delete business data.
-- This file does not require the Prisma _prisma_migrations table.

ALTER TABLE "payment_allocations"
  ADD COLUMN IF NOT EXISTS "voidedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "voidedById" TEXT,
  ADD COLUMN IF NOT EXISTS "correctionId" TEXT;

CREATE INDEX IF NOT EXISTS "payment_allocations_voidedAt_idx"
  ON "payment_allocations"("voidedAt");

CREATE INDEX IF NOT EXISTS "payment_allocations_correctionId_idx"
  ON "payment_allocations"("correctionId");

CREATE TABLE IF NOT EXISTS "financial_correction_audits" (
  "id" TEXT NOT NULL,
  "recordType" TEXT NOT NULL,
  "recordId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "correctionType" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "beforeData" JSONB NOT NULL,
  "afterData" JSONB NOT NULL,
  "correctedById" TEXT NOT NULL,
  "correctedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "financial_correction_audits_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "admin_verification_logs" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "success" BOOLEAN NOT NULL,
  CONSTRAINT "admin_verification_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "financial_correction_audits_recordType_recordId_idx"
  ON "financial_correction_audits"("recordType", "recordId");

CREATE INDEX IF NOT EXISTS "financial_correction_audits_customerId_correctedAt_idx"
  ON "financial_correction_audits"("customerId", "correctedAt");

CREATE INDEX IF NOT EXISTS "financial_correction_audits_correctedAt_idx"
  ON "financial_correction_audits"("correctedAt");

CREATE INDEX IF NOT EXISTS "admin_verification_logs_userId_attemptedAt_idx"
  ON "admin_verification_logs"("userId", "attemptedAt");

CREATE INDEX IF NOT EXISTS "admin_verification_logs_attemptedAt_idx"
  ON "admin_verification_logs"("attemptedAt");

-- Verification:
-- Expected rows:
-- correctionId
-- voidedAt
-- voidedById
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'payment_allocations'
  AND column_name IN ('voidedAt', 'voidedById', 'correctionId')
ORDER BY column_name;
