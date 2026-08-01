-- Optional product image: either an external URL on the product row, or
-- uploaded bytes in a dedicated table so product queries never load payloads.

-- AlterTable
ALTER TABLE "products" ADD COLUMN "imageUrl" TEXT;

-- CreateTable
CREATE TABLE "product_images" (
    "productId" UUID NOT NULL,
    "data" BYTEA NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_images_pkey" PRIMARY KEY ("productId")
);

-- AddForeignKey
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
