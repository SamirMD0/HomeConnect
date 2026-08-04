-- HomeConnect v1.0.7 prepaid-purchase business-PC database upgrade.
--
-- Adds the debt kind required for prepaid purchases while preserving every
-- existing debt as a STANDARD debt.
--
-- Safety:
--   - No DROP, TRUNCATE, DELETE, or financial amount changes.
--   - Safe to run more than once.
--   - Does not require or query the Prisma _prisma_migrations table.
--   - Runs schema changes in one transaction.
--
-- Before running:
--   1. Create a PostgreSQL backup.
--   2. Close HomeConnect.
--   3. In pgAdmin, select the homeconnect database and open Query Tool.
--   4. Open this file and execute the complete script.
--   5. Confirm every verification row at the bottom says OK.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.debts') IS NULL THEN
    RAISE EXCEPTION 'Required table public.debts is missing. Confirm that the homeconnect database is selected.';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'DebtKind'
  ) THEN
    CREATE TYPE "DebtKind" AS ENUM ('STANDARD', 'PREPAID_PURCHASE');
  END IF;
END $$;

ALTER TABLE "debts"
  ADD COLUMN IF NOT EXISTS "kind" "DebtKind" NOT NULL DEFAULT 'STANDARD';

-- Repairs a partially added nullable column without changing valid values.
UPDATE "debts"
SET "kind" = 'STANDARD'
WHERE "kind" IS NULL;

ALTER TABLE "debts"
  ALTER COLUMN "kind" SET DEFAULT 'STANDARD',
  ALTER COLUMN "kind" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "debts_kind_idx" ON "debts"("kind");

COMMIT;

-- Verification --------------------------------------------------------------
-- Expected result: every row says OK.

SELECT object_name,
       CASE WHEN is_present THEN 'OK' ELSE 'MISSING' END AS result
FROM (
  SELECT 'DebtKind enum' AS object_name,
         to_regtype('public."DebtKind"') IS NOT NULL AS is_present
  UNION ALL
  SELECT 'debts.kind column', EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'debts'
      AND column_name = 'kind'
      AND is_nullable = 'NO'
      AND udt_name = 'DebtKind'
  )
  UNION ALL
  SELECT 'debts.kind default', EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'debts'
      AND column_name = 'kind'
      AND column_default LIKE '%STANDARD%'
  )
  UNION ALL
  SELECT 'debts kind index', to_regclass('public.debts_kind_idx') IS NOT NULL
  UNION ALL
  SELECT 'existing debts classified', NOT EXISTS (
    SELECT 1 FROM "debts" WHERE "kind" IS NULL
  )
) checks
ORDER BY object_name;
