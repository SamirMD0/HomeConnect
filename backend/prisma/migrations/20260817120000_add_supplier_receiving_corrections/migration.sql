-- Admin correction of a posted supplier receiving document.
--
-- Entirely additive. No row is deleted, no existing column changes type, and no
-- business data is backfilled: every new column is nullable or defaulted, so
-- every receiving written before this migration reads back as POSTED / ACTIVE,
-- which is exactly what it is.
--
-- What this enables is a correction path that cannot corrupt stock: an admin may
-- fix the reference number and note, or void the document — which writes an
-- opposite PURCHASE_RECEIPT_REVERSAL movement per line. The original document,
-- its lines, and its original PURCHASE_RECEIPT movements are never touched.

-- AlterEnum
-- Reserved type. Nothing may select it in the manual stock-movement UI; only the
-- receiving void path writes it. Kept distinct from MANUAL_REMOVE so a reversal
-- is never confused with a hand-entered removal in history or the integrity report.
ALTER TYPE "StockMovementType" ADD VALUE IF NOT EXISTS 'PURCHASE_RECEIPT_REVERSAL';

-- CreateEnum
CREATE TYPE "SupplierReceivingStatus" AS ENUM ('POSTED', 'VOIDED');
CREATE TYPE "SupplierReceivingItemStatus" AS ENUM ('ACTIVE', 'REVERSED');
CREATE TYPE "SupplierReceivingAuditAction" AS ENUM ('UPDATE_METADATA', 'VOID');

-- AlterTable
ALTER TABLE "supplier_receivings"
  ADD COLUMN "status" "SupplierReceivingStatus" NOT NULL DEFAULT 'POSTED',
  ADD COLUMN "voidedAt" TIMESTAMP(3),
  ADD COLUMN "voidedById" UUID,
  ADD COLUMN "voidReason" TEXT;

-- A void is only ever a complete, attributed, explained act. Half of one — a
-- voided flag with no author, or an author with no reason — is unrepresentable.
ALTER TABLE "supplier_receivings"
  ADD CONSTRAINT "supplier_receivings_void_shape_check"
    CHECK (
      ("status" = 'POSTED' AND "voidedAt" IS NULL AND "voidedById" IS NULL AND "voidReason" IS NULL)
      OR ("status" = 'VOIDED' AND "voidedAt" IS NOT NULL AND "voidedById" IS NOT NULL
          AND btrim(COALESCE("voidReason", '')) <> '')
    );

ALTER TABLE "supplier_receiving_items"
  ADD COLUMN "status" "SupplierReceivingItemStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "reversalStockMovementId" UUID,
  ADD COLUMN "reversedAt" TIMESTAMP(3),
  ADD COLUMN "reversedById" UUID,
  ADD COLUMN "reversalReason" TEXT;

-- A REVERSED line must name the movement that gave the stock back. That link is
-- what makes "stock was reversed but no movement exists" impossible to store.
ALTER TABLE "supplier_receiving_items"
  ADD CONSTRAINT "supplier_receiving_items_reversal_shape_check"
    CHECK (
      ("status" = 'ACTIVE' AND "reversalStockMovementId" IS NULL AND "reversedAt" IS NULL
        AND "reversedById" IS NULL AND "reversalReason" IS NULL)
      OR ("status" = 'REVERSED' AND "reversalStockMovementId" IS NOT NULL AND "reversedAt" IS NOT NULL
          AND "reversedById" IS NOT NULL AND btrim(COALESCE("reversalReason", '')) <> '')
    );

-- CreateTable
CREATE TABLE "supplier_receiving_audits" (
  "id" UUID NOT NULL,
  "receivingId" UUID NOT NULL,
  "action" "SupplierReceivingAuditAction" NOT NULL,
  "changedById" UUID NOT NULL,
  "changedByName" TEXT NOT NULL,
  "changedByUsername" TEXT NOT NULL,
  "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reason" TEXT NOT NULL,
  "beforeValues" JSONB NOT NULL,
  "afterValues" JSONB NOT NULL,
  "requestId" TEXT,
  "ipAddress" TEXT,

  CONSTRAINT "supplier_receiving_audits_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "supplier_receiving_audits_reason_nonempty_check"
    CHECK (btrim("reason") <> '')
);

-- CreateIndex
CREATE UNIQUE INDEX "supplier_receiving_items_reversalStockMovementId_key"
  ON "supplier_receiving_items"("reversalStockMovementId");

CREATE INDEX "supplier_receivings_status_idx" ON "supplier_receivings"("status");
CREATE INDEX "supplier_receiving_items_status_idx" ON "supplier_receiving_items"("status");
CREATE INDEX "supplier_receiving_audits_receivingId_changedAt_idx"
  ON "supplier_receiving_audits"("receivingId", "changedAt");
CREATE INDEX "supplier_receiving_audits_changedAt_idx"
  ON "supplier_receiving_audits"("changedAt");

-- AddForeignKey
ALTER TABLE "supplier_receivings"
  ADD CONSTRAINT "supplier_receivings_voidedById_fkey"
  FOREIGN KEY ("voidedById") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "supplier_receiving_items"
  ADD CONSTRAINT "supplier_receiving_items_reversalStockMovementId_fkey"
  FOREIGN KEY ("reversalStockMovementId") REFERENCES "stock_movements"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "supplier_receiving_items"
  ADD CONSTRAINT "supplier_receiving_items_reversedById_fkey"
  FOREIGN KEY ("reversedById") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "supplier_receiving_audits"
  ADD CONSTRAINT "supplier_receiving_audits_receivingId_fkey"
  FOREIGN KEY ("receivingId") REFERENCES "supplier_receivings"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "supplier_receiving_audits"
  ADD CONSTRAINT "supplier_receiving_audits_changedById_fkey"
  FOREIGN KEY ("changedById") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
