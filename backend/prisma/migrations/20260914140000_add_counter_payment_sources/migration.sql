-- New receipts only: nullable walk-in ownership and additive source metadata.
-- No historical Payment/order rewrite or backfill.
ALTER TABLE "payments" ALTER COLUMN "customerId" DROP NOT NULL;
ALTER TABLE "payments" ADD COLUMN "salesOrderId" UUID,
  ADD COLUMN "sourceSnapshot" JSONB,
  ADD COLUMN "idempotencyFingerprint" TEXT;
ALTER TABLE "sales_orders" ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "idempotencyFingerprint" TEXT;
CREATE UNIQUE INDEX "sales_orders_idempotencyKey_key" ON "sales_orders"("idempotencyKey");
CREATE INDEX "payments_salesOrderId_idx" ON "payments"("salesOrderId");
ALTER TABLE "payments" ADD CONSTRAINT "payments_salesOrderId_fkey"
  FOREIGN KEY ("salesOrderId") REFERENCES "sales_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_walk_in_source_check"
  CHECK ("customerId" IS NOT NULL OR "salesOrderId" IS NOT NULL);
ALTER TABLE "payments" ADD CONSTRAINT "payments_counter_snapshot_check"
  CHECK ("salesOrderId" IS NULL OR "sourceSnapshot" IS NOT NULL);

CREATE FUNCTION validate_counter_payment_customer() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_customer UUID;
BEGIN
  IF NEW."salesOrderId" IS NOT NULL THEN
    SELECT "customerId" INTO source_customer FROM "sales_orders" WHERE "id" = NEW."salesOrderId" FOR SHARE;
    IF NOT FOUND OR source_customer IS DISTINCT FROM NEW."customerId" THEN
      RAISE EXCEPTION 'Counter payment customer must match the source sale';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "counter_payment_customer_check" BEFORE INSERT OR UPDATE ON "payments"
  FOR EACH ROW EXECUTE FUNCTION validate_counter_payment_customer();

CREATE FUNCTION protect_counter_sale_customer() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."customerId" IS DISTINCT FROM OLD."customerId" AND EXISTS (
    SELECT 1 FROM "payments" WHERE "salesOrderId" = OLD."id"
  ) THEN
    RAISE EXCEPTION 'Cannot change the customer identity of a receipted sale';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "counter_sale_customer_check" BEFORE UPDATE ON "sales_orders"
  FOR EACH ROW EXECUTE FUNCTION protect_counter_sale_customer();
