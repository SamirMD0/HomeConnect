-- HomeConnect v1.0.9 search upgrade — business PC safe.
--
-- Adds PostgreSQL trigram search: the pg_trgm extension, two normalization
-- functions, and GIN indexes for customer / ledger / supplier / product search.
--
-- Safety:
--   - No DROP, TRUNCATE, DELETE, or UPDATE of any kind.
--   - Creates no tables and modifies no rows. Indexes and functions only.
--   - Safe to run more than once.
--   - Does not require or query the Prisma _prisma_migrations table.
--
-- Requires: a SUPERUSER connection. pg_trgm is not a trusted extension, so
--           CREATE EXTENSION fails for a non-superuser role. Connect as the
--           `postgres` user for this script.
--
-- Before running:
--   1. Create and verify a PostgreSQL backup.
--   2. Close HomeConnect.
--   3. Confirm the selected pgAdmin database is `homeconnect`.
--   4. Execute the complete script.
--   5. Confirm every verification row at the bottom says OK.

-- 1. Extension ---------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. Normalization functions -------------------------------------------------
-- IMMUTABLE, so they are valid inside index expressions.
--
-- unaccent() is deliberately not used: it is STABLE rather than IMMUTABLE, so
-- PostgreSQL refuses it in index expressions, and its default rules target
-- Latin scripts and do almost nothing for Arabic.
--
-- TREAT AS APPEND-ONLY. Editing a body silently invalidates every dependent
-- index. To change the rules, create a _v2 and migrate the indexes.
--
-- Unicode escapes: 0623 alef-hamza-above, 0625 alef-hamza-below,
-- 0622 alef-madda, 0671 alef-wasla, 0649 alef-maksura, 0629 teh-marbuta,
-- 0627 alef, 064A yeh, 0647 heh, 064B-0652 tashkeel, 0640 tatweel.

CREATE OR REPLACE FUNCTION hc_search_normalize(input text)
RETURNS text AS $$
  SELECT translate(
    regexp_replace(lower(coalesce(input, '')), U&'[\064B-\0652\0640]', '', 'g'),
    U&'\0623\0625\0622\0671\0649\0629',
    U&'\0627\0627\0627\0627\064A\0647'
  );
$$ LANGUAGE SQL IMMUTABLE PARALLEL SAFE;

CREATE OR REPLACE FUNCTION hc_phone_normalize(input text)
RETURNS text AS $$
  SELECT regexp_replace(coalesce(input, ''), '[^0-9]', '', 'g');
$$ LANGUAGE SQL IMMUTABLE PARALLEL SAFE;

-- 3. Indexes -----------------------------------------------------------------
-- CREATE INDEX CONCURRENTLY is not used: it cannot run inside a transaction,
-- and the app should be closed during an upgrade anyway.

CREATE INDEX IF NOT EXISTS customers_name_trgm_idx
  ON customers USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS customers_phone_trgm_idx
  ON customers USING gin (phone gin_trgm_ops);
CREATE INDEX IF NOT EXISTS customers_name_norm_trgm_idx
  ON customers USING gin (hc_search_normalize(name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS customers_phone_norm_trgm_idx
  ON customers USING gin (hc_phone_normalize(phone) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS debts_description_trgm_idx
  ON debts USING gin (description gin_trgm_ops);
CREATE INDEX IF NOT EXISTS debts_description_norm_trgm_idx
  ON debts USING gin (hc_search_normalize(description) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS suppliers_name_trgm_idx
  ON suppliers USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS suppliers_company_trgm_idx
  ON suppliers USING gin ("companyName" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS suppliers_name_norm_trgm_idx
  ON suppliers USING gin (hc_search_normalize(name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS suppliers_company_norm_trgm_idx
  ON suppliers USING gin (hc_search_normalize("companyName") gin_trgm_ops);
CREATE INDEX IF NOT EXISTS suppliers_phone_norm_trgm_idx
  ON suppliers USING gin (hc_phone_normalize(phone) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS supplier_tx_description_trgm_idx
  ON supplier_transactions USING gin (description gin_trgm_ops);
CREATE INDEX IF NOT EXISTS supplier_tx_reference_trgm_idx
  ON supplier_transactions USING gin (reference gin_trgm_ops);
CREATE INDEX IF NOT EXISTS supplier_tx_description_norm_trgm_idx
  ON supplier_transactions USING gin (hc_search_normalize(description) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS supplier_tx_reference_norm_trgm_idx
  ON supplier_transactions USING gin (hc_search_normalize(reference) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS products_name_trgm_idx
  ON products USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS products_model_trgm_idx
  ON products USING gin (model gin_trgm_ops);
CREATE INDEX IF NOT EXISTS products_brand_trgm_idx
  ON products USING gin (brand gin_trgm_ops);

-- 4. Refresh planner statistics ----------------------------------------------
ANALYZE customers;
ANALYZE debts;
ANALYZE suppliers;
ANALYZE supplier_transactions;
ANALYZE products;

-- 5. Verification — every row must report OK ---------------------------------
-- to_regclass folds unquoted identifiers to lower case, so mixed-case names
-- must be quoted. Every index name below is lower-case-safe.

SELECT object_name, CASE WHEN ok THEN 'OK' ELSE 'FAIL' END AS result
FROM (
  SELECT 'pg_trgm extension' AS object_name,
         EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') AS ok
  UNION ALL
  SELECT 'hc_search_normalize function',
         EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'hc_search_normalize')
  UNION ALL
  SELECT 'hc_phone_normalize function',
         EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'hc_phone_normalize')
  UNION ALL
  SELECT 'alef normalization',
         hc_search_normalize(U&'\0623\062D\0645\062F') = hc_search_normalize(U&'\0627\062D\0645\062F')
  UNION ALL
  SELECT 'teh marbuta normalization',
         hc_search_normalize(U&'\0641\0627\0637\0645\0629') = hc_search_normalize(U&'\0641\0627\0637\0645\0647')
  UNION ALL
  SELECT 'phone normalization',
         hc_phone_normalize('70 123-456') = '70123456'
  UNION ALL
  SELECT 'customer search indexes',
         (SELECT count(*) FROM pg_indexes
           WHERE indexname IN ('customers_name_trgm_idx','customers_phone_trgm_idx',
                               'customers_name_norm_trgm_idx','customers_phone_norm_trgm_idx')) = 4
  UNION ALL
  SELECT 'debt search indexes',
         (SELECT count(*) FROM pg_indexes
           WHERE indexname IN ('debts_description_trgm_idx','debts_description_norm_trgm_idx')) = 2
  UNION ALL
  SELECT 'supplier search indexes',
         (SELECT count(*) FROM pg_indexes
           WHERE indexname IN ('suppliers_name_trgm_idx','suppliers_company_trgm_idx',
                               'suppliers_name_norm_trgm_idx','suppliers_company_norm_trgm_idx',
                               'suppliers_phone_norm_trgm_idx')) = 5
  UNION ALL
  SELECT 'supplier transaction search indexes',
         (SELECT count(*) FROM pg_indexes
           WHERE indexname IN ('supplier_tx_description_trgm_idx','supplier_tx_reference_trgm_idx',
                               'supplier_tx_description_norm_trgm_idx','supplier_tx_reference_norm_trgm_idx')) = 4
  UNION ALL
  SELECT 'product search indexes',
         (SELECT count(*) FROM pg_indexes
           WHERE indexname IN ('products_name_trgm_idx','products_model_trgm_idx','products_brand_trgm_idx')) = 3
) checks
ORDER BY object_name;
