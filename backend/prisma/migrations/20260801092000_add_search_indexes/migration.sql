-- Trigram search indexes.
--
-- Two kinds per searchable column:
--   * plain-column   -- accelerates the ILIKE '%term%' that Prisma already
--                       emits for `contains` + `mode: 'insensitive'`
--   * normalized     -- backs the ranked/Arabic-tolerant queries that call
--                       hc_search_normalize / hc_phone_normalize
--
-- CREATE INDEX CONCURRENTLY is deliberately NOT used: Prisma wraps each
-- migration in a transaction and CONCURRENTLY cannot run inside one. The tables
-- here are small and the app should be closed during an upgrade anyway.
--
-- Additive and idempotent. Creates no tables, modifies no rows.

-- Customers -----------------------------------------------------------------
CREATE INDEX IF NOT EXISTS customers_name_trgm_idx
  ON customers USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS customers_phone_trgm_idx
  ON customers USING gin (phone gin_trgm_ops);
CREATE INDEX IF NOT EXISTS customers_name_norm_trgm_idx
  ON customers USING gin (hc_search_normalize(name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS customers_phone_norm_trgm_idx
  ON customers USING gin (hc_phone_normalize(phone) gin_trgm_ops);

-- Debts (ledger description search) ------------------------------------------
CREATE INDEX IF NOT EXISTS debts_description_trgm_idx
  ON debts USING gin (description gin_trgm_ops);
CREATE INDEX IF NOT EXISTS debts_description_norm_trgm_idx
  ON debts USING gin (hc_search_normalize(description) gin_trgm_ops);

-- Suppliers ------------------------------------------------------------------
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

-- Supplier transactions ------------------------------------------------------
CREATE INDEX IF NOT EXISTS supplier_tx_description_trgm_idx
  ON supplier_transactions USING gin (description gin_trgm_ops);
CREATE INDEX IF NOT EXISTS supplier_tx_reference_trgm_idx
  ON supplier_transactions USING gin (reference gin_trgm_ops);
CREATE INDEX IF NOT EXISTS supplier_tx_description_norm_trgm_idx
  ON supplier_transactions USING gin (hc_search_normalize(description) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS supplier_tx_reference_norm_trgm_idx
  ON supplier_transactions USING gin (hc_search_normalize(reference) gin_trgm_ops);

-- Products -------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS products_name_trgm_idx
  ON products USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS products_model_trgm_idx
  ON products USING gin (model gin_trgm_ops);
CREATE INDEX IF NOT EXISTS products_brand_trgm_idx
  ON products USING gin (brand gin_trgm_ops);

-- Fresh statistics so the planner can evaluate the new indexes.
ANALYZE customers;
ANALYZE debts;
ANALYZE suppliers;
ANALYZE supplier_transactions;
ANALYZE products;
