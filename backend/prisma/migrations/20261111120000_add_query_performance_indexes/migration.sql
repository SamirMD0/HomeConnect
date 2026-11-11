-- Query performance indexes: per-branch dashboard/list filters and foreign keys
-- that are joined or looked up but had no leading index. Additive only.

-- CreateIndex
CREATE INDEX IF NOT EXISTS "customer_import_accounts_sourceCustomerImportId_idx" ON "customer_import_accounts"("sourceCustomerImportId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "activity_logs_branchId_createdAt_idx" ON "activity_logs"("branchId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "activity_logs_userId_idx" ON "activity_logs"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "debts_branchId_status_idx" ON "debts"("branchId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "installment_plans_branchId_status_idx" ON "installment_plans"("branchId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "payments_branchId_paymentDate_idx" ON "payments"("branchId", "paymentDate");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "sales_orders_branchId_orderDate_idx" ON "sales_orders"("branchId", "orderDate");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "sales_return_items_salesOrderStockFulfillmentId_idx" ON "sales_return_items"("salesOrderStockFulfillmentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "customer_credit_applications_salesOrderId_idx" ON "customer_credit_applications"("salesOrderId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "customer_credit_applications_debtId_idx" ON "customer_credit_applications"("debtId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "customer_credit_applications_installmentId_idx" ON "customer_credit_applications"("installmentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "supplier_audits_supplierTransactionId_idx" ON "supplier_audits"("supplierTransactionId");

