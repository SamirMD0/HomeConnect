-- CreateEnum
CREATE TYPE "RepairKind" AS ENUM ('MIGRATION', 'REPAIR');

-- CreateEnum
CREATE TYPE "RepairStatus" AS ENUM ('APPLIED', 'SKIPPED_NOT_NEEDED', 'FAILED', 'BLOCKED_NO_BACKUP', 'VERIFY_FAILED');

-- CreateTable
CREATE TABLE "repair_history" (
    "id" UUID NOT NULL,
    "repairId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "kind" "RepairKind" NOT NULL,
    "checksum" TEXT NOT NULL,
    "status" "RepairStatus" NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedById" UUID,
    "appliedByName" TEXT NOT NULL,
    "backupPath" TEXT,
    "durationMs" INTEGER,
    "errorMessage" TEXT,

    CONSTRAINT "repair_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "repair_history_appliedAt_idx" ON "repair_history"("appliedAt");

-- CreateIndex
CREATE INDEX "repair_history_repairId_appliedAt_idx" ON "repair_history"("repairId", "appliedAt");

-- AddForeignKey
ALTER TABLE "repair_history" ADD CONSTRAINT "repair_history_appliedById_fkey" FOREIGN KEY ("appliedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
