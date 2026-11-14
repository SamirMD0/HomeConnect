-- Narrow existing trigger targets without changing the installed log or triggers.
BEGIN;

CREATE OR REPLACE FUNCTION sync_capture_products() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r products%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock_shared(74103, 1);
  IF TG_OP = 'DELETE' THEN r := OLD; ELSE r := NEW; END IF;
  INSERT INTO sync_changes (entity, entity_id, branch_id, op)
  SELECT DISTINCT entity, entity_id, branch_id, op FROM (
    SELECT 'product'::text AS entity, r."id" AS entity_id, NULL::uuid AS branch_id, CASE WHEN TG_OP = 'DELETE' THEN 'delete' ELSE 'upsert' END AS op
    UNION SELECT 'category', r."categoryId", NULL::uuid, 'upsert' WHERE TG_OP <> 'UPDATE' OR OLD."categoryId" IS DISTINCT FROM NEW."categoryId"
    UNION SELECT 'category', OLD."categoryId", NULL::uuid, 'upsert' WHERE TG_OP = 'UPDATE' AND OLD."categoryId" IS DISTINCT FROM NEW."categoryId"
  ) AS targets(entity, entity_id, branch_id, op) WHERE entity_id IS NOT NULL;
  -- Reparenting invalidates the former owner as well, including branch transfers.
  IF TG_OP = 'UPDATE' AND ROW(OLD."id") IS DISTINCT FROM ROW(NEW."id") THEN
    r := OLD;
    INSERT INTO sync_changes (entity, entity_id, branch_id, op)
  SELECT DISTINCT entity, entity_id, branch_id, op FROM (
    SELECT 'product'::text AS entity, r."id" AS entity_id, NULL::uuid AS branch_id, CASE WHEN TG_OP = 'DELETE' THEN 'delete' ELSE 'upsert' END AS op
    UNION SELECT 'category', r."categoryId", NULL::uuid, 'upsert' WHERE TG_OP <> 'UPDATE' OR OLD."categoryId" IS DISTINCT FROM NEW."categoryId"
    UNION SELECT 'category', OLD."categoryId", NULL::uuid, 'upsert' WHERE TG_OP = 'UPDATE' AND OLD."categoryId" IS DISTINCT FROM NEW."categoryId"
  ) AS targets(entity, entity_id, branch_id, op) WHERE entity_id IS NOT NULL;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION sync_capture_stock_movements() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r stock_movements%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock_shared(74103, 1);
  IF TG_OP = 'DELETE' THEN r := OLD; ELSE r := NEW; END IF;
  INSERT INTO sync_changes (entity, entity_id, branch_id, op)
  SELECT DISTINCT entity, entity_id, branch_id, op FROM (
    SELECT 'product'::text AS entity, r."productId" AS entity_id, NULL::uuid AS branch_id, 'upsert'::text AS op
  ) AS targets(entity, entity_id, branch_id, op) WHERE entity_id IS NOT NULL;
  -- Reparenting invalidates the former owner as well, including branch transfers.
  IF TG_OP = 'UPDATE' AND ROW(OLD."productId") IS DISTINCT FROM ROW(NEW."productId") THEN
    r := OLD;
    INSERT INTO sync_changes (entity, entity_id, branch_id, op)
  SELECT DISTINCT entity, entity_id, branch_id, op FROM (
    SELECT 'product'::text AS entity, r."productId" AS entity_id, NULL::uuid AS branch_id, 'upsert'::text AS op
  ) AS targets(entity, entity_id, branch_id, op) WHERE entity_id IS NOT NULL;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION sync_capture_categories() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  r categories%ROWTYPE;
  path_changed boolean := false;
BEGIN
  PERFORM pg_advisory_xact_lock_shared(74103, 1);
  IF TG_OP = 'DELETE' THEN r := OLD; ELSE r := NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    path_changed := ROW(OLD.name, OLD."parentId") IS DISTINCT FROM ROW(NEW.name, NEW."parentId");
  END IF;

  WITH RECURSIVE descendants(id) AS (
    SELECT r.id WHERE path_changed
    UNION
    SELECT c.id FROM categories c JOIN descendants d ON c."parentId" = d.id
  ), targets(entity, entity_id, op) AS (
    SELECT 'category'::text, r.id, CASE WHEN TG_OP = 'DELETE' THEN 'delete' ELSE 'upsert' END
    UNION
    SELECT 'category', r."parentId", 'upsert'
    WHERE TG_OP IN ('INSERT', 'DELETE')
      OR (TG_OP = 'UPDATE' AND OLD."parentId" IS DISTINCT FROM NEW."parentId")
    UNION
    SELECT 'category', OLD."parentId", 'upsert'
    WHERE TG_OP = 'UPDATE' AND OLD."parentId" IS DISTINCT FROM NEW."parentId"
    UNION
    SELECT 'category', d.id, 'upsert' FROM descendants d WHERE d.id <> r.id
    UNION
    SELECT 'product', p.id, 'upsert' FROM products p WHERE p."categoryId" IN (SELECT id FROM descendants)
  )
  INSERT INTO sync_changes (entity, entity_id, branch_id, op)
  SELECT entity, entity_id, NULL::uuid, op FROM targets WHERE entity_id IS NOT NULL;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION sync_capture_branches() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r branches%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock_shared(74103, 1);
  IF TG_OP = 'DELETE' THEN r := OLD; ELSE r := NEW; END IF;
  INSERT INTO sync_changes (entity, entity_id, branch_id, op)
  SELECT 'branch', r.id, r.id, CASE WHEN TG_OP = 'DELETE' THEN 'delete' ELSE 'upsert' END;
  IF TG_OP = 'UPDATE' AND ROW(OLD.name, OLD.code) IS DISTINCT FROM ROW(NEW.name, NEW.code) THEN
    INSERT INTO sync_changes (entity, entity_id, branch_id, op)
    SELECT 'sales_order', o.id, o."branchId", 'upsert' FROM sales_orders o WHERE o."branchId" = r.id;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION sync_capture_pricing_presets() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND ROW(
    OLD.id, OLD.name, OLD."expensePercent", OLD."profitPercent", OLD."discountBufferPercent",
    OLD."installmentMarkupPercent", OLD."downPaymentPercent", OLD."defaultInstallmentMonths",
    OLD."calculationMode", OLD."roundingMode", OLD."isDefault", OLD."isActive", OLD."archivedAt"
  ) IS NOT DISTINCT FROM ROW(
    NEW.id, NEW.name, NEW."expensePercent", NEW."profitPercent", NEW."discountBufferPercent",
    NEW."installmentMarkupPercent", NEW."downPaymentPercent", NEW."defaultInstallmentMonths",
    NEW."calculationMode", NEW."roundingMode", NEW."isDefault", NEW."isActive", NEW."archivedAt"
  ) THEN RETURN NULL; END IF;
  PERFORM pg_advisory_xact_lock_shared(74103, 1);
  INSERT INTO sync_changes (entity, entity_id, branch_id, op)
  SELECT 'product', p.id, NULL::uuid, 'upsert' FROM products p
  WHERE p."pricingPresetId" IN (OLD.id, NEW.id)
    OR (p."pricingPresetId" IS NULL AND p."costPrice" IS NOT NULL
      AND (p.price IS NULL OR p."useCustomPricing")
      AND ((OLD."isDefault" AND OLD."isActive" AND OLD."archivedAt" IS NULL)
        OR (NEW."isDefault" AND NEW."isActive" AND NEW."archivedAt" IS NULL)));
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION sync_capture_tax_profiles() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND ROW(OLD.id, OLD.code, OLD."taxRateId", OLD."isDefault", OLD."isActive")
    IS NOT DISTINCT FROM ROW(NEW.id, NEW.code, NEW."taxRateId", NEW."isDefault", NEW."isActive")
  THEN RETURN NULL; END IF;
  PERFORM pg_advisory_xact_lock_shared(74103, 1);
  INSERT INTO sync_changes (entity, entity_id, branch_id, op)
  SELECT 'product', p.id, NULL::uuid, 'upsert' FROM products p
  WHERE p."taxProfileId" IN (OLD.id, NEW.id)
    OR (p."taxProfileId" IS NULL
      AND ((OLD."isDefault" AND OLD."isActive") OR (NEW."isDefault" AND NEW."isActive")));
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION sync_capture_tax_rates() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND ROW(OLD.id, OLD."ratePercent", OLD."effectiveFrom", OLD."effectiveTo", OLD."isActive")
    IS NOT DISTINCT FROM ROW(NEW.id, NEW."ratePercent", NEW."effectiveFrom", NEW."effectiveTo", NEW."isActive")
  THEN RETURN NULL; END IF;
  PERFORM pg_advisory_xact_lock_shared(74103, 1);
  INSERT INTO sync_changes (entity, entity_id, branch_id, op)
  SELECT 'product', p.id, NULL::uuid, 'upsert' FROM products p
  WHERE p."taxProfileId" IN (SELECT t.id FROM tax_profiles t WHERE t."taxRateId" IN (OLD.id, NEW.id))
    OR (p."taxProfileId" IS NULL AND EXISTS (
      SELECT 1 FROM tax_profiles t WHERE t."taxRateId" IN (OLD.id, NEW.id) AND t."isDefault" AND t."isActive"
    ));
  RETURN NULL;
END;
$$;

COMMIT;
