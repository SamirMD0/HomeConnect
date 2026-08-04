-- HomeConnect 1.3.0 business-PC repair: repair history table.
--
-- Adds:
--   - "repair_history" and its two enums, used by Settings -> Maintenance to
--     record every database update and repair applied to this PC.
-- Covers Prisma migration: 20260804130000_add_repair_history
--
-- Additive only. It creates one new table, two new enums, two indexes and one
-- foreign key. It does not delete, truncate, alter or backfill any existing
-- table, column or row.
--
-- Before running:
--   1. Close HomeConnect on the business PC.
--   2. Back up the homeconnect database.
--   3. Run as PostgreSQL superuser `postgres` with ON_ERROR_STOP enabled.
--   4. Install/reinstall HomeConnect 1.3.0 and restart it after this finishes.
--
-- Example:
--   psql -h localhost -p 5433 -U postgres -d homeconnect \
--        -v ON_ERROR_STOP=1 -f 1.3.0-repair.sql
--
-- Safe to run more than once.
--
-- NOTE: from 1.3.0 onward this file is also bundled inside the installer and
-- can be applied from Settings -> Maintenance, which takes a verified backup
-- first. This standalone script remains the break-glass path.

BEGIN;

-- ---------------------------------------------------------------------------
-- Enums. CREATE TYPE has no IF NOT EXISTS, so each is guarded.
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE "RepairKind" AS ENUM ('MIGRATION', 'REPAIR');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "RepairStatus" AS ENUM ('APPLIED', 'SKIPPED_NOT_NEEDED', 'FAILED', 'BLOCKED_NO_BACKUP', 'VERIFY_FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "repair_history" (
  "id" UUID NOT NULL,
  "repairId" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "kind" "RepairKind" NOT NULL,
  "checksum" TEXT NOT NULL,
  "status" "RepairStatus" NOT NULL,
  "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "appliedById" UUID,
  "appliedByName" TEXT NOT NULL,
  "backupPath" TEXT,
  "durationMs" INTEGER,
  "errorMessage" TEXT,
  CONSTRAINT "repair_history_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "repair_history_appliedAt_idx" ON "repair_history"("appliedAt");
CREATE INDEX IF NOT EXISTS "repair_history_repairId_appliedAt_idx" ON "repair_history"("repairId", "appliedAt");

-- ---------------------------------------------------------------------------
-- Foreign key. ADD CONSTRAINT has no IF NOT EXISTS, so it is guarded too.
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  ALTER TABLE "repair_history"
    ADD CONSTRAINT "repair_history_appliedById_fkey"
    FOREIGN KEY ("appliedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- Migration bookkeeping.
--
-- Without this, a later `prisma migrate deploy` on this PC would try to apply
-- 20260804130000_add_repair_history again and fail on the already-existing
-- type. This project has been bitten by exactly that drift before.
--
-- The table is created first because a business PC may never have run Prisma.
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

-- Recorded only when no successful row already exists for this migration, so a
-- second run adds nothing.
INSERT INTO "_prisma_migrations" (
  "id", "checksum", "finished_at", "migration_name", "logs", "rolled_back_at", "started_at", "applied_steps_count"
)
SELECT
  gen_random_uuid()::text,
  'db5a447e8773e1bbe7e9fb7372a7927dfee8dec880b91aa2d69ad6b3d66424a9',
  now(),
  '20260804130000_add_repair_history',
  'Applied by 1.3.0-repair.sql',
  NULL,
  now(),
  1
WHERE NOT EXISTS (
  SELECT 1 FROM "_prisma_migrations"
  WHERE "migration_name" = '20260804130000_add_repair_history'
    AND "finished_at" IS NOT NULL
    AND "rolled_back_at" IS NULL
);

COMMIT;

-- ---------------------------------------------------------------------------
-- Verification. Both should report the expected counts.
-- ---------------------------------------------------------------------------
SELECT count(*) AS "repairHistoryColumns"
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'repair_history';   -- expect 12

SELECT count(*) AS "repairHistoryMigrationRecorded"
FROM "_prisma_migrations"
WHERE "migration_name" = '20260804130000_add_repair_history'
  AND "finished_at" IS NOT NULL;                                   -- expect 1
