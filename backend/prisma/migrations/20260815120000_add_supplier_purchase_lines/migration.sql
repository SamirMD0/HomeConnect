-- v1.9.4 records what a supplier actually sold: priced purchase lines hanging
-- off the supplier debt transaction, which becomes the purchase document header.
--
-- Entirely additive. No existing row is rewritten, no existing column changes
-- type, and no receiving, movement, or ledger entry is created. Every new column
-- on supplier_transactions is nullable or defaulted, so rows written by v1.9.3
-- remain valid without a backfill.

-- CreateEnum
CREATE TYPE "SupplierPurchaseLineKind" AS ENUM ('PRODUCT', 'MANUAL');

-- AlterTable
ALTER TABLE "supplier_transactions"
  ADD COLUMN "receiptNumber" TEXT,
  ADD COLUMN "amountOverride" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "amountOverrideReason" TEXT;

ALTER TABLE "supplier_transactions"
  ADD CONSTRAINT "supplier_transactions_receipt_nonempty_check"
    CHECK ("receiptNumber" IS NULL OR btrim("receiptNumber") <> ''),
  -- An override without a stated reason is an unexplained ledger amount.
  ADD CONSTRAINT "supplier_transactions_override_requires_reason_check"
    CHECK ("amountOverride" = false OR btrim(COALESCE("amountOverrideReason", '')) <> '');

-- CreateTable
CREATE TABLE "supplier_purchase_lines" (
  "id" UUID NOT NULL,
  "supplierTransactionId" UUID NOT NULL,
  "kind" "SupplierPurchaseLineKind" NOT NULL,
  "productId" UUID,
  "description" TEXT NOT NULL,
  "quantity" INTEGER,
  "unitPrice" DECIMAL(12,2),
  "lineTotal" DECIMAL(12,2) NOT NULL,
  "receivingItemId" UUID,
  "position" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "supplier_purchase_lines_pkey" PRIMARY KEY ("id"),

  -- A MANUAL line is description-only money. Making a product, a quantity, a
  -- unit price, or a receiving link unrepresentable here is what guarantees it
  -- can never move stock.
  CONSTRAINT "supplier_purchase_lines_manual_shape_check"
    CHECK ("kind" <> 'MANUAL' OR (
      "productId" IS NULL AND "quantity" IS NULL
      AND "unitPrice" IS NULL AND "receivingItemId" IS NULL
    )),
  CONSTRAINT "supplier_purchase_lines_product_shape_check"
    CHECK ("kind" <> 'PRODUCT' OR (
      "productId" IS NOT NULL AND "quantity" IS NOT NULL AND "unitPrice" IS NOT NULL
    )),
  CONSTRAINT "supplier_purchase_lines_positive_quantity_check"
    CHECK ("quantity" IS NULL OR ("quantity" > 0 AND "quantity" <= 100000)),
  CONSTRAINT "supplier_purchase_lines_nonnegative_price_check"
    CHECK ("unitPrice" IS NULL OR "unitPrice" >= 0),
  -- Zero is allowed per line so bonus stock ("buy 10, get 1 free") can be
  -- received and billed at nothing. The transaction total is still required to
  -- be positive, so a whole purchase cannot be worth nothing.
  CONSTRAINT "supplier_purchase_lines_nonnegative_total_check"
    CHECK ("lineTotal" >= 0),
  CONSTRAINT "supplier_purchase_lines_description_nonempty_check"
    CHECK (btrim("description") <> ''),
  CONSTRAINT "supplier_purchase_lines_position_check"
    CHECK ("position" >= 0)
);

-- CreateIndex
CREATE INDEX "supplier_purchase_lines_supplierTransactionId_position_idx"
  ON "supplier_purchase_lines"("supplierTransactionId", "position");

CREATE INDEX "supplier_purchase_lines_productId_idx"
  ON "supplier_purchase_lines"("productId");

-- One purchase line per receiving item, and one receiving item per purchase
-- line. This is the constraint that makes a duplicate stock increase for the
-- same billed line impossible to represent, not merely rejected in code.
CREATE UNIQUE INDEX "supplier_purchase_lines_receivingItemId_key"
  ON "supplier_purchase_lines"("receivingItemId");

CREATE INDEX "supplier_transactions_supplierId_receiptNumber_idx"
  ON "supplier_transactions"("supplierId", "receiptNumber");

-- AddForeignKey
ALTER TABLE "supplier_purchase_lines"
  ADD CONSTRAINT "supplier_purchase_lines_supplierTransactionId_fkey"
  FOREIGN KEY ("supplierTransactionId") REFERENCES "supplier_transactions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "supplier_purchase_lines"
  ADD CONSTRAINT "supplier_purchase_lines_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "products"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "supplier_purchase_lines"
  ADD CONSTRAINT "supplier_purchase_lines_receivingItemId_fkey"
  FOREIGN KEY ("receivingItemId") REFERENCES "supplier_receiving_items"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
