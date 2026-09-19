ALTER TYPE "ServiceAuditRecordType" ADD VALUE IF NOT EXISTS 'BRAND_LOGO';

CREATE TABLE IF NOT EXISTS "brand_logos" (
  "id" UUID NOT NULL,
  "canonicalName" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "logoBytes" BYTEA,
  "logoMimeType" TEXT,
  "logoByteSize" INTEGER,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "brand_logos_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "brand_logos_logo_size_check" CHECK ("logoByteSize" IS NULL OR "logoByteSize" BETWEEN 0 AND 524288)
);

CREATE UNIQUE INDEX IF NOT EXISTS "brand_logos_canonicalName_key" ON "brand_logos"("canonicalName");
CREATE INDEX IF NOT EXISTS "brand_logos_canonicalName_idx" ON "brand_logos"("canonicalName");

DO $$ BEGIN
  ALTER TABLE "brand_logos" ADD CONSTRAINT "brand_logos_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
