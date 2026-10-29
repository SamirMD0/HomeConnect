-- Generated from the HEAD/ownership Prisma datamodel diff, then ordered for safe backfill.
-- One DO statement is atomic both in Prisma migrate deploy and the desktop runner's
-- outer transaction. No nested BEGIN/COMMIT can commit the runner's bookkeeping.
DO $ownership$
DECLARE
  historical_branch UUID;
  creator UUID;
  active_count INTEGER;
BEGIN
  -- Block concurrent creates/branch administration until guards and closure are installed.
  LOCK TABLE "users", "branches", "activity_logs", "customers", "suppliers", "sales_orders", "debts", "installment_plans", "payments", "sales_returns", "cash_refunds", "customer_credits", "supplier_transactions", "supplier_receivings", "service_jobs" IN ACCESS EXCLUSIVE MODE;
  IF EXISTS (SELECT 1 FROM "users" WHERE "branchId" IS NOT NULL) THEN
    RAISE EXCEPTION 'users.branchId contains non-null legacy values; stop and ask support to review their meaning before retrying';
  END IF;
  IF EXISTS (SELECT 1 FROM "customers" WHERE "branchId" IS NOT NULL) THEN
    RAISE EXCEPTION 'customers.branchId contains non-null legacy values; stop and ask support to review their meaning before retrying';
  END IF;
  IF EXISTS (SELECT 1 FROM "activity_logs" WHERE "branchId" IS NOT NULL) THEN
    RAISE EXCEPTION 'activity_logs.branchId contains non-null legacy values; stop and ask support to review their meaning before retrying';
  END IF;
  SELECT count(*) INTO active_count FROM "branches" WHERE "isActive" = true;
  IF active_count > 1 THEN
    RAISE EXCEPTION 'Multiple active branches exist; deactivate all but the branch that holds pre-branch history, then retry';
  ELSIF active_count = 1 THEN
    SELECT "id" INTO historical_branch FROM "branches" WHERE "isActive" = true;
  ELSE
    SELECT "id" INTO creator FROM "users"
      ORDER BY ("role" = 'ADMIN' AND "deletedAt" IS NULL) DESC, "createdAt" ASC, "id" ASC LIMIT 1;
    IF creator IS NOT NULL THEN
      IF EXISTS (SELECT 1 FROM "branches" WHERE "code" = 'MAIN' OR "name" = 'Main branch') THEN
        RAISE EXCEPTION 'No active branch exists, but MAIN or Main branch is already used; activate the historical branch or rename the inactive conflicting branch, then retry';
      END IF;
      historical_branch := md5('homeconnect:historical-main:' || creator::text)::uuid;
      INSERT INTO "branches" ("id", "code", "name", "createdById", "updatedAt")
        VALUES (historical_branch, 'MAIN', 'Main branch', creator, CURRENT_TIMESTAMP);
    ELSE
      IF EXISTS (SELECT 1 FROM "customers") THEN
        RAISE EXCEPTION 'Fresh-install invariant failed: customers contains history but no users exist; ask support to investigate';
      END IF;
      IF EXISTS (SELECT 1 FROM "suppliers") THEN
        RAISE EXCEPTION 'Fresh-install invariant failed: suppliers contains history but no users exist; ask support to investigate';
      END IF;
      IF EXISTS (SELECT 1 FROM "sales_orders") THEN
        RAISE EXCEPTION 'Fresh-install invariant failed: sales_orders contains history but no users exist; ask support to investigate';
      END IF;
      IF EXISTS (SELECT 1 FROM "debts") THEN
        RAISE EXCEPTION 'Fresh-install invariant failed: debts contains history but no users exist; ask support to investigate';
      END IF;
      IF EXISTS (SELECT 1 FROM "installment_plans") THEN
        RAISE EXCEPTION 'Fresh-install invariant failed: installment_plans contains history but no users exist; ask support to investigate';
      END IF;
      IF EXISTS (SELECT 1 FROM "payments") THEN
        RAISE EXCEPTION 'Fresh-install invariant failed: payments contains history but no users exist; ask support to investigate';
      END IF;
      IF EXISTS (SELECT 1 FROM "sales_returns") THEN
        RAISE EXCEPTION 'Fresh-install invariant failed: sales_returns contains history but no users exist; ask support to investigate';
      END IF;
      IF EXISTS (SELECT 1 FROM "cash_refunds") THEN
        RAISE EXCEPTION 'Fresh-install invariant failed: cash_refunds contains history but no users exist; ask support to investigate';
      END IF;
      IF EXISTS (SELECT 1 FROM "customer_credits") THEN
        RAISE EXCEPTION 'Fresh-install invariant failed: customer_credits contains history but no users exist; ask support to investigate';
      END IF;
      IF EXISTS (SELECT 1 FROM "supplier_transactions") THEN
        RAISE EXCEPTION 'Fresh-install invariant failed: supplier_transactions contains history but no users exist; ask support to investigate';
      END IF;
      IF EXISTS (SELECT 1 FROM "supplier_receivings") THEN
        RAISE EXCEPTION 'Fresh-install invariant failed: supplier_receivings contains history but no users exist; ask support to investigate';
      END IF;
      IF EXISTS (SELECT 1 FROM "service_jobs") THEN
        RAISE EXCEPTION 'Fresh-install invariant failed: service_jobs contains history but no users exist; ask support to investigate';
      END IF;
    END IF;
  END IF;

  -- D1: existing non-deleted employees worked in the one historical shop.
  -- Preserve any Phase 1 grant (including its original grantor and timestamp).
  IF historical_branch IS NOT NULL THEN
    INSERT INTO "user_branch_access" ("userId", "branchId", "grantedById")
      SELECT employee."id", historical_branch, branch."createdById"
      FROM "users" employee
      JOIN "branches" branch ON branch."id" = historical_branch
      WHERE employee."role" = 'EMPLOYEE' AND employee."deletedAt" IS NULL
      ON CONFLICT ("userId", "branchId") DO NOTHING;
  END IF;

  -- Keep customers.branchId in place; every other owned table gets a nullable column.
  ALTER TABLE "suppliers" ADD COLUMN "branchId" UUID;
  ALTER TABLE "sales_orders" ADD COLUMN "branchId" UUID;
  ALTER TABLE "debts" ADD COLUMN "branchId" UUID;
  ALTER TABLE "installment_plans" ADD COLUMN "branchId" UUID;
  ALTER TABLE "payments" ADD COLUMN "branchId" UUID;
  ALTER TABLE "sales_returns" ADD COLUMN "branchId" UUID;
  ALTER TABLE "cash_refunds" ADD COLUMN "branchId" UUID;
  ALTER TABLE "customer_credits" ADD COLUMN "branchId" UUID;
  ALTER TABLE "supplier_transactions" ADD COLUMN "branchId" UUID;
  ALTER TABLE "supplier_receivings" ADD COLUMN "branchId" UUID;
  ALTER TABLE "service_jobs" ADD COLUMN "branchId" UUID;
  UPDATE "customers" SET "branchId" = historical_branch;
  UPDATE "suppliers" SET "branchId" = historical_branch;
  UPDATE "sales_orders" SET "branchId" = historical_branch;
  UPDATE "debts" SET "branchId" = historical_branch;
  UPDATE "installment_plans" SET "branchId" = historical_branch;
  UPDATE "payments" SET "branchId" = historical_branch;
  UPDATE "sales_returns" SET "branchId" = historical_branch;
  UPDATE "cash_refunds" SET "branchId" = historical_branch;
  UPDATE "customer_credits" SET "branchId" = historical_branch;
  UPDATE "supplier_transactions" SET "branchId" = historical_branch;
  UPDATE "supplier_receivings" SET "branchId" = historical_branch;
  UPDATE "service_jobs" SET "branchId" = historical_branch;
  IF EXISTS (SELECT 1 FROM "customers" WHERE "branchId" IS NULL) THEN
    RAISE EXCEPTION 'Branch backfill incomplete in customers; migration rolled back; ask support to investigate';
  END IF;
  ALTER TABLE "customers" ALTER COLUMN "branchId" SET NOT NULL;
  IF EXISTS (SELECT 1 FROM "suppliers" WHERE "branchId" IS NULL) THEN
    RAISE EXCEPTION 'Branch backfill incomplete in suppliers; migration rolled back; ask support to investigate';
  END IF;
  ALTER TABLE "suppliers" ALTER COLUMN "branchId" SET NOT NULL;
  IF EXISTS (SELECT 1 FROM "sales_orders" WHERE "branchId" IS NULL) THEN
    RAISE EXCEPTION 'Branch backfill incomplete in sales_orders; migration rolled back; ask support to investigate';
  END IF;
  ALTER TABLE "sales_orders" ALTER COLUMN "branchId" SET NOT NULL;
  IF EXISTS (SELECT 1 FROM "debts" WHERE "branchId" IS NULL) THEN
    RAISE EXCEPTION 'Branch backfill incomplete in debts; migration rolled back; ask support to investigate';
  END IF;
  ALTER TABLE "debts" ALTER COLUMN "branchId" SET NOT NULL;
  IF EXISTS (SELECT 1 FROM "installment_plans" WHERE "branchId" IS NULL) THEN
    RAISE EXCEPTION 'Branch backfill incomplete in installment_plans; migration rolled back; ask support to investigate';
  END IF;
  ALTER TABLE "installment_plans" ALTER COLUMN "branchId" SET NOT NULL;
  IF EXISTS (SELECT 1 FROM "payments" WHERE "branchId" IS NULL) THEN
    RAISE EXCEPTION 'Branch backfill incomplete in payments; migration rolled back; ask support to investigate';
  END IF;
  ALTER TABLE "payments" ALTER COLUMN "branchId" SET NOT NULL;
  IF EXISTS (SELECT 1 FROM "sales_returns" WHERE "branchId" IS NULL) THEN
    RAISE EXCEPTION 'Branch backfill incomplete in sales_returns; migration rolled back; ask support to investigate';
  END IF;
  ALTER TABLE "sales_returns" ALTER COLUMN "branchId" SET NOT NULL;
  IF EXISTS (SELECT 1 FROM "cash_refunds" WHERE "branchId" IS NULL) THEN
    RAISE EXCEPTION 'Branch backfill incomplete in cash_refunds; migration rolled back; ask support to investigate';
  END IF;
  ALTER TABLE "cash_refunds" ALTER COLUMN "branchId" SET NOT NULL;
  IF EXISTS (SELECT 1 FROM "customer_credits" WHERE "branchId" IS NULL) THEN
    RAISE EXCEPTION 'Branch backfill incomplete in customer_credits; migration rolled back; ask support to investigate';
  END IF;
  ALTER TABLE "customer_credits" ALTER COLUMN "branchId" SET NOT NULL;
  IF EXISTS (SELECT 1 FROM "supplier_transactions" WHERE "branchId" IS NULL) THEN
    RAISE EXCEPTION 'Branch backfill incomplete in supplier_transactions; migration rolled back; ask support to investigate';
  END IF;
  ALTER TABLE "supplier_transactions" ALTER COLUMN "branchId" SET NOT NULL;
  IF EXISTS (SELECT 1 FROM "supplier_receivings" WHERE "branchId" IS NULL) THEN
    RAISE EXCEPTION 'Branch backfill incomplete in supplier_receivings; migration rolled back; ask support to investigate';
  END IF;
  ALTER TABLE "supplier_receivings" ALTER COLUMN "branchId" SET NOT NULL;
  IF EXISTS (SELECT 1 FROM "service_jobs" WHERE "branchId" IS NULL) THEN
    RAISE EXCEPTION 'Branch backfill incomplete in service_jobs; migration rolled back; ask support to investigate';
  END IF;
  ALTER TABLE "service_jobs" ALTER COLUMN "branchId" SET NOT NULL;

  CREATE INDEX "customers_branchId_idx" ON "customers"("branchId");
  
  CREATE UNIQUE INDEX "customers_id_branchId_key" ON "customers"("id", "branchId");
  
  CREATE INDEX "debts_branchId_idx" ON "debts"("branchId");
  
  CREATE INDEX "installment_plans_branchId_idx" ON "installment_plans"("branchId");
  
  CREATE INDEX "payments_branchId_idx" ON "payments"("branchId");
  
  CREATE INDEX "service_jobs_branchId_idx" ON "service_jobs"("branchId");
  
  CREATE INDEX "sales_orders_branchId_idx" ON "sales_orders"("branchId");
  
  CREATE UNIQUE INDEX "sales_orders_id_branchId_key" ON "sales_orders"("id", "branchId");
  
  CREATE INDEX "sales_returns_branchId_idx" ON "sales_returns"("branchId");
  
  CREATE UNIQUE INDEX "sales_returns_id_branchId_key" ON "sales_returns"("id", "branchId");
  
  CREATE INDEX "cash_refunds_branchId_idx" ON "cash_refunds"("branchId");
  
  CREATE INDEX "customer_credits_branchId_idx" ON "customer_credits"("branchId");
  
  CREATE INDEX "suppliers_branchId_idx" ON "suppliers"("branchId");
  
  CREATE UNIQUE INDEX "suppliers_id_branchId_key" ON "suppliers"("id", "branchId");
  
  CREATE INDEX "supplier_receivings_branchId_idx" ON "supplier_receivings"("branchId");
  
  CREATE INDEX "supplier_transactions_branchId_idx" ON "supplier_transactions"("branchId");
  
  ALTER TABLE "customers" ADD CONSTRAINT "customers_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  
  ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  
  ALTER TABLE "debts" ADD CONSTRAINT "debts_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  
  ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  
  ALTER TABLE "payments" ADD CONSTRAINT "payments_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  
  ALTER TABLE "service_jobs" ADD CONSTRAINT "service_jobs_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  
  ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  
  ALTER TABLE "sales_returns" ADD CONSTRAINT "sales_returns_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  
  ALTER TABLE "cash_refunds" ADD CONSTRAINT "cash_refunds_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  
  ALTER TABLE "customer_credits" ADD CONSTRAINT "customer_credits_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  
  ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  
  ALTER TABLE "supplier_receivings" ADD CONSTRAINT "supplier_receivings_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  
  ALTER TABLE "supplier_transactions" ADD CONSTRAINT "supplier_transactions_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  ALTER TABLE "debts" ADD CONSTRAINT "debts_customerId_branchId_fkey"
    FOREIGN KEY ("customerId", "branchId") REFERENCES "customers" ("id", "branchId")
    MATCH SIMPLE ON DELETE RESTRICT ON UPDATE RESTRICT;
  ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_customerId_branchId_fkey"
    FOREIGN KEY ("customerId", "branchId") REFERENCES "customers" ("id", "branchId")
    MATCH SIMPLE ON DELETE RESTRICT ON UPDATE RESTRICT;
  ALTER TABLE "customer_credits" ADD CONSTRAINT "customer_credits_customerId_branchId_fkey"
    FOREIGN KEY ("customerId", "branchId") REFERENCES "customers" ("id", "branchId")
    MATCH SIMPLE ON DELETE RESTRICT ON UPDATE RESTRICT;
  ALTER TABLE "service_jobs" ADD CONSTRAINT "service_jobs_customerId_branchId_fkey"
    FOREIGN KEY ("customerId", "branchId") REFERENCES "customers" ("id", "branchId")
    MATCH SIMPLE ON DELETE RESTRICT ON UPDATE RESTRICT;
  ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_customerId_branchId_fkey"
    FOREIGN KEY ("customerId", "branchId") REFERENCES "customers" ("id", "branchId")
    MATCH SIMPLE ON DELETE RESTRICT ON UPDATE RESTRICT;
  ALTER TABLE "payments" ADD CONSTRAINT "payments_customerId_branchId_fkey"
    FOREIGN KEY ("customerId", "branchId") REFERENCES "customers" ("id", "branchId")
    MATCH SIMPLE ON DELETE RESTRICT ON UPDATE RESTRICT;
  ALTER TABLE "sales_returns" ADD CONSTRAINT "sales_returns_customerId_branchId_fkey"
    FOREIGN KEY ("customerId", "branchId") REFERENCES "customers" ("id", "branchId")
    MATCH SIMPLE ON DELETE RESTRICT ON UPDATE RESTRICT;
  ALTER TABLE "cash_refunds" ADD CONSTRAINT "cash_refunds_customerId_branchId_fkey"
    FOREIGN KEY ("customerId", "branchId") REFERENCES "customers" ("id", "branchId")
    MATCH SIMPLE ON DELETE RESTRICT ON UPDATE RESTRICT;
  ALTER TABLE "payments" ADD CONSTRAINT "payments_salesOrderId_branchId_fkey"
    FOREIGN KEY ("salesOrderId", "branchId") REFERENCES "sales_orders" ("id", "branchId")
    MATCH SIMPLE ON DELETE RESTRICT ON UPDATE RESTRICT;
  ALTER TABLE "sales_returns" ADD CONSTRAINT "sales_returns_salesOrderId_branchId_fkey"
    FOREIGN KEY ("salesOrderId", "branchId") REFERENCES "sales_orders" ("id", "branchId")
    MATCH SIMPLE ON DELETE RESTRICT ON UPDATE RESTRICT;
  ALTER TABLE "cash_refunds" ADD CONSTRAINT "cash_refunds_salesReturnId_branchId_fkey"
    FOREIGN KEY ("salesReturnId", "branchId") REFERENCES "sales_returns" ("id", "branchId")
    MATCH SIMPLE ON DELETE RESTRICT ON UPDATE RESTRICT;
  ALTER TABLE "customer_credits" ADD CONSTRAINT "customer_credits_salesReturnId_branchId_fkey"
    FOREIGN KEY ("salesReturnId", "branchId") REFERENCES "sales_returns" ("id", "branchId")
    MATCH SIMPLE ON DELETE RESTRICT ON UPDATE RESTRICT;
  ALTER TABLE "supplier_transactions" ADD CONSTRAINT "supplier_transactions_supplierId_branchId_fkey"
    FOREIGN KEY ("supplierId", "branchId") REFERENCES "suppliers" ("id", "branchId")
    MATCH SIMPLE ON DELETE RESTRICT ON UPDATE RESTRICT;
  ALTER TABLE "supplier_receivings" ADD CONSTRAINT "supplier_receivings_supplierId_branchId_fkey"
    FOREIGN KEY ("supplierId", "branchId") REFERENCES "suppliers" ("id", "branchId")
    MATCH SIMPLE ON DELETE RESTRICT ON UPDATE RESTRICT;
  EXECUTE $function$
    CREATE FUNCTION prevent_branch_change() RETURNS trigger LANGUAGE plpgsql AS $body$
    BEGIN
      IF NEW."branchId" IS DISTINCT FROM OLD."branchId" THEN
        RAISE EXCEPTION 'branchId cannot be changed once a record exists';
      END IF;
      RETURN NEW;
    END;
    $body$;
  $function$;
  CREATE TRIGGER "customers_branch_immutable" BEFORE UPDATE ON "customers"
    FOR EACH ROW EXECUTE FUNCTION prevent_branch_change();
  CREATE TRIGGER "suppliers_branch_immutable" BEFORE UPDATE ON "suppliers"
    FOR EACH ROW EXECUTE FUNCTION prevent_branch_change();
  CREATE TRIGGER "sales_orders_branch_immutable" BEFORE UPDATE ON "sales_orders"
    FOR EACH ROW EXECUTE FUNCTION prevent_branch_change();
  CREATE TRIGGER "debts_branch_immutable" BEFORE UPDATE ON "debts"
    FOR EACH ROW EXECUTE FUNCTION prevent_branch_change();
  CREATE TRIGGER "installment_plans_branch_immutable" BEFORE UPDATE ON "installment_plans"
    FOR EACH ROW EXECUTE FUNCTION prevent_branch_change();
  CREATE TRIGGER "payments_branch_immutable" BEFORE UPDATE ON "payments"
    FOR EACH ROW EXECUTE FUNCTION prevent_branch_change();
  CREATE TRIGGER "sales_returns_branch_immutable" BEFORE UPDATE ON "sales_returns"
    FOR EACH ROW EXECUTE FUNCTION prevent_branch_change();
  CREATE TRIGGER "cash_refunds_branch_immutable" BEFORE UPDATE ON "cash_refunds"
    FOR EACH ROW EXECUTE FUNCTION prevent_branch_change();
  CREATE TRIGGER "customer_credits_branch_immutable" BEFORE UPDATE ON "customer_credits"
    FOR EACH ROW EXECUTE FUNCTION prevent_branch_change();
  CREATE TRIGGER "supplier_transactions_branch_immutable" BEFORE UPDATE ON "supplier_transactions"
    FOR EACH ROW EXECUTE FUNCTION prevent_branch_change();
  CREATE TRIGGER "supplier_receivings_branch_immutable" BEFORE UPDATE ON "supplier_receivings"
    FOR EACH ROW EXECUTE FUNCTION prevent_branch_change();
  CREATE TRIGGER "service_jobs_branch_immutable" BEFORE UPDATE ON "service_jobs"
    FOR EACH ROW EXECUTE FUNCTION prevent_branch_change();
  ALTER TABLE "users" DROP COLUMN "branchId";
END;
$ownership$;
