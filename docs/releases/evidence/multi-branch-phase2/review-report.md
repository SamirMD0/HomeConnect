# Phase 2 reviewer changes R1–R4

## 1. Branch and commits

Branch: feature/multi-branch-phase-2. Existing six commits through 45be82f remain unchanged. New implementation commits follow; this report is carried by the final validation/evidence commit.

```text
d983612 fix(branches): preserve employee creation access during ownership rollout
42bb1a9 fix(branches): keep at least one branch active
6d1e1f9 feat(branches): rehearse upgrades through the bundled migration runner
db69dff docs(branches): defer complete response ownership fields to phase three
```

No push, merge, production connection, or Phase 3 implementation.

## 2. Final migration, hash, and DO-only changes

Raw migration SHA-256: 776a8bb45e18c487cf8841c4f53416f7faba327c44e43e67e42327e98ca55ee5

SQL-scanner DO-statement SHA-256: 101304fae6cad84c593947ad92d270cb4c4cdc33227b8f16253809c0bd8d8e8f

Only the following DO-block insertion changed from the accepted migration. The INSERT did not require a scanner exemption; only the existing exact statement pin changed.

```diff
diff --git a/backend/prisma/migrations/20261027120000_add_branch_ownership/migration.sql b/backend/prisma/migrations/20261027120000_add_branch_ownership/migration.sql
index 4bc6eeb..c12e8bc 100644
--- a/backend/prisma/migrations/20261027120000_add_branch_ownership/migration.sql
+++ b/backend/prisma/migrations/20261027120000_add_branch_ownership/migration.sql
@@ -73,6 +73,17 @@ BEGIN
     END IF;
   END IF;
 
+  -- D1: existing non-deleted employees worked in the one historical shop.
+  -- Preserve any Phase 1 grant (including its original grantor and timestamp).
+  IF historical_branch IS NOT NULL THEN
+    INSERT INTO "user_branch_access" ("userId", "branchId", "grantedById")
+      SELECT employee."id", historical_branch, branch."createdById"
+      FROM "users" employee
+      JOIN "branches" branch ON branch."id" = historical_branch
+      WHERE employee."role" = 'EMPLOYEE' AND employee."deletedAt" IS NULL
+      ON CONFLICT ("userId", "branchId") DO NOTHING;
+  END IF;
+
   -- Keep customers.branchId in place; every other owned table gets a nullable column.
   ALTER TABLE "suppliers" ADD COLUMN "branchId" UUID;
   ALTER TABLE "sales_orders" ADD COLUMN "branchId" UUID;
```

Full final migration.sql:

```sql
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
```

## 3. All 15 owned-record create sites

All accepted create paths remain unchanged by this revision. Paths are relative to backend/src; parent ownership is derived inside the writing transaction.

| Record/site | File:line | Source |
|---|---|---|
| Customer | repositories/customers.repository.ts:51 | Creation branch resolved by CustomersService in the writing transaction |
| Supplier | features/suppliers/suppliers/suppliers.repository.ts:36 | Creator's single accessible active branch |
| SalesOrder | features/sales/sales-orders/sales-orders.repository.ts:125 | Customer branch; creation branch for walk-ins |
| Debt | features/financial/debts/debts.repository.ts:133 | Customer branch |
| Debt payment | features/financial/debts/debts.repository.ts:179 | Customer branch |
| InstallmentPlan | features/financial/installment-plans/installment-plans.repository.ts:132 | Customer branch |
| Installment payment | features/financial/installment-plans/installment-plans.repository.ts:187 | Customer branch |
| Counter receipt | features/financial/payments/payments.repository.ts:122 | Sales order when set; otherwise customer |
| Replacement payment | features/financial/payments/payments.repository.ts:215 | Customer branch |
| SalesReturn | features/sales/returns/sales-returns.repository.ts:72 | Original sales order |
| CashRefund | features/sales/returns/sales-returns.service.ts:308 | Created return header, following original sale |
| CustomerCredit | features/sales/returns/sales-returns.service.ts:324 | Created return header, following original sale |
| SupplierTransaction | features/suppliers/transactions/supplier-transactions.repository.ts:63 | Supplier branch |
| SupplierReceiving | features/inventory/receiving/supplier-receivings.repository.ts:45 | Supplier branch; creation branch when supplier-less |
| ServiceJob | features/service/service-jobs/service-jobs.repository.ts:33 | Customer branch |

R1 additionally grants new employees in the same transaction in UsersService.createUser and authenticated AuthService.setupAccount. It does not add response fields. Reactivation never rewrites grants.

## 4. Validation

```text
Review R1–R4 validation, 2026-10-27. Only authorized synthetic throwaway databases used.
npm run typecheck: PASS (frontend and backend; 0 errors)
npm run lint: PASS (0 errors; 91 warnings, down from 92)
Changed files: 0 added warning instances; supplemental scripts/migration-test lint and typecheck pass.
NODE_ENV=test npm run test:ci: PASS (395 files; 3024 passed; 0 failed; 0 skipped/todo)
npm run rehearse:migrations -- --confirm-scratch: PASS (70 migrations, both verification phases)
REHEARSAL_DB=homeconnect_test_mb_rehearsal_1793101348234; removed after completion.
Synthetic proof: snapshot -> apply-bundled-migrations.ts -> snapshot -> compare: COMPARE PASS.
34 closure counts zero; no snapshot differences; USD/LBP history unchanged.
Existing category checksum allowlist triple accepted and recorded checksum preserved; no new allowlist entries/bypasses.
Grant counts: {"employeesGranted":2,"employeeGrantRows":2,"adminsGranted":0,"deletedUsersGranted":0,"employeesWithoutGrant":0}
Raw migration SHA-256: 776a8bb45e18c487cf8841c4f53416f7faba327c44e43e67e42327e98ca55ee5
SQL-scanner DO-statement SHA-256: 101304fae6cad84c593947ad92d270cb4c4cdc33227b8f16253809c0bd8d8e8f
Graphify local update passed before the final validation/evidence commit.
The first full run had one unchanged SVG seed cold-load timeout (5 seconds); it passed unchanged in isolation and in the final full run.
```

New test names (R1–R3):

### R1

- createUser grants the single active branch to a fresh employee in the creation transaction when scoping is off
- createUser grants nothing when branch scoping is enabled
- createUser does not grant administrators
- createUser is a no-op for grants when no active branch exists
- reactivating a soft-deleted employee leaves existing grants untouched
- migration grants let a fresh employee create a customer without manual fixture grants
- migration preserves existing Phase 1 grants and their original timestamps

### R2

- rejects deactivating the last active branch regardless of scoping flag false
- rejects deactivating the last active branch regardless of scoping flag true
- allows deactivation when another branch stays active
- returns the LAST_ACTIVE_BRANCH conflict and server message from branch deactivation
- shows the server LAST_ACTIVE_BRANCH message after deactivation is rejected

### R3

- refuses the business database before any database command
- accepts and prints the existing allowlisted checksum triple without rewriting it
- prints rejection and blocks an unknown checksum with no execution transaction

R1 also strengthens both existing historical-backfill cases to assert one grant per non-deleted employee, none for admins/deleted users, and strengthens the existing authenticated account-setup test. Existing panel assertions remain unchanged.

## 5. Seeded reconciliation and grants

30 owned rows in 12 tables; current month, previous month and August 2026; both USD and LBP. Customer integrity stays 356.00; supplier integrity stays 200.00; zero integrity mismatches.

```text
Confirmed bundled migration database: homeconnect_test_mb_proof_d7e7c88136f24f20812c
ALLOWLIST ACCEPT 20260914180000_add_product_categories recorded=3a86cdb1e4e485e19749a6c39ea3ee0d1585417ffe809b8a3bc9c92def6c5372 bundled=b774e3bcf474c2bb8db6c52ce18fd925113dcdf02cd52140c6bd58c84405ff5e reason=CRLF vs LF encoding only; the SQL bytes are semantically identical.
Allowlist decisions: 1 accepted, 0 rejected
APPLIED 20261027120000_add_branch_ownership (831ms)
Status: pending=0 failed=0 mismatched=0
BUNDLED MIGRATIONS PASS: applied=1 allowlisted=1
Grant counts: {"employeesGranted":2,"employeeGrantRows":2,"adminsGranted":0,"deletedUsersGranted":0,"employeesWithoutGrant":0}
Confirmed scratch database: homeconnect_test_mb_proof_d7e7c88136f24f20812c
Snapshot differences: 0
Closure checks: {"customers.null_branch":0,"suppliers.null_branch":0,"sales_orders.null_branch":0,"debts.null_branch":0,"installment_plans.null_branch":0,"payments.null_branch":0,"sales_returns.null_branch":0,"cash_refunds.null_branch":0,"customer_credits.null_branch":0,"supplier_transactions.null_branch":0,"supplier_receivings.null_branch":0,"service_jobs.null_branch":0,"debts.customerId":0,"installment_plans.customerId":0,"customer_credits.customerId":0,"service_jobs.customerId":0,"sales_orders.customerId":0,"payments.customerId":0,"sales_returns.customerId":0,"cash_refunds.customerId":0,"payments.salesOrderId":0,"sales_returns.salesOrderId":0,"cash_refunds.salesReturnId":0,"customer_credits.salesReturnId":0,"supplier_transactions.supplierId":0,"supplier_receivings.supplierId":0,"payment_allocations.debtId.branch_mismatch":0,"payment_allocations.installmentId.branch_mismatch":0,"sales_return_receivable_allocations.debtId.branch_mismatch":0,"sales_return_receivable_allocations.installmentId.branch_mismatch":0,"customer_credit_applications.debtId.branch_mismatch":0,"customer_credit_applications.installmentId.branch_mismatch":0,"customer_credit_applications.salesOrderId.branch_mismatch":0,"customer_credit_applications.customerId.branch_mismatch":0}
branch_mismatch: 0
COMPARE PASS
```

The proof seeds the already allowlisted category-migration recorded checksum in a synthetic scratch database, invokes the real CLI, and verifies that recorded checksum remains unchanged. It creates no allowlist entry and bypasses no mismatch. All additional scratch databases are removed.

## 6. Findings and assumptions

- D1 supports grants for every non-deleted historical employee, including inactive employees. Deleted users are excluded and administrators remain implicit. ON CONFLICT DO NOTHING preserves existing grants and timestamps.
- Automatic grants for new employees use the single active branch and its createdById as grantor. The rule is disabled when multi-branch scoping is enabled. With no active branch it is a no-op; multiple active branches while the flag is off produce BRANCH_SELECTION_REQUIRED.
- The initial full CI attempt encountered the existing synchronous SVG cold-load timeout; no SVG source, assertions, skip flags or timeout configuration changed.
- The hosted procedure is documented separately; no hosted/production data or backup was accessed. Owner/reviewer Phase 0 evidence remains a release gate.
- The plan was read from the explicitly requested corrected main-checkout file. Its existing release-gate corrections accompany the one new Phase 3 response-fields line. No other main-checkout source file was copied or modified.
- All implementation rules are satisfied; no further API response fields or Phase 3 behavior were added. The local generated graph remains untracked.

## 7. Phase 0 owner runbook

## Multi-branch Phase 2: baseline and migration proof

Phase 0 evidence gates release, not implementation. The owner/reviewer performs
this drill on a restored copy; builders use synthetic scratch data only.
Keep the app closed throughout both snapshots. Never point these commands at
`homeconnect`. Restore the latest verified backup into `homeconnect_reconcile`,
using the backup/restore procedure. Retain the original archive and checksum.

In a clean reviewer checkout, before installing a build containing the ownership
migration, check out the
first Phase 2 commit (`52d5fd4`, `feat(branches): add pre-migration reconciliation tool`).
Install its locked dependencies and generate its Prisma client. Set
`DATABASE_URL` to the restored `homeconnect_reconcile` database and confirm the
resolved name. Do not run migrations yet. Choose a historical month containing
returns and LBP activity; use that identical month and as-of date for both runs.

```powershell
git switch --detach 52d5fd4
npm ci
npx prisma generate --schema backend/prisma/schema.prisma
function Confirm-ReconciliationDatabase {
  if (([uri]$env:DATABASE_URL).AbsolutePath -ne '/homeconnect_reconcile') {
    throw 'DATABASE_URL must resolve to homeconnect_reconcile'
  }
  Write-Host 'Confirmed database: homeconnect_reconcile'
}
# Enter only the restored-copy URL. Input is masked and is never printed.
$restoreUrl = Read-Host 'Restored homeconnect_reconcile connection URL' -AsSecureString
$env:DATABASE_URL = [Net.NetworkCredential]::new('', $restoreUrl).Password
$branchEvidence = Join-Path $env:USERPROFILE 'Documents/HomeConnect-Phase0-Evidence'
New-Item -ItemType Directory -Force -Path $branchEvidence | Out-Null
$before = Join-Path $branchEvidence 'phase0-before.json'
$after = Join-Path $branchEvidence 'phase2-after.json'
Confirm-ReconciliationDatabase
npx tsx scripts/branch-reconciliation.ts snapshot --out $before --period 2026-08 --as-of 2026-10-27
Confirm-ReconciliationDatabase
npx tsx scripts/branch-reconciliation.ts compare --before $before --after $before
```

The baseline comparison reports `pre-branch schema: closure checks not applicable`.
Archive this evidence before checking out/installing the completed Phase 2 build.
Confirm DATABASE_URL still names homeconnect_reconcile, then switch to the reviewed
Phase 2 branch/build. Keep both snapshot files outside the checkout so switching
builds does not lose the baseline. The example filenames below use that directory.

```powershell
git switch --detach feature/multi-branch-phase-2
npm ci
npx prisma generate --schema backend/prisma/schema.prisma
Confirm-ReconciliationDatabase
npx tsx scripts/apply-bundled-migrations.ts
Confirm-ReconciliationDatabase
npx tsx scripts/branch-reconciliation.ts snapshot --out $after --period 2026-08 --as-of 2026-10-27
Confirm-ReconciliationDatabase
npx tsx scripts/branch-reconciliation.ts compare --before $before --after $after
```

Release requires COMPARE PASS, zero snapshot differences, every closure count zero,
and clean customer/supplier integrity rows. Snapshot uses existing report services
for analysis, monthly review and aging; independent SQL mirrors the integrity
reports. It excludes generation clocks and additive branch ownership metadata.
Changing any amount, date, status or row count still fails comparison. Partial
ownership schemas are rejected. The tool refuses business database names.

The builder's synthetic proof is reproducible with `npx tsx scripts/branch-reconciliation-proof.ts`
from a worktree configured for `homeconnect_test_phase4_phase5_phase6`. It creates
a separate `homeconnect_test_mb_proof_*` database, seeds both currencies, captures
both snapshots, executes `scripts/apply-bundled-migrations.ts` for the upgrade,
prints historical employee/admin grant counts, compares all financial evidence and
34 closure checks, then drops its database. It seeds the existing allowlisted
category-migration checksum and verifies that the desktop runner accepts and
preserves that recorded checksum. No checksum bypass or new allowlist entry is used.
The checked-in sample evidence is in `docs/releases/evidence/multi-branch-phase2/`.
Run CI with `NODE_ENV=test` and the required RUN_* flags via `npm run test:ci`;
a copied development .env otherwise changes unrelated environment-sensitive tests.

If the migration guard reports an inactive conflicting MAIN code/name, the owner
must activate the branch holding history or rename that inactive conflict before
retrying. The migration never guesses which inactive branch holds history.


### Hosted (Render) Phase 0 drill

The owner takes a fresh dump of the hosted Render database using the verified
backup procedure, and restores it into the disposable **homeconnect_reconcile_hosted**
database. Keep the application closed for this drill. The builder never connects
to the hosted/business database. Preserve that dump and the snapshots outside the
checkout. Render deploys with Prisma, so this drill deliberately uses Prisma rather
than the desktop runner. Its existing checksum behavior remains unchanged; stop on
any migration error instead of resolving or changing a checksum.

In the same clean reviewer checkout, capture the baseline before installing the
Phase 2 build (use a month with returns and LBP activity):

```powershell
git switch --detach 52d5fd4
npm ci
npx prisma generate --schema backend/prisma/schema.prisma
$hostedRestoreUrl = Read-Host 'Restored homeconnect_reconcile_hosted URL' -AsSecureString
$env:DATABASE_URL = [Net.NetworkCredential]::new('', $hostedRestoreUrl).Password
function Confirm-HostedReconciliationDatabase {
  if (([uri]$env:DATABASE_URL).AbsolutePath -ne '/homeconnect_reconcile_hosted') {
    throw 'DATABASE_URL must resolve to homeconnect_reconcile_hosted'
  }
  Write-Host 'Confirmed database: homeconnect_reconcile_hosted'
}
$hostedEvidence = Join-Path $env:USERPROFILE 'Documents/HomeConnect-Phase0-Hosted-Evidence'
New-Item -ItemType Directory -Force -Path $hostedEvidence | Out-Null
$hostedBefore = Join-Path $hostedEvidence 'before.json'
$hostedAfter = Join-Path $hostedEvidence 'after.json'
Confirm-HostedReconciliationDatabase
npx tsx scripts/branch-reconciliation.ts snapshot --out $hostedBefore --period 2026-08 --as-of 2026-10-27

git switch --detach feature/multi-branch-phase-2
npm ci
npx prisma generate --schema backend/prisma/schema.prisma
Confirm-HostedReconciliationDatabase
npx prisma migrate deploy --schema backend/prisma/schema.prisma
Confirm-HostedReconciliationDatabase
npx tsx scripts/branch-reconciliation.ts snapshot --out $hostedAfter --period 2026-08 --as-of 2026-10-27
Confirm-HostedReconciliationDatabase
npx tsx scripts/branch-reconciliation.ts compare --before $hostedBefore --after $hostedAfter
```

Release requires the same zero-difference, zero-closure-mismatch evidence as the
desktop drill. Rollback restores the fresh pre-upgrade dump and compatible build.

