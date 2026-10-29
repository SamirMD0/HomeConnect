BEGIN;

DO $$
BEGIN
  IF to_regclass('public.branches') IS NULL OR to_regclass('public.users') IS NULL
     OR to_regclass('public.customers') IS NULL OR to_regclass('public.debts') IS NULL THEN
    RAISE EXCEPTION 'Customer CSV import requires the existing branches, users, customers and debts tables; apply earlier migrations first.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'debts' AND column_name = 'branchId' AND is_nullable = 'NO')
     OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.debts'::regclass AND conname = 'debts_customerId_branchId_fkey') THEN
    RAISE EXCEPTION 'Customer CSV import requires completed branch ownership and the debts/customer composite branch foreign key.';
  END IF;
  IF to_regclass('public.customer_imports') IS NOT NULL
     OR EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CustomerImportStatus' AND typnamespace = 'public'::regnamespace)
     OR EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'debts' AND column_name = 'sourceCustomerImportId') THEN
    RAISE EXCEPTION 'Customer CSV import objects already exist; inspect migration history before applying this update.';
  END IF;
END $$;

CREATE TYPE "CustomerImportStatus" AS ENUM ('DRAFT', 'COMMITTED');

CREATE TABLE "customer_imports" (
  "id" UUID NOT NULL,
  "branchId" UUID NOT NULL,
  "fileName" TEXT NOT NULL,
  "fileHash" TEXT NOT NULL,
  "status" "CustomerImportStatus" NOT NULL DEFAULT 'DRAFT',
  "columnMapping" JSONB NOT NULL,
  "rows" JSONB NOT NULL,
  "decisions" JSONB,
  "result" JSONB,
  "createdById" UUID NOT NULL,
  "committedById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "committedAt" TIMESTAMP(3),
  CONSTRAINT "customer_imports_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "customer_imports_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "customer_imports_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "customer_imports_committedById_fkey" FOREIGN KEY ("committedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

ALTER TABLE "debts" ADD COLUMN "sourceCustomerImportId" UUID;
ALTER TABLE "debts" ADD CONSTRAINT "debts_sourceCustomerImportId_fkey" FOREIGN KEY ("sourceCustomerImportId") REFERENCES "customer_imports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "customer_imports_branchId_fileHash_status_idx" ON "customer_imports"("branchId", "fileHash", "status");
CREATE INDEX "debts_sourceCustomerImportId_idx" ON "debts"("sourceCustomerImportId");

COMMIT;
