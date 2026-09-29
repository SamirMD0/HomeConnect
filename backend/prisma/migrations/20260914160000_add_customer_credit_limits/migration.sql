-- Additive only: NULL retains existing unrestricted behavior. No backfill.
ALTER TABLE "customers" ADD COLUMN "creditLimit" DECIMAL(12,2);
ALTER TABLE "customers" ADD CONSTRAINT "customers_credit_limit_nonnegative_check"
  CHECK ("creditLimit" IS NULL OR "creditLimit" >= 0);
