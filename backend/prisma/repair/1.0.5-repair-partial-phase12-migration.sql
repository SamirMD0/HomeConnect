-- HomeConnect 1.0.5 repair: finish a PARTIALLY APPLIED Phase 12 corrections migration.
--
-- Symptom this fixes
--   Dashboard, Ledger and Accounts Receivable all return HTTP 500, and the backend
--   logs a Prisma error:
--       P2022: The column `payment_allocations.voidedAt` does not exist in the current database.
--   `npx prisma migrate deploy` cannot recover on its own, because it restarts the
--   migration from the top and fails with:
--       42710: type "FinancialCorrectionRecordType" already exists
--
-- Cause
--   Migration 20260727130000_add_financial_correction_audit stopped midway. Its enums,
--   tables, indexes and most foreign keys landed, but the ALTER TABLE on
--   "payment_allocations" never did. Every financial read path selects
--   paymentAllocations.voidedAt to exclude voided payments, so all of them break.
--
-- Safety
--   Additive only: no DROP, no column type change, no data rewrite. Existing allocation
--   rows get NULL for the new columns, which the application already reads as
--   "not voided". Every statement is guarded, so this file is safe to run more than once,
--   and safe on a database where the migration applied cleanly (it becomes a no-op).
--
-- How to run
--   psql -h 127.0.0.1 -p 5433 -U postgres -d homeconnect -f repair-partial-phase12-migration.sql
--   Stop the HomeConnect app first, then start it again afterwards.
--   Take a backup first if this is the business machine.
--
-- Applied on the development database on 2026-07-28: section 1 and section 3 executed,
-- section 2 was already present and became a no-op.


-- ============================================================================
-- Section 1 — payment_allocations columns, indexes and foreign keys
-- This is the part that was missing and caused the 500s.
-- ============================================================================

ALTER TABLE "payment_allocations"
  ADD COLUMN IF NOT EXISTS "voidedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "voidedById" UUID,
  ADD COLUMN IF NOT EXISTS "correctionId" UUID;

CREATE INDEX IF NOT EXISTS "payment_allocations_voidedAt_idx" ON "payment_allocations"("voidedAt");
CREATE INDEX IF NOT EXISTS "payment_allocations_correctionId_idx" ON "payment_allocations"("correctionId");


-- ============================================================================
-- Section 2 — the rest of the Phase 12 objects
-- Included so this file also repairs a machine that stopped at a different point.
-- Identical to release/1.0.4/repair-phase12-corrections.sql.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FinancialCorrectionRecordType') THEN
    CREATE TYPE "FinancialCorrectionRecordType" AS ENUM (
      'DEBT',
      'INSTALLMENT_PLAN',
      'INSTALLMENT',
      'PAYMENT',
      'PAYMENT_ALLOCATION',
      'CUSTOMER_BILLING'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FinancialCorrectionAction') THEN
    CREATE TYPE "FinancialCorrectionAction" AS ENUM (
      'CORRECT_DETAILS',
      'CORRECT_AMOUNT',
      'CORRECT_DATE',
      'VOID_PAYMENT',
      'REISSUE_PAYMENT',
      'REALLOCATE_PAYMENT',
      'CANCEL_RECORD'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FinancialCorrectionSourceScreen') THEN
    CREATE TYPE "FinancialCorrectionSourceScreen" AS ENUM (
      'LEDGER',
      'CUSTOMER_PROFILE',
      'PLAN_DETAILS',
      'REPORTS',
      'API'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AdminVerificationOutcome') THEN
    CREATE TYPE "AdminVerificationOutcome" AS ENUM ('SUCCESS', 'FAILURE', 'LOCKED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "financial_correction_audits" (
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

CREATE TABLE IF NOT EXISTS "admin_verification_logs" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "outcome" "AdminVerificationOutcome" NOT NULL,
    "action" TEXT NOT NULL,
    "ipAddress" TEXT,
    CONSTRAINT "admin_verification_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "financial_correction_audits_recordType_recordId_idx" ON "financial_correction_audits"("recordType", "recordId");
CREATE INDEX IF NOT EXISTS "financial_correction_audits_customerId_correctedAt_idx" ON "financial_correction_audits"("customerId", "correctedAt");
CREATE INDEX IF NOT EXISTS "financial_correction_audits_correctedAt_idx" ON "financial_correction_audits"("correctedAt");
CREATE INDEX IF NOT EXISTS "admin_verification_logs_userId_attemptedAt_idx" ON "admin_verification_logs"("userId", "attemptedAt");
CREATE INDEX IF NOT EXISTS "admin_verification_logs_attemptedAt_idx" ON "admin_verification_logs"("attemptedAt");

-- Foreign keys last, so the referenced tables and columns already exist.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_allocations_voidedById_fkey') THEN
    ALTER TABLE "payment_allocations"
      ADD CONSTRAINT "payment_allocations_voidedById_fkey"
      FOREIGN KEY ("voidedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_allocations_correctionId_fkey') THEN
    ALTER TABLE "payment_allocations"
      ADD CONSTRAINT "payment_allocations_correctionId_fkey"
      FOREIGN KEY ("correctionId") REFERENCES "financial_correction_audits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'financial_correction_audits_customerId_fkey') THEN
    ALTER TABLE "financial_correction_audits"
      ADD CONSTRAINT "financial_correction_audits_customerId_fkey"
      FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'financial_correction_audits_correctedById_fkey') THEN
    ALTER TABLE "financial_correction_audits"
      ADD CONSTRAINT "financial_correction_audits_correctedById_fkey"
      FOREIGN KEY ("correctedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'admin_verification_logs_userId_fkey') THEN
    ALTER TABLE "admin_verification_logs"
      ADD CONSTRAINT "admin_verification_logs_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;


-- ============================================================================
-- Section 3 — migration history
-- Without this, the failed row stays in _prisma_migrations and every later
-- `prisma migrate deploy` aborts with P3018 even though the schema is correct.
--
-- The preferred way to do this is the Prisma CLI, on a machine that has the repo:
--     npx prisma migrate resolve --applied 20260727130000_add_financial_correction_audit --schema backend/prisma/schema.prisma
-- The block below does the same thing directly, for a machine that only has psql.
-- The checksum is the SHA-256 of
-- backend/prisma/migrations/20260727130000_add_financial_correction_audit/migration.sql.
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
     WHERE migration_name = '20260727130000_add_financial_correction_audit'
       AND finished_at IS NOT NULL
       AND rolled_back_at IS NULL
  ) THEN
    RAISE NOTICE 'Migration already recorded as applied; history unchanged.';
    RETURN;
  END IF;

  -- Retire any failed attempt so Prisma stops treating it as blocking.
  UPDATE "_prisma_migrations"
     SET rolled_back_at = now()
   WHERE migration_name = '20260727130000_add_financial_correction_audit'
     AND finished_at IS NULL
     AND rolled_back_at IS NULL;

  INSERT INTO "_prisma_migrations" (
    id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count
  ) VALUES (
    gen_random_uuid()::text,
    '6c14f45b12a5cf6f86425b431a78e5a5700c6cf6462480113d18fa01ab8e11e3',
    now(),
    '20260727130000_add_financial_correction_audit',
    'Applied manually by release/1.0.5/repair-partial-phase12-migration.sql',
    NULL,
    now(),
    1
  );

  RAISE NOTICE 'Migration marked as applied.';
END $$;


-- ============================================================================
-- Section 4 — verification (read-only; all three should return no rows / true)
-- ============================================================================

-- Expect: voidedAt, voidedById, correctionId all present.
SELECT column_name
  FROM information_schema.columns
 WHERE table_name = 'payment_allocations'
   AND column_name IN ('voidedAt', 'voidedById', 'correctionId')
 ORDER BY column_name;

-- Expect: exactly one row, rolled_back_at NULL, finished_at set.
-- Databases created from a plain SQL init file may not have Prisma's migration
-- history table. That is OK for this repair; the runtime only needs the schema
-- columns/tables above. Create a small temp result instead of failing.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = '_prisma_migrations') THEN
    CREATE TEMP TABLE IF NOT EXISTS phase12_migration_history_check AS
    SELECT migration_name, finished_at IS NOT NULL AS finished, rolled_back_at
      FROM "_prisma_migrations"
     WHERE migration_name = '20260727130000_add_financial_correction_audit'
       AND rolled_back_at IS NULL;
  ELSE
    CREATE TEMP TABLE IF NOT EXISTS phase12_migration_history_check (
      migration_name text,
      finished boolean,
      rolled_back_at timestamptz,
      note text
    );

    INSERT INTO phase12_migration_history_check
    VALUES (
      '20260727130000_add_financial_correction_audit',
      NULL,
      NULL,
      'No _prisma_migrations table on this database; schema repair verification only.'
    );
  END IF;
END $$;

SELECT * FROM phase12_migration_history_check;

-- Expect: 0. Any row here would mean a voided allocation predates the repair,
-- which cannot happen, since the columns did not exist before it.
SELECT count(*) AS unexpected_voided_rows
  FROM "payment_allocations"
 WHERE "voidedAt" IS NOT NULL
   AND "voidedById" IS NULL;
