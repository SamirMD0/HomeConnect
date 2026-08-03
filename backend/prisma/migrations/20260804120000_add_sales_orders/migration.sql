-- CreateEnum
CREATE TYPE "SalesChannel" AS ENUM ('SHOP_DIRECT', 'SHOP_DELIVERY', 'PHONE_ORDER');

-- CreateEnum
CREATE TYPE "SalesOrderFulfillmentStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'PREPARING', 'READY_FOR_DELIVERY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'RETURNED');

-- CreateEnum
CREATE TYPE "SalesOrderPaymentStatus" AS ENUM ('UNPAID', 'PARTIALLY_PAID', 'PAID');

-- CreateEnum
CREATE TYPE "SalesOrderSettlement" AS ENUM ('NONE', 'DEBT', 'INSTALLMENT');

-- CreateEnum
CREATE TYPE "SalesAuditRecordType" AS ENUM ('SALES_ORDER', 'SALES_ORDER_ITEM');

-- CreateEnum
CREATE TYPE "SalesAuditAction" AS ENUM ('CREATE', 'UPDATE_DETAILS', 'CHANGE_FULFILLMENT_STATUS', 'CHANGE_PAYMENT', 'ADD_ITEM', 'UPDATE_ITEM', 'REMOVE_ITEM', 'LINK_DEBT', 'LINK_INSTALLMENT_PLAN', 'UNLINK_FINANCIAL', 'CANCEL', 'RESTORE', 'RETURN');

-- CreateTable
CREATE TABLE "sales_orders" (
    "id" UUID NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "customerId" UUID,
    "salesChannel" "SalesChannel" NOT NULL,
    "orderDate" DATE NOT NULL,
    "deliveryDate" DATE,
    "deliveredAt" DATE,
    "fulfillmentStatus" "SalesOrderFulfillmentStatus" NOT NULL DEFAULT 'DRAFT',
    "paymentStatus" "SalesOrderPaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "settlement" "SalesOrderSettlement" NOT NULL DEFAULT 'NONE',
    "itemsSubtotal" DECIMAL(12,2) NOT NULL,
    "deliveryFee" DECIMAL(12,2),
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "paidAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "remainingAmount" DECIMAL(12,2) NOT NULL,
    "deliveryAddressSnapshot" TEXT,
    "deliveryNotes" TEXT,
    "notes" TEXT,
    "debtId" UUID,
    "installmentPlanId" UUID,
    "createdById" UUID NOT NULL,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" UUID,
    "cancelledReason" TEXT,

    CONSTRAINT "sales_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_order_items" (
    "id" UUID NOT NULL,
    "salesOrderId" UUID NOT NULL,
    "productId" UUID,
    "manualProductName" TEXT,
    "manualProductModel" TEXT,
    "productNameSnapshot" TEXT NOT NULL,
    "productModelSnapshot" TEXT,
    "skuSnapshot" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "discountAmount" DECIMAL(12,2),
    "lineTotal" DECIMAL(12,2) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_audits" (
    "id" UUID NOT NULL,
    "recordType" "SalesAuditRecordType" NOT NULL,
    "recordId" UUID NOT NULL,
    "salesOrderId" UUID,
    "action" "SalesAuditAction" NOT NULL,
    "changedById" UUID NOT NULL,
    "changedByName" TEXT NOT NULL,
    "changedByUsername" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT NOT NULL,
    "beforeValues" JSONB NOT NULL,
    "afterValues" JSONB NOT NULL,
    "requestId" TEXT,
    "ipAddress" TEXT,

    CONSTRAINT "sales_audits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sales_orders_orderNumber_key" ON "sales_orders"("orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "sales_orders_debtId_key" ON "sales_orders"("debtId");

-- CreateIndex
CREATE UNIQUE INDEX "sales_orders_installmentPlanId_key" ON "sales_orders"("installmentPlanId");

-- CreateIndex
CREATE INDEX "sales_orders_customerId_idx" ON "sales_orders"("customerId");

-- CreateIndex
CREATE INDEX "sales_orders_orderDate_idx" ON "sales_orders"("orderDate");

-- CreateIndex
CREATE INDEX "sales_orders_deliveryDate_idx" ON "sales_orders"("deliveryDate");

-- CreateIndex
CREATE INDEX "sales_orders_fulfillmentStatus_idx" ON "sales_orders"("fulfillmentStatus");

-- CreateIndex
CREATE INDEX "sales_orders_paymentStatus_idx" ON "sales_orders"("paymentStatus");

-- CreateIndex
CREATE INDEX "sales_orders_salesChannel_idx" ON "sales_orders"("salesChannel");

-- CreateIndex
CREATE INDEX "sales_orders_settlement_idx" ON "sales_orders"("settlement");

-- CreateIndex
CREATE INDEX "sales_orders_fulfillmentStatus_orderDate_idx" ON "sales_orders"("fulfillmentStatus", "orderDate");

-- CreateIndex
CREATE INDEX "sales_orders_customerId_fulfillmentStatus_idx" ON "sales_orders"("customerId", "fulfillmentStatus");

-- CreateIndex
CREATE INDEX "sales_order_items_salesOrderId_idx" ON "sales_order_items"("salesOrderId");

-- CreateIndex
CREATE INDEX "sales_order_items_productId_idx" ON "sales_order_items"("productId");

-- CreateIndex
CREATE INDEX "sales_audits_recordType_recordId_changedAt_idx" ON "sales_audits"("recordType", "recordId", "changedAt");

-- CreateIndex
CREATE INDEX "sales_audits_salesOrderId_changedAt_idx" ON "sales_audits"("salesOrderId", "changedAt");

-- CreateIndex
CREATE INDEX "sales_audits_changedAt_idx" ON "sales_audits"("changedAt");

-- AddForeignKey
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "debts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_installmentPlanId_fkey" FOREIGN KEY ("installmentPlanId") REFERENCES "installment_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "sales_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_audits" ADD CONSTRAINT "sales_audits_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "sales_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_audits" ADD CONSTRAINT "sales_audits_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
