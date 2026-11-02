-- A prepaid purchase can be converted on handover: the unpaid remainder becomes
-- either a debt (remainderDebtId, already present) or an installment plan. This
-- records the plan it became, so undoing the conversion can find it again.
-- Nothing here changes any existing row.

ALTER TABLE "prepaid_purchases" ADD COLUMN "remainderInstallmentPlanId" UUID;

CREATE UNIQUE INDEX "prepaid_purchases_remainderInstallmentPlanId_key" ON "prepaid_purchases"("remainderInstallmentPlanId");

ALTER TABLE "prepaid_purchases" ADD CONSTRAINT "prepaid_purchases_remainderInstallmentPlanId_fkey" FOREIGN KEY ("remainderInstallmentPlanId") REFERENCES "installment_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
