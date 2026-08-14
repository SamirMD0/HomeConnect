-- Inventory v1.9.1 records future supplier receipts as immutable inventory
-- documents. Existing products, suppliers, stock movements, and ledgers are
-- left untouched; this migration intentionally creates no receiving history.

-- CreateTable
CREATE TABLE "supplier_receivings" (
  "id" UUID NOT NULL,
  "supplierId" UUID,
  "referenceNumber" TEXT,
  "note" TEXT,
  "receivedOn" DATE NOT NULL,
  "receivedById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "supplier_receivings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "supplier_receivings_reference_nonempty_check"
    CHECK ("referenceNumber" IS NULL OR btrim("referenceNumber") <> '')
);

-- CreateTable
CREATE TABLE "supplier_receiving_items" (
  "id" UUID NOT NULL,
  "receivingId" UUID NOT NULL,
  "productId" UUID NOT NULL,
  "quantity" INTEGER NOT NULL,
  "stockMovementId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "supplier_receiving_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "supplier_receiving_items_positive_quantity_check"
    CHECK ("quantity" > 0),
  CONSTRAINT "supplier_receiving_items_quantity_limit_check"
    CHECK ("quantity" <= 100000)
);

-- CreateIndex
CREATE INDEX "supplier_receivings_supplierId_receivedOn_idx"
  ON "supplier_receivings"("supplierId", "receivedOn");

CREATE INDEX "supplier_receivings_receivedOn_idx"
  ON "supplier_receivings"("receivedOn");

CREATE INDEX "supplier_receivings_receivedById_idx"
  ON "supplier_receivings"("receivedById");

CREATE UNIQUE INDEX "supplier_receiving_items_stockMovementId_key"
  ON "supplier_receiving_items"("stockMovementId");

CREATE UNIQUE INDEX "supplier_receiving_items_receivingId_productId_key"
  ON "supplier_receiving_items"("receivingId", "productId");

CREATE INDEX "supplier_receiving_items_productId_createdAt_idx"
  ON "supplier_receiving_items"("productId", "createdAt");

-- AddForeignKey
ALTER TABLE "supplier_receivings"
  ADD CONSTRAINT "supplier_receivings_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "supplier_receivings"
  ADD CONSTRAINT "supplier_receivings_receivedById_fkey"
  FOREIGN KEY ("receivedById") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "supplier_receiving_items"
  ADD CONSTRAINT "supplier_receiving_items_receivingId_fkey"
  FOREIGN KEY ("receivingId") REFERENCES "supplier_receivings"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "supplier_receiving_items"
  ADD CONSTRAINT "supplier_receiving_items_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "products"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "supplier_receiving_items"
  ADD CONSTRAINT "supplier_receiving_items_stockMovementId_fkey"
  FOREIGN KEY ("stockMovementId") REFERENCES "stock_movements"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
