import { DebtStatus, InstallmentPlanFrequency, PaymentMethod, Role } from '@prisma/client';
import { randomUUID } from 'crypto';
import { describe, expect, it } from 'vitest';
import { prisma } from '../../../lib/prisma';
import { DebtsService } from '../debts/debts.service';
import { InstallmentPlansService } from '../installment-plans/installment-plans.service';
import { CustomerFinancialSummaryService } from './customer-financial-summary.service';

const runSummaryDbTests = process.env.RUN_PHASE6_CUSTOMER_SUMMARY_DB_TESTS === '1';
const databaseUrl = process.env.DATABASE_URL ?? '';
const databaseName = databaseUrl.split('/').pop()?.split('?')[0] ?? '';
const isIsolatedPhase6Database = databaseName.includes('phase6');
const describeSummaryDb = runSummaryDbTests && isIsolatedPhase6Database ? describe : describe.skip;

describeSummaryDb('customer financial summary database flow', () => {
  it('summarizes debts, plans, multi-allocation plan payments, and recent history', async () => {
    const adminId = randomUUID();
    const customerId = randomUUID();
    const debtIds: string[] = [];
    const planIds: string[] = [];

    try {
      await prisma.user.create({
        data: {
          id: adminId,
          username: `phase6_admin_${adminId}`,
          password: 'test-password',
          fullName: 'Phase 6 Admin',
          role: Role.ADMIN,
        },
      });

      await prisma.customer.create({
        data: {
          id: customerId,
          name: 'Phase 6 Customer',
          phone: `phase6_${customerId}`,
          createdBy: adminId,
        },
      });

      const debt = await DebtsService.createDebt(
        customerId,
        {
          amount: '600.00',
          description: 'Phase 6 debt',
          dueDate: '2026-08-10',
          notes: null,
        },
        { userId: adminId, role: Role.ADMIN }
      );
      debtIds.push(debt.id);

      await DebtsService.recordDebtPayment(
        debt.id,
        {
          amount: '200.00',
          paymentDate: '2026-07-24',
          paymentMethod: PaymentMethod.CASH,
          reference: null,
          notes: null,
          idempotencyKey: `phase6-debt-payment-${customerId}`,
        },
        { userId: adminId, role: Role.ADMIN }
      );

      const plan = await InstallmentPlansService.createPlan(
        customerId,
        {
          totalAmount: '600.00',
          description: 'Phase 6 plan',
          startDate: '2026-08-01',
          installmentCount: 6,
          frequency: InstallmentPlanFrequency.MONTHLY,
          notes: null,
        },
        { userId: adminId, role: Role.ADMIN }
      );
      planIds.push(plan.id);

      await InstallmentPlansService.recordPlanPayment(
        plan.id,
        {
          amount: '150.00',
          paymentDate: '2026-08-15',
          paymentMethod: PaymentMethod.CASH,
          reference: null,
          notes: null,
          idempotencyKey: `phase6-plan-payment-${customerId}`,
        },
        { userId: adminId, role: Role.ADMIN }
      );

      const summary = await CustomerFinancialSummaryService.getCustomerFinancialSummary(customerId, {
        includeCancelled: false,
        includePayments: true,
        paymentLimit: 20,
        debtLimit: 50,
        planLimit: 50,
      });

      expect(summary.summary.singleDebtOutstanding).toBe('400.00');
      expect(summary.summary.installmentPlanOutstanding).toBe('450.00');
      expect(summary.summary.totalOutstanding).toBe('850.00');
      expect(summary.summary.totalPaid).toBe('350.00');
      expect(summary.debts).toHaveLength(1);
      expect(summary.debts[0]).toMatchObject({
        id: debt.id,
        remainingBalance: '400.00',
        calculatedStatus: DebtStatus.PARTIALLY_PAID,
      });
      expect(summary.installmentPlans).toHaveLength(1);
      expect(summary.installmentPlans[0]).toMatchObject({
        id: plan.id,
        remainingBalance: '450.00',
      });
      expect(summary.recentPayments).toHaveLength(2);
      expect(summary.recentPayments.some((payment) => payment.allocations.length > 1)).toBe(true);
      expect(summary.nextDue?.date).toBe('2026-08-10');
    } finally {
      await prisma.paymentAllocation.deleteMany({
        where: {
          OR: [
            { debtId: { in: debtIds } },
            {
              installment: {
                is: {
                  installmentPlanId: { in: planIds },
                },
              },
            },
          ],
        },
      });
      await prisma.payment.deleteMany({ where: { customerId } });
      await prisma.installment.deleteMany({ where: { installmentPlanId: { in: planIds } } });
      await prisma.installmentPlan.deleteMany({ where: { id: { in: planIds } } });
      await prisma.debt.deleteMany({ where: { id: { in: debtIds } } });
      await prisma.customer.deleteMany({ where: { id: customerId } });
      await prisma.user.deleteMany({ where: { id: adminId } });
      await prisma.$disconnect();
    }
  }, 30000);
});
