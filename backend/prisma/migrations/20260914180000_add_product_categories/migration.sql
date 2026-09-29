-- Additive English-only categories. Existing products remain uncategorized.
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" UUID,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "categories_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "categories_not_self_parent_check" CHECK ("parentId" IS NULL OR "parentId" <> "id"),
    CONSTRAINT "categories_name_nonempty_check" CHECK (length(btrim("name")) BETWEEN 1 AND 120)
);
CREATE INDEX "categories_parentId_idx" ON "categories"("parentId");
CREATE INDEX "categories_isActive_idx" ON "categories"("isActive");
-- Separate root/child indexes make NULL-root names unique as well.
CREATE UNIQUE INDEX "categories_root_name_unique" ON "categories"(lower("name")) WHERE "parentId" IS NULL;
CREATE UNIQUE INDEX "categories_sibling_name_unique" ON "categories"("parentId", lower("name")) WHERE "parentId" IS NOT NULL;
ALTER TABLE "categories" ADD CONSTRAINT "categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "products" ADD COLUMN "categoryId" UUID;
CREATE INDEX "products_categoryId_idx" ON "products"("categoryId");
ALTER TABLE "products" ADD CONSTRAINT "products_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
