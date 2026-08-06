-- Normalized expression indexes for the newly searchable customer fields.
--
-- CREATE INDEX CONCURRENTLY is deliberately NOT used: Prisma wraps each
-- migration in a transaction and CONCURRENTLY cannot run inside one. The table
-- is small and the app should be closed during an upgrade anyway.
--
-- Additive and idempotent. Modifies no rows.

CREATE INDEX IF NOT EXISTS customers_notes_norm_trgm_idx
  ON customers USING gin (hc_search_normalize(notes) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS customers_address_norm_trgm_idx
  ON customers USING gin (hc_search_normalize(address) gin_trgm_ops);

ANALYZE customers;
