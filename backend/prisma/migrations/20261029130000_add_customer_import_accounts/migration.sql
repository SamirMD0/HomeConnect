BEGIN;
DO $$ BEGIN
  IF to_regclass('public.customer_imports') IS NULL OR to_regclass('public.customers') IS NULL THEN
    RAISE EXCEPTION 'Customer import accounts require the existing customer import and branch ownership migrations';
  END IF;
  IF to_regclass('public.customer_import_accounts') IS NOT NULL THEN
    RAISE EXCEPTION 'Customer import account objects already exist';
  END IF;
END $$;
CREATE UNIQUE INDEX "customer_imports_id_branchId_key" ON "customer_imports"("id", "branchId");
CREATE TABLE "customer_import_accounts" (
  "branchId" UUID NOT NULL,
  "accountCode" VARCHAR(80) NOT NULL CHECK ("accountCode" ~ '^[0-9]{1,80}$'),
  "customerId" UUID NOT NULL,
  "sourceCustomerImportId" UUID NOT NULL,
  "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_import_accounts_pkey" PRIMARY KEY ("branchId", "accountCode"),
  CONSTRAINT "customer_import_accounts_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "customer_import_accounts_customerId_branchId_fkey" FOREIGN KEY ("customerId", "branchId") REFERENCES "customers"("id", "branchId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "customer_import_accounts_sourceCustomerImportId_fkey" FOREIGN KEY ("sourceCustomerImportId", "branchId") REFERENCES "customer_imports"("id", "branchId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "customer_import_accounts_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "customer_import_accounts_customerId_branchId_idx" ON "customer_import_accounts"("customerId", "branchId");
COMMIT;
