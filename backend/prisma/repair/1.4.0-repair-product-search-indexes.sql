-- HomeConnect business-PC repair: normalized product search indexes.
-- Requires the search normalization function and pg_trgm installed by the
-- existing search repair. Safe to run more than once.

CREATE INDEX IF NOT EXISTS products_name_norm_trgm_idx
  ON products USING gin (hc_search_normalize(name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS products_model_norm_trgm_idx
  ON products USING gin (hc_search_normalize(model) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS products_brand_norm_trgm_idx
  ON products USING gin (hc_search_normalize(brand) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS products_sku_norm_trgm_idx
  ON products USING gin (hc_search_normalize(sku) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS products_barcode_norm_trgm_idx
  ON products USING gin (hc_search_normalize(barcode) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS products_notes_norm_trgm_idx
  ON products USING gin (hc_search_normalize(notes) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS products_specification_notes_norm_trgm_idx
  ON products USING gin (hc_search_normalize("specificationNotes") gin_trgm_ops);
CREATE INDEX IF NOT EXISTS products_specifications_norm_trgm_idx
  ON products USING gin (hc_search_normalize(specifications::text) gin_trgm_ops);

ANALYZE products;

SELECT count(*) AS "productNormalizedSearchIndexes"
FROM pg_indexes
WHERE schemaname = 'public' AND indexname IN (
  'products_name_norm_trgm_idx', 'products_model_norm_trgm_idx',
  'products_brand_norm_trgm_idx', 'products_sku_norm_trgm_idx',
  'products_barcode_norm_trgm_idx', 'products_notes_norm_trgm_idx',
  'products_specification_notes_norm_trgm_idx',
  'products_specifications_norm_trgm_idx'
);
