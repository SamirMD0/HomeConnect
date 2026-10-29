-- Allow an administrator to move a customer, with their entire history, to
-- another branch in one transaction. Nothing here changes any row, and no
-- constraint is dropped or loosened.
--
-- 1. The customer-chain branch-closure foreign keys become DEFERRABLE
--    INITIALLY IMMEDIATE. Their actions stay ON UPDATE/DELETE RESTRICT and
--    every statement is still checked immediately unless a transaction runs
--    SET CONSTRAINTS ... DEFERRED. The transfer does, and moves child rows
--    before their parents: a child's own link check then waits for COMMIT,
--    and when a parent moves nothing references its old key any more, so
--    RESTRICT is satisfied. A missed row fails the transaction and nothing
--    changes.
-- 2. prevent_branch_change() still rejects every branch change, except inside
--    a transaction that set homeconnect.branch_transfer = 'on' (SET LOCAL,
--    so it ends with the transaction). Only the transfer service sets it.
--
-- Supplier-chain links are unchanged.

CREATE OR REPLACE FUNCTION prevent_branch_change() RETURNS trigger LANGUAGE plpgsql AS $body$
BEGIN
  IF NEW."branchId" IS DISTINCT FROM OLD."branchId"
     AND coalesce(current_setting('homeconnect.branch_transfer', true), '') <> 'on' THEN
    RAISE EXCEPTION 'branchId cannot be changed once a record exists';
  END IF;
  RETURN NEW;
END;
$body$;

ALTER TABLE "debts" ALTER CONSTRAINT "debts_customerId_branchId_fkey" DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE "installment_plans" ALTER CONSTRAINT "installment_plans_customerId_branchId_fkey" DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE "customer_credits" ALTER CONSTRAINT "customer_credits_customerId_branchId_fkey" DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE "service_jobs" ALTER CONSTRAINT "service_jobs_customerId_branchId_fkey" DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE "sales_orders" ALTER CONSTRAINT "sales_orders_customerId_branchId_fkey" DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE "payments" ALTER CONSTRAINT "payments_customerId_branchId_fkey" DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE "sales_returns" ALTER CONSTRAINT "sales_returns_customerId_branchId_fkey" DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE "cash_refunds" ALTER CONSTRAINT "cash_refunds_customerId_branchId_fkey" DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE "payments" ALTER CONSTRAINT "payments_salesOrderId_branchId_fkey" DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE "sales_returns" ALTER CONSTRAINT "sales_returns_salesOrderId_branchId_fkey" DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE "cash_refunds" ALTER CONSTRAINT "cash_refunds_salesReturnId_branchId_fkey" DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE "customer_credits" ALTER CONSTRAINT "customer_credits_salesReturnId_branchId_fkey" DEFERRABLE INITIALLY IMMEDIATE;
