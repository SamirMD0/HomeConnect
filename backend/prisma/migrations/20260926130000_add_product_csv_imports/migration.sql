CREATE TABLE "product_imports" (
    "id" UUID NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "sourceSystem" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "rows" JSONB NOT NULL,
    "categoryMappings" JSONB NOT NULL DEFAULT '{}',
    "decisions" JSONB,
    "result" JSONB,
    "createdById" UUID NOT NULL,
    "committedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "committedAt" TIMESTAMP(3),
    CONSTRAINT "product_imports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "product_external_identifiers" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "sourceSystem" TEXT NOT NULL,
    "externalCode" TEXT NOT NULL,
    "normalizedCode" TEXT NOT NULL,
    "importId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "product_external_identifiers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "product_imports_fileHash_createdAt_idx" ON "product_imports"("fileHash", "createdAt");
CREATE INDEX "product_imports_status_createdAt_idx" ON "product_imports"("status", "createdAt");
CREATE UNIQUE INDEX "product_external_identifiers_sourceSystem_normalizedCode_key" ON "product_external_identifiers"("sourceSystem", "normalizedCode");
CREATE INDEX "product_external_identifiers_productId_idx" ON "product_external_identifiers"("productId");
CREATE INDEX "product_external_identifiers_importId_idx" ON "product_external_identifiers"("importId");

ALTER TABLE "product_imports" ADD CONSTRAINT "product_imports_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_imports" ADD CONSTRAINT "product_imports_committedById_fkey"
  FOREIGN KEY ("committedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_external_identifiers" ADD CONSTRAINT "product_external_identifiers_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_external_identifiers" ADD CONSTRAINT "product_external_identifiers_importId_fkey"
  FOREIGN KEY ("importId") REFERENCES "product_imports"("id") ON DELETE SET NULL ON UPDATE CASCADE;
