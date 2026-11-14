-- Append-only entity invalidations. No foreign keys: hard-delete tombstones survive their parents.
BEGIN;
CREATE TABLE "sync_changes" (
  "seq" BIGSERIAL PRIMARY KEY,
  "entity" TEXT NOT NULL,
  "entity_id" UUID NOT NULL,
  "branch_id" UUID,
  "op" TEXT NOT NULL CHECK ("op" IN ('upsert', 'delete')),
  "changed_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX "sync_changes_entity_entity_id_idx" ON "sync_changes" ("entity", "entity_id");
CREATE INDEX "sync_changes_changed_at_idx" ON "sync_changes" ("changed_at");

-- Producers share this transaction lock BEFORE nextval, allowing concurrent writes.
-- The feed takes it exclusively while reading the log, waiting for pending producers
-- before advancing its cursor. Rollbacks can leave harmless numeric gaps.
-- Reserve the two-key advisory lock (74103, 1) for the sync log barrier.

CREATE FUNCTION sync_capture_products() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r products%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock_shared(74103, 1);
  IF TG_OP = 'DELETE' THEN r := OLD; ELSE r := NEW; END IF;
  INSERT INTO sync_changes (entity, entity_id, branch_id, op)
  SELECT DISTINCT entity, entity_id, branch_id, op FROM (
    SELECT 'product'::text AS entity, r."id" AS entity_id, NULL::uuid AS branch_id, CASE WHEN TG_OP = 'DELETE' THEN 'delete' ELSE 'upsert' END AS op
    UNION SELECT 'sales_order', o.id, o."branchId", 'upsert' FROM sales_order_items i JOIN sales_orders o ON o.id = i."salesOrderId" WHERE i."productId" = r."id"
    UNION SELECT 'category', r."categoryId", NULL::uuid, 'upsert' WHERE TG_OP <> 'UPDATE' OR OLD."categoryId" IS DISTINCT FROM NEW."categoryId"
    UNION SELECT 'category', OLD."categoryId", NULL::uuid, 'upsert' WHERE TG_OP = 'UPDATE' AND OLD."categoryId" IS DISTINCT FROM NEW."categoryId"
  ) AS targets(entity, entity_id, branch_id, op) WHERE entity_id IS NOT NULL;
  -- Reparenting invalidates the former owner as well, including branch transfers.
  IF TG_OP = 'UPDATE' AND ROW(OLD."id") IS DISTINCT FROM ROW(NEW."id") THEN
    r := OLD;
    INSERT INTO sync_changes (entity, entity_id, branch_id, op)
  SELECT DISTINCT entity, entity_id, branch_id, op FROM (
    SELECT 'product'::text AS entity, r."id" AS entity_id, NULL::uuid AS branch_id, CASE WHEN TG_OP = 'DELETE' THEN 'delete' ELSE 'upsert' END AS op
    UNION SELECT 'sales_order', o.id, o."branchId", 'upsert' FROM sales_order_items i JOIN sales_orders o ON o.id = i."salesOrderId" WHERE i."productId" = r."id"
    UNION SELECT 'category', r."categoryId", NULL::uuid, 'upsert' WHERE TG_OP <> 'UPDATE' OR OLD."categoryId" IS DISTINCT FROM NEW."categoryId"
    UNION SELECT 'category', OLD."categoryId", NULL::uuid, 'upsert' WHERE TG_OP = 'UPDATE' AND OLD."categoryId" IS DISTINCT FROM NEW."categoryId"
  ) AS targets(entity, entity_id, branch_id, op) WHERE entity_id IS NOT NULL;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER sync_changes_products
AFTER INSERT OR UPDATE OR DELETE ON "products"
FOR EACH ROW EXECUTE FUNCTION sync_capture_products();

CREATE FUNCTION sync_capture_stock_movements() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r stock_movements%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock_shared(74103, 1);
  IF TG_OP = 'DELETE' THEN r := OLD; ELSE r := NEW; END IF;
  INSERT INTO sync_changes (entity, entity_id, branch_id, op)
  SELECT DISTINCT entity, entity_id, branch_id, op FROM (
    SELECT 'product'::text AS entity, r."productId" AS entity_id, NULL::uuid AS branch_id, 'upsert'::text AS op
    UNION SELECT 'sales_order', o.id, o."branchId", 'upsert' FROM sales_order_items i JOIN sales_orders o ON o.id = i."salesOrderId" WHERE i."productId" = r."productId"
  ) AS targets(entity, entity_id, branch_id, op) WHERE entity_id IS NOT NULL;
  -- Reparenting invalidates the former owner as well, including branch transfers.
  IF TG_OP = 'UPDATE' AND ROW(OLD."productId") IS DISTINCT FROM ROW(NEW."productId") THEN
    r := OLD;
    INSERT INTO sync_changes (entity, entity_id, branch_id, op)
  SELECT DISTINCT entity, entity_id, branch_id, op FROM (
    SELECT 'product'::text AS entity, r."productId" AS entity_id, NULL::uuid AS branch_id, 'upsert'::text AS op
    UNION SELECT 'sales_order', o.id, o."branchId", 'upsert' FROM sales_order_items i JOIN sales_orders o ON o.id = i."salesOrderId" WHERE i."productId" = r."productId"
  ) AS targets(entity, entity_id, branch_id, op) WHERE entity_id IS NOT NULL;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER sync_changes_stock_movements
AFTER INSERT OR UPDATE OR DELETE ON "stock_movements"
FOR EACH ROW EXECUTE FUNCTION sync_capture_stock_movements();

CREATE FUNCTION sync_capture_product_images() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r product_images%ROWTYPE;
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
CREATE TRIGGER sync_changes_product_images
AFTER INSERT OR UPDATE OR DELETE ON "product_images"
FOR EACH ROW EXECUTE FUNCTION sync_capture_product_images();

CREATE FUNCTION sync_capture_product_pricing_card_features() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r product_pricing_card_features%ROWTYPE;
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
CREATE TRIGGER sync_changes_product_pricing_card_features
AFTER INSERT OR UPDATE OR DELETE ON "product_pricing_card_features"
FOR EACH ROW EXECUTE FUNCTION sync_capture_product_pricing_card_features();

CREATE FUNCTION sync_capture_customers() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r customers%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock_shared(74103, 1);
  IF TG_OP = 'DELETE' THEN r := OLD; ELSE r := NEW; END IF;
  INSERT INTO sync_changes (entity, entity_id, branch_id, op)
  SELECT DISTINCT entity, entity_id, branch_id, op FROM (
    SELECT 'customer'::text AS entity, r."id" AS entity_id, r."branchId" AS branch_id, CASE WHEN TG_OP = 'DELETE' THEN 'delete' ELSE 'upsert' END AS op
    UNION SELECT 'sales_order', o.id, o."branchId", 'upsert' FROM sales_orders o WHERE o."customerId" = r.id
  ) AS targets(entity, entity_id, branch_id, op) WHERE entity_id IS NOT NULL;
  -- Reparenting invalidates the former owner as well, including branch transfers.
  IF TG_OP = 'UPDATE' AND ROW(OLD."id", OLD."branchId") IS DISTINCT FROM ROW(NEW."id", NEW."branchId") THEN
    r := OLD;
    INSERT INTO sync_changes (entity, entity_id, branch_id, op)
  SELECT DISTINCT entity, entity_id, branch_id, op FROM (
    SELECT 'customer'::text AS entity, r."id" AS entity_id, r."branchId" AS branch_id, CASE WHEN TG_OP = 'DELETE' THEN 'delete' ELSE 'upsert' END AS op
    UNION SELECT 'sales_order', o.id, o."branchId", 'upsert' FROM sales_orders o WHERE o."customerId" = r.id
  ) AS targets(entity, entity_id, branch_id, op) WHERE entity_id IS NOT NULL;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER sync_changes_customers
AFTER INSERT OR UPDATE OR DELETE ON "customers"
FOR EACH ROW EXECUTE FUNCTION sync_capture_customers();

CREATE FUNCTION sync_capture_debts() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r debts%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock_shared(74103, 1);
  IF TG_OP = 'DELETE' THEN r := OLD; ELSE r := NEW; END IF;
  INSERT INTO sync_changes (entity, entity_id, branch_id, op)
  SELECT DISTINCT entity, entity_id, branch_id, op FROM (
    SELECT 'customer'::text AS entity, r."customerId" AS entity_id, r."branchId" AS branch_id, 'upsert'::text AS op
    UNION SELECT 'sales_order', o.id, o."branchId", 'upsert' FROM sales_orders o WHERE o."debtId" = r.id
  ) AS targets(entity, entity_id, branch_id, op) WHERE entity_id IS NOT NULL;
  -- Reparenting invalidates the former owner as well, including branch transfers.
  IF TG_OP = 'UPDATE' AND ROW(OLD."customerId", OLD."branchId") IS DISTINCT FROM ROW(NEW."customerId", NEW."branchId") THEN
    r := OLD;
    INSERT INTO sync_changes (entity, entity_id, branch_id, op)
  SELECT DISTINCT entity, entity_id, branch_id, op FROM (
    SELECT 'customer'::text AS entity, r."customerId" AS entity_id, r."branchId" AS branch_id, 'upsert'::text AS op
    UNION SELECT 'sales_order', o.id, o."branchId", 'upsert' FROM sales_orders o WHERE o."debtId" = r.id
  ) AS targets(entity, entity_id, branch_id, op) WHERE entity_id IS NOT NULL;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER sync_changes_debts
AFTER INSERT OR UPDATE OR DELETE ON "debts"
FOR EACH ROW EXECUTE FUNCTION sync_capture_debts();

CREATE FUNCTION sync_capture_installment_plans() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r installment_plans%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock_shared(74103, 1);
  IF TG_OP = 'DELETE' THEN r := OLD; ELSE r := NEW; END IF;
  INSERT INTO sync_changes (entity, entity_id, branch_id, op)
  SELECT DISTINCT entity, entity_id, branch_id, op FROM (
    SELECT 'customer'::text AS entity, r."customerId" AS entity_id, r."branchId" AS branch_id, 'upsert'::text AS op
    UNION SELECT 'sales_order', o.id, o."branchId", 'upsert' FROM sales_orders o WHERE o."installmentPlanId" = r.id
  ) AS targets(entity, entity_id, branch_id, op) WHERE entity_id IS NOT NULL;
  -- Reparenting invalidates the former owner as well, including branch transfers.
  IF TG_OP = 'UPDATE' AND ROW(OLD."customerId", OLD."branchId") IS DISTINCT FROM ROW(NEW."customerId", NEW."branchId") THEN
    r := OLD;
    INSERT INTO sync_changes (entity, entity_id, branch_id, op)
  SELECT DISTINCT entity, entity_id, branch_id, op FROM (
    SELECT 'customer'::text AS entity, r."customerId" AS entity_id, r."branchId" AS branch_id, 'upsert'::text AS op
    UNION SELECT 'sales_order', o.id, o."branchId", 'upsert' FROM sales_orders o WHERE o."installmentPlanId" = r.id
  ) AS targets(entity, entity_id, branch_id, op) WHERE entity_id IS NOT NULL;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER sync_changes_installment_plans
AFTER INSERT OR UPDATE OR DELETE ON "installment_plans"
FOR EACH ROW EXECUTE FUNCTION sync_capture_installment_plans();

CREATE FUNCTION sync_capture_installments() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r installments%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock_shared(74103, 1);
  IF TG_OP = 'DELETE' THEN r := OLD; ELSE r := NEW; END IF;
  INSERT INTO sync_changes (entity, entity_id, branch_id, op)
  SELECT DISTINCT entity, entity_id, branch_id, op FROM (
    SELECT 'customer', p."customerId", p."branchId", 'upsert' FROM installment_plans p WHERE p.id = r."installmentPlanId"
    UNION SELECT 'sales_order', o.id, o."branchId", 'upsert' FROM sales_orders o WHERE o."installmentPlanId" = r."installmentPlanId"
  ) AS targets(entity, entity_id, branch_id, op) WHERE entity_id IS NOT NULL;
  -- Reparenting invalidates the former owner as well, including branch transfers.
  IF TG_OP = 'UPDATE' AND ROW(OLD."installmentPlanId") IS DISTINCT FROM ROW(NEW."installmentPlanId") THEN
    r := OLD;
    INSERT INTO sync_changes (entity, entity_id, branch_id, op)
  SELECT DISTINCT entity, entity_id, branch_id, op FROM (
    SELECT 'customer', p."customerId", p."branchId", 'upsert' FROM installment_plans p WHERE p.id = r."installmentPlanId"
    UNION SELECT 'sales_order', o.id, o."branchId", 'upsert' FROM sales_orders o WHERE o."installmentPlanId" = r."installmentPlanId"
  ) AS targets(entity, entity_id, branch_id, op) WHERE entity_id IS NOT NULL;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER sync_changes_installments
AFTER INSERT OR UPDATE OR DELETE ON "installments"
FOR EACH ROW EXECUTE FUNCTION sync_capture_installments();

CREATE FUNCTION sync_capture_prepaid_purchases() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r prepaid_purchases%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock_shared(74103, 1);
  IF TG_OP = 'DELETE' THEN r := OLD; ELSE r := NEW; END IF;
  INSERT INTO sync_changes (entity, entity_id, branch_id, op)
  SELECT DISTINCT entity, entity_id, branch_id, op FROM (
    SELECT 'customer', d."customerId", d."branchId", 'upsert' FROM debts d WHERE d.id = r."debtId"
    UNION SELECT 'sales_order', o.id, o."branchId", 'upsert' FROM sales_orders o WHERE o."debtId" = r."debtId"
  ) AS targets(entity, entity_id, branch_id, op) WHERE entity_id IS NOT NULL;
  -- Reparenting invalidates the former owner as well, including branch transfers.
  IF TG_OP = 'UPDATE' AND ROW(OLD."debtId") IS DISTINCT FROM ROW(NEW."debtId") THEN
    r := OLD;
    INSERT INTO sync_changes (entity, entity_id, branch_id, op)
  SELECT DISTINCT entity, entity_id, branch_id, op FROM (
    SELECT 'customer', d."customerId", d."branchId", 'upsert' FROM debts d WHERE d.id = r."debtId"
    UNION SELECT 'sales_order', o.id, o."branchId", 'upsert' FROM sales_orders o WHERE o."debtId" = r."debtId"
  ) AS targets(entity, entity_id, branch_id, op) WHERE entity_id IS NOT NULL;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER sync_changes_prepaid_purchases
AFTER INSERT OR UPDATE OR DELETE ON "prepaid_purchases"
FOR EACH ROW EXECUTE FUNCTION sync_capture_prepaid_purchases();

CREATE FUNCTION sync_capture_payments() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r payments%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock_shared(74103, 1);
  IF TG_OP = 'DELETE' THEN r := OLD; ELSE r := NEW; END IF;
  INSERT INTO sync_changes (entity, entity_id, branch_id, op)
  SELECT DISTINCT entity, entity_id, branch_id, op FROM (
    SELECT 'customer'::text AS entity, r."customerId" AS entity_id, r."branchId" AS branch_id, 'upsert'::text AS op
    UNION SELECT 'sales_order', o.id, o."branchId", 'upsert' FROM sales_orders o WHERE o.id = r."salesOrderId"
  ) AS targets(entity, entity_id, branch_id, op) WHERE entity_id IS NOT NULL;
  -- Reparenting invalidates the former owner as well, including branch transfers.
  IF TG_OP = 'UPDATE' AND ROW(OLD."customerId", OLD."salesOrderId", OLD."branchId") IS DISTINCT FROM ROW(NEW."customerId", NEW."salesOrderId", NEW."branchId") THEN
    r := OLD;
    INSERT INTO sync_changes (entity, entity_id, branch_id, op)
  SELECT DISTINCT entity, entity_id, branch_id, op FROM (
    SELECT 'customer'::text AS entity, r."customerId" AS entity_id, r."branchId" AS branch_id, 'upsert'::text AS op
    UNION SELECT 'sales_order', o.id, o."branchId", 'upsert' FROM sales_orders o WHERE o.id = r."salesOrderId"
  ) AS targets(entity, entity_id, branch_id, op) WHERE entity_id IS NOT NULL;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER sync_changes_payments
AFTER INSERT OR UPDATE OR DELETE ON "payments"
FOR EACH ROW EXECUTE FUNCTION sync_capture_payments();

CREATE FUNCTION sync_capture_payment_allocations() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r payment_allocations%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock_shared(74103, 1);
  IF TG_OP = 'DELETE' THEN r := OLD; ELSE r := NEW; END IF;
  INSERT INTO sync_changes (entity, entity_id, branch_id, op)
  SELECT DISTINCT entity, entity_id, branch_id, op FROM (
    SELECT 'customer', p."customerId", p."branchId", 'upsert' FROM payments p WHERE p.id = r."paymentId"
    UNION SELECT 'sales_order', p."salesOrderId", p."branchId", 'upsert' FROM payments p WHERE p.id = r."paymentId"
    UNION SELECT 'customer', d."customerId", d."branchId", 'upsert' FROM debts d WHERE d.id = r."debtId"
    UNION SELECT 'sales_order', o.id, o."branchId", 'upsert' FROM sales_orders o WHERE o."debtId" = r."debtId"
    UNION SELECT 'customer', p."customerId", p."branchId", 'upsert' FROM installments i JOIN installment_plans p ON p.id = i."installmentPlanId" WHERE i.id = r."installmentId"
    UNION SELECT 'sales_order', o.id, o."branchId", 'upsert' FROM installments i JOIN sales_orders o ON o."installmentPlanId" = i."installmentPlanId" WHERE i.id = r."installmentId"
  ) AS targets(entity, entity_id, branch_id, op) WHERE entity_id IS NOT NULL;
  -- Reparenting invalidates the former owner as well, including branch transfers.
  IF TG_OP = 'UPDATE' AND ROW(OLD."paymentId", OLD."debtId", OLD."installmentId") IS DISTINCT FROM ROW(NEW."paymentId", NEW."debtId", NEW."installmentId") THEN
    r := OLD;
    INSERT INTO sync_changes (entity, entity_id, branch_id, op)
  SELECT DISTINCT entity, entity_id, branch_id, op FROM (
    SELECT 'customer', p."customerId", p."branchId", 'upsert' FROM payments p WHERE p.id = r."paymentId"
    UNION SELECT 'sales_order', p."salesOrderId", p."branchId", 'upsert' FROM payments p WHERE p.id = r."paymentId"
    UNION SELECT 'customer', d."customerId", d."branchId", 'upsert' FROM debts d WHERE d.id = r."debtId"
    UNION SELECT 'sales_order', o.id, o."branchId", 'upsert' FROM sales_orders o WHERE o."debtId" = r."debtId"
    UNION SELECT 'customer', p."customerId", p."branchId", 'upsert' FROM installments i JOIN installment_plans p ON p.id = i."installmentPlanId" WHERE i.id = r."installmentId"
    UNION SELECT 'sales_order', o.id, o."branchId", 'upsert' FROM installments i JOIN sales_orders o ON o."installmentPlanId" = i."installmentPlanId" WHERE i.id = r."installmentId"
  ) AS targets(entity, entity_id, branch_id, op) WHERE entity_id IS NOT NULL;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER sync_changes_payment_allocations
AFTER INSERT OR UPDATE OR DELETE ON "payment_allocations"
FOR EACH ROW EXECUTE FUNCTION sync_capture_payment_allocations();

CREATE FUNCTION sync_capture_sales_orders() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r sales_orders%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock_shared(74103, 1);
  IF TG_OP = 'DELETE' THEN r := OLD; ELSE r := NEW; END IF;
  INSERT INTO sync_changes (entity, entity_id, branch_id, op)
  SELECT DISTINCT entity, entity_id, branch_id, op FROM (
    SELECT 'sales_order'::text AS entity, r."id" AS entity_id, r."branchId" AS branch_id, CASE WHEN TG_OP = 'DELETE' THEN 'delete' ELSE 'upsert' END AS op
    UNION SELECT 'customer', c.id, c."branchId", 'upsert' FROM customers c WHERE c.id = r."customerId"
  ) AS targets(entity, entity_id, branch_id, op) WHERE entity_id IS NOT NULL;
  -- Reparenting invalidates the former owner as well, including branch transfers.
  IF TG_OP = 'UPDATE' AND ROW(OLD."id", OLD."customerId", OLD."branchId") IS DISTINCT FROM ROW(NEW."id", NEW."customerId", NEW."branchId") THEN
    r := OLD;
    INSERT INTO sync_changes (entity, entity_id, branch_id, op)
  SELECT DISTINCT entity, entity_id, branch_id, op FROM (
    SELECT 'sales_order'::text AS entity, r."id" AS entity_id, r."branchId" AS branch_id, CASE WHEN TG_OP = 'DELETE' THEN 'delete' ELSE 'upsert' END AS op
    UNION SELECT 'customer', c.id, c."branchId", 'upsert' FROM customers c WHERE c.id = r."customerId"
  ) AS targets(entity, entity_id, branch_id, op) WHERE entity_id IS NOT NULL;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER sync_changes_sales_orders
AFTER INSERT OR UPDATE OR DELETE ON "sales_orders"
FOR EACH ROW EXECUTE FUNCTION sync_capture_sales_orders();

CREATE FUNCTION sync_capture_sales_order_items() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r sales_order_items%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock_shared(74103, 1);
  IF TG_OP = 'DELETE' THEN r := OLD; ELSE r := NEW; END IF;
  INSERT INTO sync_changes (entity, entity_id, branch_id, op)
  SELECT DISTINCT entity, entity_id, branch_id, op FROM (
    SELECT 'sales_order'::text AS entity, r."salesOrderId" AS entity_id, (SELECT o."branchId" FROM sales_orders o WHERE o.id = r."salesOrderId") AS branch_id, 'upsert'::text AS op
  ) AS targets(entity, entity_id, branch_id, op) WHERE entity_id IS NOT NULL;
  -- Reparenting invalidates the former owner as well, including branch transfers.
  IF TG_OP = 'UPDATE' AND ROW(OLD."salesOrderId") IS DISTINCT FROM ROW(NEW."salesOrderId") THEN
    r := OLD;
    INSERT INTO sync_changes (entity, entity_id, branch_id, op)
  SELECT DISTINCT entity, entity_id, branch_id, op FROM (
    SELECT 'sales_order'::text AS entity, r."salesOrderId" AS entity_id, (SELECT o."branchId" FROM sales_orders o WHERE o.id = r."salesOrderId") AS branch_id, 'upsert'::text AS op
  ) AS targets(entity, entity_id, branch_id, op) WHERE entity_id IS NOT NULL;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER sync_changes_sales_order_items
AFTER INSERT OR UPDATE OR DELETE ON "sales_order_items"
FOR EACH ROW EXECUTE FUNCTION sync_capture_sales_order_items();

CREATE FUNCTION sync_capture_sales_order_stock_fulfillments() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r sales_order_stock_fulfillments%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock_shared(74103, 1);
  IF TG_OP = 'DELETE' THEN r := OLD; ELSE r := NEW; END IF;
  INSERT INTO sync_changes (entity, entity_id, branch_id, op)
  SELECT DISTINCT entity, entity_id, branch_id, op FROM (
    SELECT 'sales_order'::text AS entity, r."salesOrderId" AS entity_id, (SELECT o."branchId" FROM sales_orders o WHERE o.id = r."salesOrderId") AS branch_id, 'upsert'::text AS op
  ) AS targets(entity, entity_id, branch_id, op) WHERE entity_id IS NOT NULL;
  -- Reparenting invalidates the former owner as well, including branch transfers.
  IF TG_OP = 'UPDATE' AND ROW(OLD."salesOrderId") IS DISTINCT FROM ROW(NEW."salesOrderId") THEN
    r := OLD;
    INSERT INTO sync_changes (entity, entity_id, branch_id, op)
  SELECT DISTINCT entity, entity_id, branch_id, op FROM (
    SELECT 'sales_order'::text AS entity, r."salesOrderId" AS entity_id, (SELECT o."branchId" FROM sales_orders o WHERE o.id = r."salesOrderId") AS branch_id, 'upsert'::text AS op
  ) AS targets(entity, entity_id, branch_id, op) WHERE entity_id IS NOT NULL;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER sync_changes_sales_order_stock_fulfillments
AFTER INSERT OR UPDATE OR DELETE ON "sales_order_stock_fulfillments"
FOR EACH ROW EXECUTE FUNCTION sync_capture_sales_order_stock_fulfillments();

CREATE FUNCTION sync_capture_sales_returns() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r sales_returns%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock_shared(74103, 1);
  IF TG_OP = 'DELETE' THEN r := OLD; ELSE r := NEW; END IF;
  INSERT INTO sync_changes (entity, entity_id, branch_id, op)
  SELECT DISTINCT entity, entity_id, branch_id, op FROM (
    SELECT 'sales_order'::text AS entity, r."salesOrderId" AS entity_id, r."branchId" AS branch_id, 'upsert'::text AS op
    UNION SELECT 'customer', c.id, c."branchId", 'upsert' FROM customers c WHERE c.id = r."customerId"
  ) AS targets(entity, entity_id, branch_id, op) WHERE entity_id IS NOT NULL;
  -- Reparenting invalidates the former owner as well, including branch transfers.
  IF TG_OP = 'UPDATE' AND ROW(OLD."salesOrderId", OLD."customerId", OLD."branchId") IS DISTINCT FROM ROW(NEW."salesOrderId", NEW."customerId", NEW."branchId") THEN
    r := OLD;
    INSERT INTO sync_changes (entity, entity_id, branch_id, op)
  SELECT DISTINCT entity, entity_id, branch_id, op FROM (
    SELECT 'sales_order'::text AS entity, r."salesOrderId" AS entity_id, r."branchId" AS branch_id, 'upsert'::text AS op
    UNION SELECT 'customer', c.id, c."branchId", 'upsert' FROM customers c WHERE c.id = r."customerId"
  ) AS targets(entity, entity_id, branch_id, op) WHERE entity_id IS NOT NULL;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER sync_changes_sales_returns
AFTER INSERT OR UPDATE OR DELETE ON "sales_returns"
FOR EACH ROW EXECUTE FUNCTION sync_capture_sales_returns();

CREATE FUNCTION sync_capture_sales_return_items() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r sales_return_items%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock_shared(74103, 1);
  IF TG_OP = 'DELETE' THEN r := OLD; ELSE r := NEW; END IF;
  INSERT INTO sync_changes (entity, entity_id, branch_id, op)
  SELECT DISTINCT entity, entity_id, branch_id, op FROM (
    SELECT 'customer', s."customerId", s."branchId", 'upsert' FROM sales_returns s WHERE s.id = r."salesReturnId"
    UNION SELECT 'sales_order', s."salesOrderId", s."branchId", 'upsert' FROM sales_returns s WHERE s.id = r."salesReturnId"
  ) AS targets(entity, entity_id, branch_id, op) WHERE entity_id IS NOT NULL;
  -- Reparenting invalidates the former owner as well, including branch transfers.
  IF TG_OP = 'UPDATE' AND ROW(OLD."salesReturnId") IS DISTINCT FROM ROW(NEW."salesReturnId") THEN
    r := OLD;
    INSERT INTO sync_changes (entity, entity_id, branch_id, op)
  SELECT DISTINCT entity, entity_id, branch_id, op FROM (
    SELECT 'customer', s."customerId", s."branchId", 'upsert' FROM sales_returns s WHERE s.id = r."salesReturnId"
    UNION SELECT 'sales_order', s."salesOrderId", s."branchId", 'upsert' FROM sales_returns s WHERE s.id = r."salesReturnId"
  ) AS targets(entity, entity_id, branch_id, op) WHERE entity_id IS NOT NULL;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER sync_changes_sales_return_items
AFTER INSERT OR UPDATE OR DELETE ON "sales_return_items"
FOR EACH ROW EXECUTE FUNCTION sync_capture_sales_return_items();

CREATE FUNCTION sync_capture_sales_return_receivable_allocations() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r sales_return_receivable_allocations%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock_shared(74103, 1);
  IF TG_OP = 'DELETE' THEN r := OLD; ELSE r := NEW; END IF;
  INSERT INTO sync_changes (entity, entity_id, branch_id, op)
  SELECT DISTINCT entity, entity_id, branch_id, op FROM (
    SELECT 'customer', s."customerId", s."branchId", 'upsert' FROM sales_returns s WHERE s.id = r."salesReturnId"
    UNION SELECT 'sales_order', s."salesOrderId", s."branchId", 'upsert' FROM sales_returns s WHERE s.id = r."salesReturnId"
    UNION SELECT 'customer', d."customerId", d."branchId", 'upsert' FROM debts d WHERE d.id = r."debtId"
    UNION SELECT 'sales_order', o.id, o."branchId", 'upsert' FROM sales_orders o WHERE o."debtId" = r."debtId"
    UNION SELECT 'customer', p."customerId", p."branchId", 'upsert' FROM installments i JOIN installment_plans p ON p.id = i."installmentPlanId" WHERE i.id = r."installmentId"
    UNION SELECT 'sales_order', o.id, o."branchId", 'upsert' FROM installments i JOIN sales_orders o ON o."installmentPlanId" = i."installmentPlanId" WHERE i.id = r."installmentId"
  ) AS targets(entity, entity_id, branch_id, op) WHERE entity_id IS NOT NULL;
  -- Reparenting invalidates the former owner as well, including branch transfers.
  IF TG_OP = 'UPDATE' AND ROW(OLD."salesReturnId", OLD."debtId", OLD."installmentId") IS DISTINCT FROM ROW(NEW."salesReturnId", NEW."debtId", NEW."installmentId") THEN
    r := OLD;
    INSERT INTO sync_changes (entity, entity_id, branch_id, op)
  SELECT DISTINCT entity, entity_id, branch_id, op FROM (
    SELECT 'customer', s."customerId", s."branchId", 'upsert' FROM sales_returns s WHERE s.id = r."salesReturnId"
    UNION SELECT 'sales_order', s."salesOrderId", s."branchId", 'upsert' FROM sales_returns s WHERE s.id = r."salesReturnId"
    UNION SELECT 'customer', d."customerId", d."branchId", 'upsert' FROM debts d WHERE d.id = r."debtId"
    UNION SELECT 'sales_order', o.id, o."branchId", 'upsert' FROM sales_orders o WHERE o."debtId" = r."debtId"
    UNION SELECT 'customer', p."customerId", p."branchId", 'upsert' FROM installments i JOIN installment_plans p ON p.id = i."installmentPlanId" WHERE i.id = r."installmentId"
    UNION SELECT 'sales_order', o.id, o."branchId", 'upsert' FROM installments i JOIN sales_orders o ON o."installmentPlanId" = i."installmentPlanId" WHERE i.id = r."installmentId"
  ) AS targets(entity, entity_id, branch_id, op) WHERE entity_id IS NOT NULL;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER sync_changes_sales_return_receivable_allocations
AFTER INSERT OR UPDATE OR DELETE ON "sales_return_receivable_allocations"
FOR EACH ROW EXECUTE FUNCTION sync_capture_sales_return_receivable_allocations();

CREATE FUNCTION sync_capture_cash_refunds() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r cash_refunds%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock_shared(74103, 1);
  IF TG_OP = 'DELETE' THEN r := OLD; ELSE r := NEW; END IF;
  INSERT INTO sync_changes (entity, entity_id, branch_id, op)
  SELECT DISTINCT entity, entity_id, branch_id, op FROM (
    SELECT 'customer'::text AS entity, r."customerId" AS entity_id, r."branchId" AS branch_id, 'upsert'::text AS op
    UNION SELECT 'customer', s."customerId", s."branchId", 'upsert' FROM sales_returns s WHERE s.id = r."salesReturnId"
    UNION SELECT 'sales_order', s."salesOrderId", s."branchId", 'upsert' FROM sales_returns s WHERE s.id = r."salesReturnId"
  ) AS targets(entity, entity_id, branch_id, op) WHERE entity_id IS NOT NULL;
  -- Reparenting invalidates the former owner as well, including branch transfers.
  IF TG_OP = 'UPDATE' AND ROW(OLD."customerId", OLD."salesReturnId", OLD."branchId") IS DISTINCT FROM ROW(NEW."customerId", NEW."salesReturnId", NEW."branchId") THEN
    r := OLD;
    INSERT INTO sync_changes (entity, entity_id, branch_id, op)
  SELECT DISTINCT entity, entity_id, branch_id, op FROM (
    SELECT 'customer'::text AS entity, r."customerId" AS entity_id, r."branchId" AS branch_id, 'upsert'::text AS op
    UNION SELECT 'customer', s."customerId", s."branchId", 'upsert' FROM sales_returns s WHERE s.id = r."salesReturnId"
    UNION SELECT 'sales_order', s."salesOrderId", s."branchId", 'upsert' FROM sales_returns s WHERE s.id = r."salesReturnId"
  ) AS targets(entity, entity_id, branch_id, op) WHERE entity_id IS NOT NULL;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER sync_changes_cash_refunds
AFTER INSERT OR UPDATE OR DELETE ON "cash_refunds"
FOR EACH ROW EXECUTE FUNCTION sync_capture_cash_refunds();

CREATE FUNCTION sync_capture_customer_credits() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r customer_credits%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock_shared(74103, 1);
  IF TG_OP = 'DELETE' THEN r := OLD; ELSE r := NEW; END IF;
  INSERT INTO sync_changes (entity, entity_id, branch_id, op)
  SELECT DISTINCT entity, entity_id, branch_id, op FROM (
    SELECT 'customer'::text AS entity, r."customerId" AS entity_id, r."branchId" AS branch_id, 'upsert'::text AS op
    UNION SELECT 'customer', s."customerId", s."branchId", 'upsert' FROM sales_returns s WHERE s.id = r."salesReturnId"
    UNION SELECT 'sales_order', s."salesOrderId", s."branchId", 'upsert' FROM sales_returns s WHERE s.id = r."salesReturnId"
  ) AS targets(entity, entity_id, branch_id, op) WHERE entity_id IS NOT NULL;
  -- Reparenting invalidates the former owner as well, including branch transfers.
  IF TG_OP = 'UPDATE' AND ROW(OLD."customerId", OLD."salesReturnId", OLD."branchId") IS DISTINCT FROM ROW(NEW."customerId", NEW."salesReturnId", NEW."branchId") THEN
    r := OLD;
    INSERT INTO sync_changes (entity, entity_id, branch_id, op)
  SELECT DISTINCT entity, entity_id, branch_id, op FROM (
    SELECT 'customer'::text AS entity, r."customerId" AS entity_id, r."branchId" AS branch_id, 'upsert'::text AS op
    UNION SELECT 'customer', s."customerId", s."branchId", 'upsert' FROM sales_returns s WHERE s.id = r."salesReturnId"
    UNION SELECT 'sales_order', s."salesOrderId", s."branchId", 'upsert' FROM sales_returns s WHERE s.id = r."salesReturnId"
  ) AS targets(entity, entity_id, branch_id, op) WHERE entity_id IS NOT NULL;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER sync_changes_customer_credits
AFTER INSERT OR UPDATE OR DELETE ON "customer_credits"
FOR EACH ROW EXECUTE FUNCTION sync_capture_customer_credits();

CREATE FUNCTION sync_capture_customer_credit_applications() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r customer_credit_applications%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock_shared(74103, 1);
  IF TG_OP = 'DELETE' THEN r := OLD; ELSE r := NEW; END IF;
  INSERT INTO sync_changes (entity, entity_id, branch_id, op)
  SELECT DISTINCT entity, entity_id, branch_id, op FROM (
    SELECT 'customer', c.id, c."branchId", 'upsert' FROM customers c WHERE c.id = r."customerId"
    UNION SELECT 'sales_order', o.id, o."branchId", 'upsert' FROM sales_orders o WHERE o.id = r."salesOrderId"
    UNION SELECT 'customer', d."customerId", d."branchId", 'upsert' FROM debts d WHERE d.id = r."debtId"
    UNION SELECT 'sales_order', o.id, o."branchId", 'upsert' FROM sales_orders o WHERE o."debtId" = r."debtId"
    UNION SELECT 'customer', p."customerId", p."branchId", 'upsert' FROM installments i JOIN installment_plans p ON p.id = i."installmentPlanId" WHERE i.id = r."installmentId"
    UNION SELECT 'sales_order', o.id, o."branchId", 'upsert' FROM installments i JOIN sales_orders o ON o."installmentPlanId" = i."installmentPlanId" WHERE i.id = r."installmentId"
  ) AS targets(entity, entity_id, branch_id, op) WHERE entity_id IS NOT NULL;
  -- Reparenting invalidates the former owner as well, including branch transfers.
  IF TG_OP = 'UPDATE' AND ROW(OLD."customerId", OLD."salesOrderId", OLD."debtId", OLD."installmentId") IS DISTINCT FROM ROW(NEW."customerId", NEW."salesOrderId", NEW."debtId", NEW."installmentId") THEN
    r := OLD;
    INSERT INTO sync_changes (entity, entity_id, branch_id, op)
  SELECT DISTINCT entity, entity_id, branch_id, op FROM (
    SELECT 'customer', c.id, c."branchId", 'upsert' FROM customers c WHERE c.id = r."customerId"
    UNION SELECT 'sales_order', o.id, o."branchId", 'upsert' FROM sales_orders o WHERE o.id = r."salesOrderId"
    UNION SELECT 'customer', d."customerId", d."branchId", 'upsert' FROM debts d WHERE d.id = r."debtId"
    UNION SELECT 'sales_order', o.id, o."branchId", 'upsert' FROM sales_orders o WHERE o."debtId" = r."debtId"
    UNION SELECT 'customer', p."customerId", p."branchId", 'upsert' FROM installments i JOIN installment_plans p ON p.id = i."installmentPlanId" WHERE i.id = r."installmentId"
    UNION SELECT 'sales_order', o.id, o."branchId", 'upsert' FROM installments i JOIN sales_orders o ON o."installmentPlanId" = i."installmentPlanId" WHERE i.id = r."installmentId"
  ) AS targets(entity, entity_id, branch_id, op) WHERE entity_id IS NOT NULL;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER sync_changes_customer_credit_applications
AFTER INSERT OR UPDATE OR DELETE ON "customer_credit_applications"
FOR EACH ROW EXECUTE FUNCTION sync_capture_customer_credit_applications();

CREATE FUNCTION sync_capture_suppliers() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r suppliers%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock_shared(74103, 1);
  IF TG_OP = 'DELETE' THEN r := OLD; ELSE r := NEW; END IF;
  INSERT INTO sync_changes (entity, entity_id, branch_id, op)
  SELECT DISTINCT entity, entity_id, branch_id, op FROM (
    SELECT 'supplier'::text AS entity, r."id" AS entity_id, r."branchId" AS branch_id, CASE WHEN TG_OP = 'DELETE' THEN 'delete' ELSE 'upsert' END AS op
    UNION SELECT 'supplier_bill', COALESCE(b."billGroupId", b.id), b."branchId", 'upsert' FROM supplier_receiving_receipts b WHERE b."supplierId" = r.id AND b."deletedAt" IS NULL AND b."replacedAt" IS NULL
  ) AS targets(entity, entity_id, branch_id, op) WHERE entity_id IS NOT NULL;
  -- Reparenting invalidates the former owner as well, including branch transfers.
  IF TG_OP = 'UPDATE' AND ROW(OLD."id", OLD."branchId") IS DISTINCT FROM ROW(NEW."id", NEW."branchId") THEN
    r := OLD;
    INSERT INTO sync_changes (entity, entity_id, branch_id, op)
  SELECT DISTINCT entity, entity_id, branch_id, op FROM (
    SELECT 'supplier'::text AS entity, r."id" AS entity_id, r."branchId" AS branch_id, CASE WHEN TG_OP = 'DELETE' THEN 'delete' ELSE 'upsert' END AS op
    UNION SELECT 'supplier_bill', COALESCE(b."billGroupId", b.id), b."branchId", 'upsert' FROM supplier_receiving_receipts b WHERE b."supplierId" = r.id AND b."deletedAt" IS NULL AND b."replacedAt" IS NULL
  ) AS targets(entity, entity_id, branch_id, op) WHERE entity_id IS NOT NULL;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER sync_changes_suppliers
AFTER INSERT OR UPDATE OR DELETE ON "suppliers"
FOR EACH ROW EXECUTE FUNCTION sync_capture_suppliers();

CREATE FUNCTION sync_capture_supplier_transactions() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r supplier_transactions%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock_shared(74103, 1);
  IF TG_OP = 'DELETE' THEN r := OLD; ELSE r := NEW; END IF;
  INSERT INTO sync_changes (entity, entity_id, branch_id, op)
  SELECT DISTINCT entity, entity_id, branch_id, op FROM (
    SELECT 'supplier'::text AS entity, r."supplierId" AS entity_id, r."branchId" AS branch_id, 'upsert'::text AS op
  ) AS targets(entity, entity_id, branch_id, op) WHERE entity_id IS NOT NULL;
  -- Reparenting invalidates the former owner as well, including branch transfers.
  IF TG_OP = 'UPDATE' AND ROW(OLD."supplierId", OLD."branchId") IS DISTINCT FROM ROW(NEW."supplierId", NEW."branchId") THEN
    r := OLD;
    INSERT INTO sync_changes (entity, entity_id, branch_id, op)
  SELECT DISTINCT entity, entity_id, branch_id, op FROM (
    SELECT 'supplier'::text AS entity, r."supplierId" AS entity_id, r."branchId" AS branch_id, 'upsert'::text AS op
  ) AS targets(entity, entity_id, branch_id, op) WHERE entity_id IS NOT NULL;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER sync_changes_supplier_transactions
AFTER INSERT OR UPDATE OR DELETE ON "supplier_transactions"
FOR EACH ROW EXECUTE FUNCTION sync_capture_supplier_transactions();

CREATE FUNCTION sync_capture_supplier_receivings() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r supplier_receivings%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock_shared(74103, 1);
  IF TG_OP = 'DELETE' THEN r := OLD; ELSE r := NEW; END IF;
  INSERT INTO sync_changes (entity, entity_id, branch_id, op)
  SELECT DISTINCT entity, entity_id, branch_id, op FROM (
    SELECT 'supplier'::text AS entity, r."supplierId" AS entity_id, r."branchId" AS branch_id, 'upsert'::text AS op
  ) AS targets(entity, entity_id, branch_id, op) WHERE entity_id IS NOT NULL;
  -- Reparenting invalidates the former owner as well, including branch transfers.
  IF TG_OP = 'UPDATE' AND ROW(OLD."supplierId", OLD."branchId") IS DISTINCT FROM ROW(NEW."supplierId", NEW."branchId") THEN
    r := OLD;
    INSERT INTO sync_changes (entity, entity_id, branch_id, op)
  SELECT DISTINCT entity, entity_id, branch_id, op FROM (
    SELECT 'supplier'::text AS entity, r."supplierId" AS entity_id, r."branchId" AS branch_id, 'upsert'::text AS op
  ) AS targets(entity, entity_id, branch_id, op) WHERE entity_id IS NOT NULL;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER sync_changes_supplier_receivings
AFTER INSERT OR UPDATE OR DELETE ON "supplier_receivings"
FOR EACH ROW EXECUTE FUNCTION sync_capture_supplier_receivings();

CREATE FUNCTION sync_capture_supplier_receiving_receipts() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r supplier_receiving_receipts%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock_shared(74103, 1);
  IF TG_OP = 'DELETE' THEN r := OLD; ELSE r := NEW; END IF;
  INSERT INTO sync_changes (entity, entity_id, branch_id, op)
  SELECT DISTINCT entity, entity_id, branch_id, op FROM (
    SELECT 'supplier_bill'::text AS entity, COALESCE(r."billGroupId", r.id) AS entity_id, r."branchId" AS branch_id, 'upsert'::text AS op
  ) AS targets(entity, entity_id, branch_id, op) WHERE entity_id IS NOT NULL;
  -- Reparenting invalidates the former owner as well, including branch transfers.
  IF TG_OP = 'UPDATE' AND ROW(OLD."id", OLD."billGroupId", OLD."branchId") IS DISTINCT FROM ROW(NEW."id", NEW."billGroupId", NEW."branchId") THEN
    r := OLD;
    INSERT INTO sync_changes (entity, entity_id, branch_id, op)
  SELECT DISTINCT entity, entity_id, branch_id, op FROM (
    SELECT 'supplier_bill'::text AS entity, COALESCE(r."billGroupId", r.id) AS entity_id, r."branchId" AS branch_id, 'upsert'::text AS op
  ) AS targets(entity, entity_id, branch_id, op) WHERE entity_id IS NOT NULL;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER sync_changes_supplier_receiving_receipts
AFTER INSERT OR UPDATE OR DELETE ON "supplier_receiving_receipts"
FOR EACH ROW EXECUTE FUNCTION sync_capture_supplier_receiving_receipts();

CREATE FUNCTION sync_capture_branches() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r branches%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock_shared(74103, 1);
  IF TG_OP = 'DELETE' THEN r := OLD; ELSE r := NEW; END IF;
  INSERT INTO sync_changes (entity, entity_id, branch_id, op)
  SELECT DISTINCT entity, entity_id, branch_id, op FROM (
    SELECT 'branch'::text AS entity, r."id" AS entity_id, r.id AS branch_id, CASE WHEN TG_OP = 'DELETE' THEN 'delete' ELSE 'upsert' END AS op
    UNION SELECT 'sales_order', o.id, o."branchId", 'upsert' FROM sales_orders o
  ) AS targets(entity, entity_id, branch_id, op) WHERE entity_id IS NOT NULL;
  -- Reparenting invalidates the former owner as well, including branch transfers.
  IF TG_OP = 'UPDATE' AND ROW(OLD."id") IS DISTINCT FROM ROW(NEW."id") THEN
    r := OLD;
    INSERT INTO sync_changes (entity, entity_id, branch_id, op)
  SELECT DISTINCT entity, entity_id, branch_id, op FROM (
    SELECT 'branch'::text AS entity, r."id" AS entity_id, r.id AS branch_id, CASE WHEN TG_OP = 'DELETE' THEN 'delete' ELSE 'upsert' END AS op
    UNION SELECT 'sales_order', o.id, o."branchId", 'upsert' FROM sales_orders o
  ) AS targets(entity, entity_id, branch_id, op) WHERE entity_id IS NOT NULL;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER sync_changes_branches
AFTER INSERT OR UPDATE OR DELETE ON "branches"
FOR EACH ROW EXECUTE FUNCTION sync_capture_branches();

CREATE FUNCTION sync_capture_categories() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r categories%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock_shared(74103, 1);
  IF TG_OP = 'DELETE' THEN r := OLD; ELSE r := NEW; END IF;
  INSERT INTO sync_changes (entity, entity_id, branch_id, op)
  SELECT DISTINCT entity, entity_id, branch_id, op FROM (
    SELECT 'category'::text AS entity, r."id" AS entity_id, NULL::uuid AS branch_id, CASE WHEN TG_OP = 'DELETE' THEN 'delete' ELSE 'upsert' END AS op
    UNION SELECT 'product', p.id, NULL::uuid, 'upsert' FROM products p
    UNION SELECT 'category', c.id, NULL::uuid, 'upsert' FROM categories c WHERE c.id <> r.id
  ) AS targets(entity, entity_id, branch_id, op) WHERE entity_id IS NOT NULL;
  -- Reparenting invalidates the former owner as well, including branch transfers.
  IF TG_OP = 'UPDATE' AND ROW(OLD."id") IS DISTINCT FROM ROW(NEW."id") THEN
    r := OLD;
    INSERT INTO sync_changes (entity, entity_id, branch_id, op)
  SELECT DISTINCT entity, entity_id, branch_id, op FROM (
    SELECT 'category'::text AS entity, r."id" AS entity_id, NULL::uuid AS branch_id, CASE WHEN TG_OP = 'DELETE' THEN 'delete' ELSE 'upsert' END AS op
    UNION SELECT 'product', p.id, NULL::uuid, 'upsert' FROM products p
    UNION SELECT 'category', c.id, NULL::uuid, 'upsert' FROM categories c WHERE c.id <> r.id
  ) AS targets(entity, entity_id, branch_id, op) WHERE entity_id IS NOT NULL;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER sync_changes_categories
AFTER INSERT OR UPDATE OR DELETE ON "categories"
FOR EACH ROW EXECUTE FUNCTION sync_capture_categories();

CREATE FUNCTION sync_capture_users() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r users%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock_shared(74103, 1);
  IF TG_OP = 'DELETE' THEN r := OLD; ELSE r := NEW; END IF;
  INSERT INTO sync_changes (entity, entity_id, branch_id, op)
  SELECT DISTINCT entity, entity_id, branch_id, op FROM (
    SELECT 'user'::text AS entity, r."id" AS entity_id, NULL::uuid AS branch_id, CASE WHEN TG_OP = 'DELETE' THEN 'delete' ELSE 'upsert' END AS op

    UNION SELECT 'product', p.id, NULL::uuid, 'upsert' FROM products p WHERE (TG_OP <> 'UPDATE' OR ROW(OLD.username, OLD."fullName") IS DISTINCT FROM ROW(NEW.username, NEW."fullName")) AND (p."createdById" = r.id OR p."updatedById" = r.id)
    UNION SELECT 'supplier', s.id, s."branchId", 'upsert' FROM suppliers s WHERE (TG_OP <> 'UPDATE' OR ROW(OLD.username, OLD."fullName") IS DISTINCT FROM ROW(NEW.username, NEW."fullName")) AND (s."createdById" = r.id OR s."updatedById" = r.id)
    UNION SELECT 'sales_order', o.id, o."branchId", 'upsert' FROM sales_orders o WHERE (TG_OP <> 'UPDATE' OR ROW(OLD.username, OLD."fullName") IS DISTINCT FROM ROW(NEW.username, NEW."fullName")) AND (o."createdById" = r.id OR o."updatedById" = r.id OR o."cancelledById" = r.id)
  ) AS targets(entity, entity_id, branch_id, op) WHERE entity_id IS NOT NULL;
  -- Reparenting invalidates the former owner as well, including branch transfers.
  IF TG_OP = 'UPDATE' AND ROW(OLD."id") IS DISTINCT FROM ROW(NEW."id") THEN
    r := OLD;
    INSERT INTO sync_changes (entity, entity_id, branch_id, op)
  SELECT DISTINCT entity, entity_id, branch_id, op FROM (
    SELECT 'user'::text AS entity, r."id" AS entity_id, NULL::uuid AS branch_id, CASE WHEN TG_OP = 'DELETE' THEN 'delete' ELSE 'upsert' END AS op

    UNION SELECT 'product', p.id, NULL::uuid, 'upsert' FROM products p WHERE (TG_OP <> 'UPDATE' OR ROW(OLD.username, OLD."fullName") IS DISTINCT FROM ROW(NEW.username, NEW."fullName")) AND (p."createdById" = r.id OR p."updatedById" = r.id)
    UNION SELECT 'supplier', s.id, s."branchId", 'upsert' FROM suppliers s WHERE (TG_OP <> 'UPDATE' OR ROW(OLD.username, OLD."fullName") IS DISTINCT FROM ROW(NEW.username, NEW."fullName")) AND (s."createdById" = r.id OR s."updatedById" = r.id)
    UNION SELECT 'sales_order', o.id, o."branchId", 'upsert' FROM sales_orders o WHERE (TG_OP <> 'UPDATE' OR ROW(OLD.username, OLD."fullName") IS DISTINCT FROM ROW(NEW.username, NEW."fullName")) AND (o."createdById" = r.id OR o."updatedById" = r.id OR o."cancelledById" = r.id)
  ) AS targets(entity, entity_id, branch_id, op) WHERE entity_id IS NOT NULL;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER sync_changes_users
AFTER INSERT OR UPDATE OR DELETE ON "users"
FOR EACH ROW EXECUTE FUNCTION sync_capture_users();

CREATE FUNCTION sync_capture_user_branch_access() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r user_branch_access%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock_shared(74103, 1);
  IF TG_OP = 'DELETE' THEN r := OLD; ELSE r := NEW; END IF;
  INSERT INTO sync_changes (entity, entity_id, branch_id, op)
  SELECT DISTINCT entity, entity_id, branch_id, op FROM (
    SELECT 'user'::text AS entity, r."userId" AS entity_id, NULL::uuid AS branch_id, 'upsert'::text AS op
  ) AS targets(entity, entity_id, branch_id, op) WHERE entity_id IS NOT NULL;
  -- Reparenting invalidates the former owner as well, including branch transfers.
  IF TG_OP = 'UPDATE' AND ROW(OLD."userId", OLD."branchId") IS DISTINCT FROM ROW(NEW."userId", NEW."branchId") THEN
    r := OLD;
    INSERT INTO sync_changes (entity, entity_id, branch_id, op)
  SELECT DISTINCT entity, entity_id, branch_id, op FROM (
    SELECT 'user'::text AS entity, r."userId" AS entity_id, NULL::uuid AS branch_id, 'upsert'::text AS op
  ) AS targets(entity, entity_id, branch_id, op) WHERE entity_id IS NOT NULL;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER sync_changes_user_branch_access
AFTER INSERT OR UPDATE OR DELETE ON "user_branch_access"
FOR EACH ROW EXECUTE FUNCTION sync_capture_user_branch_access();

CREATE FUNCTION sync_capture_pricing_presets() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r pricing_presets%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock_shared(74103, 1);
  IF TG_OP = 'DELETE' THEN r := OLD; ELSE r := NEW; END IF;
  INSERT INTO sync_changes (entity, entity_id, branch_id, op)
  SELECT DISTINCT entity, entity_id, branch_id, op FROM (
    SELECT 'product'::text AS entity, p.id AS entity_id, NULL::uuid AS branch_id, 'upsert'::text AS op FROM products p
  ) AS targets(entity, entity_id, branch_id, op) WHERE entity_id IS NOT NULL;
  -- Reparenting invalidates the former owner as well, including branch transfers.
  IF TG_OP = 'UPDATE' AND ROW(OLD."id") IS DISTINCT FROM ROW(NEW."id") THEN
    r := OLD;
    INSERT INTO sync_changes (entity, entity_id, branch_id, op)
  SELECT DISTINCT entity, entity_id, branch_id, op FROM (
    SELECT 'product'::text AS entity, p.id AS entity_id, NULL::uuid AS branch_id, 'upsert'::text AS op FROM products p
  ) AS targets(entity, entity_id, branch_id, op) WHERE entity_id IS NOT NULL;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER sync_changes_pricing_presets
AFTER INSERT OR UPDATE OR DELETE ON "pricing_presets"
FOR EACH ROW EXECUTE FUNCTION sync_capture_pricing_presets();

CREATE FUNCTION sync_capture_tax_profiles() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r tax_profiles%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock_shared(74103, 1);
  IF TG_OP = 'DELETE' THEN r := OLD; ELSE r := NEW; END IF;
  INSERT INTO sync_changes (entity, entity_id, branch_id, op)
  SELECT DISTINCT entity, entity_id, branch_id, op FROM (
    SELECT 'product'::text AS entity, p.id AS entity_id, NULL::uuid AS branch_id, 'upsert'::text AS op FROM products p
  ) AS targets(entity, entity_id, branch_id, op) WHERE entity_id IS NOT NULL;
  -- Reparenting invalidates the former owner as well, including branch transfers.
  IF TG_OP = 'UPDATE' AND ROW(OLD."id") IS DISTINCT FROM ROW(NEW."id") THEN
    r := OLD;
    INSERT INTO sync_changes (entity, entity_id, branch_id, op)
  SELECT DISTINCT entity, entity_id, branch_id, op FROM (
    SELECT 'product'::text AS entity, p.id AS entity_id, NULL::uuid AS branch_id, 'upsert'::text AS op FROM products p
  ) AS targets(entity, entity_id, branch_id, op) WHERE entity_id IS NOT NULL;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER sync_changes_tax_profiles
AFTER INSERT OR UPDATE OR DELETE ON "tax_profiles"
FOR EACH ROW EXECUTE FUNCTION sync_capture_tax_profiles();

CREATE FUNCTION sync_capture_tax_rates() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r tax_rates%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock_shared(74103, 1);
  IF TG_OP = 'DELETE' THEN r := OLD; ELSE r := NEW; END IF;
  INSERT INTO sync_changes (entity, entity_id, branch_id, op)
  SELECT DISTINCT entity, entity_id, branch_id, op FROM (
    SELECT 'product'::text AS entity, p.id AS entity_id, NULL::uuid AS branch_id, 'upsert'::text AS op FROM products p
  ) AS targets(entity, entity_id, branch_id, op) WHERE entity_id IS NOT NULL;
  -- Reparenting invalidates the former owner as well, including branch transfers.
  IF TG_OP = 'UPDATE' AND ROW(OLD."id") IS DISTINCT FROM ROW(NEW."id") THEN
    r := OLD;
    INSERT INTO sync_changes (entity, entity_id, branch_id, op)
  SELECT DISTINCT entity, entity_id, branch_id, op FROM (
    SELECT 'product'::text AS entity, p.id AS entity_id, NULL::uuid AS branch_id, 'upsert'::text AS op FROM products p
  ) AS targets(entity, entity_id, branch_id, op) WHERE entity_id IS NOT NULL;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER sync_changes_tax_rates
AFTER INSERT OR UPDATE OR DELETE ON "tax_rates"
FOR EACH ROW EXECUTE FUNCTION sync_capture_tax_rates();

COMMIT;
