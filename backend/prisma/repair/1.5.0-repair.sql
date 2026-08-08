-- HomeConnect 1.5.0 database repair
--
-- Repairs the additive database changes introduced in 1.5.0:
--   1. Adds WEEKLY to InstallmentPlanFrequency.
--   2. Adds normalized trigram indexes for customer notes and address search.
--
-- Safe to run more than once. Existing rows are not modified.
-- Close HomeConnect and take a database backup before running this file.

DO $prerequisite_check$
BEGIN
  IF to_regclass('public.customers') IS NULL THEN
    RAISE EXCEPTION
      'HomeConnect customers table was not found. Apply the earlier database upgrades first.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'InstallmentPlanFrequency'
      AND typnamespace = 'public'::regnamespace
  ) THEN
    RAISE EXCEPTION
      'InstallmentPlanFrequency enum was not found. Apply the financial-domain upgrade first.';
  END IF;

  IF to_regprocedure('public.hc_search_normalize(text)') IS NULL THEN
    RAISE EXCEPTION
      'hc_search_normalize(text) was not found. Run the search repair from an earlier release first.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_extension
    WHERE extname = 'pg_trgm'
  ) THEN
    RAISE EXCEPTION
      'The pg_trgm extension was not found. Run the search repair from an earlier release first.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'customers'
      AND column_name = 'notes'
  ) OR NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'customers'
      AND column_name = 'address'
  ) THEN
    RAISE EXCEPTION
      'customers.notes or customers.address is missing. Apply the customer database upgrade first.';
  END IF;
END
$prerequisite_check$;

-- This statement is additive and idempotent. Existing monthly plans retain
-- their current frequency.
ALTER TYPE "InstallmentPlanFrequency" ADD VALUE IF NOT EXISTS 'WEEKLY';

-- CREATE INDEX CONCURRENTLY is deliberately not used because the HomeConnect
-- repair runner executes repairs in a transaction.
CREATE INDEX IF NOT EXISTS customers_notes_norm_trgm_idx
  ON customers USING gin (hc_search_normalize(notes) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS customers_address_norm_trgm_idx
  ON customers USING gin (hc_search_normalize(address) gin_trgm_ops);

ANALYZE customers;

-- Verification: weeklyFrequency must be 1 and customerSearchIndexes must be 2.
SELECT
  (
    SELECT count(*)::int
    FROM pg_enum enum_value
    JOIN pg_type enum_type ON enum_type.oid = enum_value.enumtypid
    WHERE enum_type.typname = 'InstallmentPlanFrequency'
      AND enum_value.enumlabel = 'WEEKLY'
  ) AS "weeklyFrequency",
  (
    SELECT count(*)::int
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname IN (
        'customers_notes_norm_trgm_idx',
        'customers_address_norm_trgm_idx'
      )
  ) AS "customerSearchIndexes";
