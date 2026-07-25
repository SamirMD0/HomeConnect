-- CreateEnum
CREATE TYPE "DebtStatus" AS ENUM ('UNPAID', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InstallmentPlanFrequency" AS ENUM ('MONTHLY');

-- CreateEnum
CREATE TYPE "InstallmentPlanStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'OVERDUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InstallmentStatus" AS ENUM ('PENDING', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'BANK_TRANSFER', 'OTHER');

-- CreateTable
CREATE TABLE "debts" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "originalAmount" DECIMAL(12,2) NOT NULL,
    "dueDate" DATE NOT NULL,
    "status" "DebtStatus" NOT NULL DEFAULT 'UNPAID',
    "notes" TEXT,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" UUID,
    "cancelReason" TEXT,

    CONSTRAINT "debts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "debts_originalAmount_positive_check" CHECK ("originalAmount" > 0)
);

-- CreateTable
CREATE TABLE "installment_plans" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "startDate" DATE NOT NULL,
    "installmentCount" INTEGER NOT NULL,
    "frequency" "InstallmentPlanFrequency" NOT NULL DEFAULT 'MONTHLY',
    "status" "InstallmentPlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" UUID,
    "cancelReason" TEXT,

    CONSTRAINT "installment_plans_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "installment_plans_totalAmount_positive_check" CHECK ("totalAmount" > 0),
    CONSTRAINT "installment_plans_installmentCount_positive_check" CHECK ("installmentCount" > 0)
);

-- CreateTable
CREATE TABLE "installments" (
    "id" UUID NOT NULL,
    "installmentPlanId" UUID NOT NULL,
    "installmentNumber" INTEGER NOT NULL,
    "dueDate" DATE NOT NULL,
    "amountDue" DECIMAL(12,2) NOT NULL,
    "status" "InstallmentStatus" NOT NULL DEFAULT 'PENDING',
    "paidDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "installments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "installments_amountDue_positive_check" CHECK ("amountDue" > 0),
    CONSTRAINT "installments_installmentNumber_positive_check" CHECK ("installmentNumber" > 0)
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "paymentDate" DATE NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "reference" TEXT,
    "notes" TEXT,
    "idempotencyKey" TEXT,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voidedAt" TIMESTAMP(3),
    "voidedById" UUID,
    "voidReason" TEXT,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payments_totalAmount_positive_check" CHECK ("totalAmount" > 0)
);

-- CreateTable
CREATE TABLE "payment_allocations" (
    "id" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "debtId" UUID,
    "installmentId" UUID,
    "amount" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payment_allocations_amount_positive_check" CHECK ("amount" > 0),
    CONSTRAINT "payment_allocations_target_xor_check" CHECK (
        ("debtId" IS NOT NULL AND "installmentId" IS NULL)
        OR
        ("debtId" IS NULL AND "installmentId" IS NOT NULL)
    )
);

-- CreateIndex
CREATE INDEX "debts_customerId_idx" ON "debts"("customerId");

-- CreateIndex
CREATE INDEX "debts_dueDate_idx" ON "debts"("dueDate");

-- CreateIndex
CREATE INDEX "debts_status_idx" ON "debts"("status");

-- CreateIndex
CREATE INDEX "debts_customerId_status_idx" ON "debts"("customerId", "status");

-- CreateIndex
CREATE INDEX "installment_plans_customerId_idx" ON "installment_plans"("customerId");

-- CreateIndex
CREATE INDEX "installment_plans_status_idx" ON "installment_plans"("status");

-- CreateIndex
CREATE INDEX "installment_plans_startDate_idx" ON "installment_plans"("startDate");

-- CreateIndex
CREATE UNIQUE INDEX "installments_installmentPlanId_installmentNumber_key" ON "installments"("installmentPlanId", "installmentNumber");

-- CreateIndex
CREATE INDEX "installments_installmentPlanId_idx" ON "installments"("installmentPlanId");

-- CreateIndex
CREATE INDEX "installments_dueDate_idx" ON "installments"("dueDate");

-- CreateIndex
CREATE INDEX "installments_status_idx" ON "installments"("status");

-- CreateIndex
CREATE INDEX "installments_installmentPlanId_status_idx" ON "installments"("installmentPlanId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "payments_idempotencyKey_key" ON "payments"("idempotencyKey");

-- CreateIndex
CREATE INDEX "payments_customerId_idx" ON "payments"("customerId");

-- CreateIndex
CREATE INDEX "payments_paymentDate_idx" ON "payments"("paymentDate");

-- CreateIndex
CREATE INDEX "payments_createdById_idx" ON "payments"("createdById");

-- CreateIndex
CREATE INDEX "payment_allocations_paymentId_idx" ON "payment_allocations"("paymentId");

-- CreateIndex
CREATE INDEX "payment_allocations_debtId_idx" ON "payment_allocations"("debtId");

-- CreateIndex
CREATE INDEX "payment_allocations_installmentId_idx" ON "payment_allocations"("installmentId");

-- AddForeignKey
ALTER TABLE "debts" ADD CONSTRAINT "debts_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debts" ADD CONSTRAINT "debts_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debts" ADD CONSTRAINT "debts_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installments" ADD CONSTRAINT "installments_installmentPlanId_fkey" FOREIGN KEY ("installmentPlanId") REFERENCES "installment_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "debts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_installmentId_fkey" FOREIGN KEY ("installmentId") REFERENCES "installments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
