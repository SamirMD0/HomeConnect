import { InstallmentPlanFrequency, InstallmentPlanStatus, InstallmentStatus, PaymentMethod, Role } from '@prisma/client';
import bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { describe, expect, it } from 'vitest';
import { prisma } from '../../../lib/prisma';
import {
  FinancialRecordAlreadyPaidError,
  FinancialRecordCancelledError,
  OverpaymentError,
  PaymentIdempotencyConflictError,
} from '../domain/financial-errors';
import { InstallmentPlansService } from './installment-plans.service';

const runPlanDbTests = process.env.RUN_PHASE5_INSTALLMENT_DB_TESTS === '1';
const databaseUrl = process.env.DATABASE_URL ?? '';
const databaseName = databaseUrl.split('/').pop()?.split('?')[0] ?? '';
const isIsolatedPhase5Database = databaseName.includes('phase5');
const describePlanDb = runPlanDbTests && isIsolatedPhase5Database ? describe : describe.skip;
const accountPassword = 'admin-password';

describePlanDb('installment plan database flow', () => {
  it('creates a plan, allocates payments oldest-first, enforces idempotency, and cancels eligible plans', async () => {
    const adminId = randomUUID();
    const customerId = randomUUID();
    const planIds: string[] = [];
    const installmentIds: string[] = [];

    try {
      await prisma.user.create({
        data: {
          id: adminId,
          username: `phase5_admin_${adminId}`,
          password: await bcrypt.hash(accountPassword, 12),
          fullName: 'Phase 5 Admin',
          role: Role.ADMIN,
        },
      });

      await prisma.customer.create({
        data: {
          id: customerId,
          name: 'Phase 5 Customer',
          phone: `phase5_${customerId}`,
          createdBy: adminId,
        },
      });

      const plan = await InstallmentPlansService.createPlan(
        customerId,
        {
          totalAmount: '600.00',
          description: 'Refrigerator',
          startDate: '2026-08-01',
          installmentCount: 6,
          frequency: InstallmentPlanFrequency.MONTHLY,
          notes: null,
        },
        { userId: adminId, role: Role.ADMIN }
      );
      planIds.push(plan.id);
      installmentIds.push(...plan.schedule.map((installment) => installment.id));

      expect(plan.schedule).toHaveLength(6);
      expect(plan.schedule[0].dueDate).toBe('2026-08-01');
      expect(plan.schedule[5].dueDate).toBe('2027-01-01');
      expect(plan.totalAmount).toBe('600.00');
      expect(plan.remainingBalance).toBe('600.00');

      const partial = await InstallmentPlansService.recordPlanPayment(
        plan.id,
        {
          amount: '150.00',
          paymentDate: '2026-08-15',
          paymentMethod: PaymentMethod.CASH,
          reference: null,
          notes: null,
          idempotencyKey: 'phase5-partial-key',
        },
        { userId: adminId, role: Role.ADMIN }
      );

      expect(partial.totalPaid).toBe('150.00');
      expect(partial.remainingBalance).toBe('450.00');
      expect(partial.schedule[0].status).toBe(InstallmentStatus.PAID);
      expect(partial.schedule[0].paidDate).toBe('2026-08-15');
      expect(partial.schedule[1].status).toBe(InstallmentStatus.PARTIALLY_PAID);
      expect(partial.schedule[1].remainingAmount).toBe('50.00');
      expect(partial.payments).toHaveLength(1);
      expect(partial.payments[0].allocations.map((allocation) => allocation.amount)).toEqual([
        '100.00',
        '50.00',
      ]);

      const replay = await InstallmentPlansService.recordPlanPayment(
        plan.id,
        {
          amount: '150.00',
          paymentDate: '2026-08-15',
          paymentMethod: PaymentMethod.CASH,
          reference: null,
          notes: null,
          idempotencyKey: 'phase5-partial-key',
        },
        { userId: adminId, role: Role.ADMIN }
      );
      expect(replay.payments).toHaveLength(1);

      await expect(
        InstallmentPlansService.recordPlanPayment(
          plan.id,
          {
            amount: '151.00',
            paymentDate: '2026-08-15',
            paymentMethod: PaymentMethod.CASH,
            reference: null,
            notes: null,
            idempotencyKey: 'phase5-partial-key',
          },
          { userId: adminId, role: Role.ADMIN }
        )
      ).rejects.toThrow(PaymentIdempotencyConflictError);

      await expect(
        InstallmentPlansService.recordPlanPayment(
          plan.id,
          {
            amount: '451.00',
            paymentDate: '2026-08-15',
            paymentMethod: PaymentMethod.CASH,
            reference: null,
            notes: null,
            idempotencyKey: 'phase5-overpay-key',
          },
          { userId: adminId, role: Role.ADMIN }
        )
      ).rejects.toThrow(OverpaymentError);

      const completed = await InstallmentPlansService.recordPlanPayment(
        plan.id,
        {
          amount: '450.00',
          paymentDate: '2026-08-20',
          paymentMethod: PaymentMethod.CASH,
          reference: null,
          notes: null,
          idempotencyKey: 'phase5-final-key',
        },
        { userId: adminId, role: Role.ADMIN }
      );

      expect(completed.totalPaid).toBe('600.00');
      expect(completed.remainingBalance).toBe('0.00');
      expect(completed.status).toBe(InstallmentPlanStatus.COMPLETED);
      expect(completed.schedule.every((installment) => installment.status === InstallmentStatus.PAID)).toBe(true);

      await expect(
        InstallmentPlansService.recordPlanPayment(
          plan.id,
          {
            amount: '1.00',
            paymentDate: '2026-08-20',
            paymentMethod: PaymentMethod.CASH,
            reference: null,
            notes: null,
            idempotencyKey: 'phase5-after-complete-key',
          },
          { userId: adminId, role: Role.ADMIN }
        )
      ).rejects.toThrow(FinancialRecordAlreadyPaidError);

      const cancellable = await InstallmentPlansService.createPlan(
        customerId,
        {
          totalAmount: '50.00',
          description: 'Cancellable plan',
          startDate: '2026-08-01',
          installmentCount: 1,
          frequency: InstallmentPlanFrequency.MONTHLY,
          notes: null,
        },
        { userId: adminId, role: Role.ADMIN }
      );
      planIds.push(cancellable.id);
      installmentIds.push(...cancellable.schedule.map((installment) => installment.id));

      const cancelled = await InstallmentPlansService.cancelPlan(
        cancellable.id,
        { reason: 'Agreement cancelled', accountPassword },
        { userId: adminId, role: Role.ADMIN }
      );
      expect(cancelled.status).toBe(InstallmentPlanStatus.CANCELLED);
      expect(cancelled.cancellation?.reason).toBe('Agreement cancelled');

      await expect(
        InstallmentPlansService.recordPlanPayment(
          cancellable.id,
          {
            amount: '1.00',
            paymentDate: '2026-08-20',
            paymentMethod: PaymentMethod.CASH,
            reference: null,
            notes: null,
            idempotencyKey: 'phase5-cancelled-payment-key',
          },
          { userId: adminId, role: Role.ADMIN }
        )
      ).rejects.toThrow(FinancialRecordCancelledError);
    } finally {
      await prisma.paymentAllocation.deleteMany({
        where: {
          installmentId: { in: installmentIds },
        },
      });
      await prisma.payment.deleteMany({
        where: {
          customerId,
        },
      });
      await prisma.installment.deleteMany({
        where: {
          installmentPlanId: { in: planIds },
        },
      });
      await prisma.installmentPlan.deleteMany({
        where: {
          id: { in: planIds },
        },
      });
      await prisma.customer.deleteMany({ where: { id: customerId } });
      await prisma.user.deleteMany({ where: { id: adminId } });
      await prisma.$disconnect();
    }
  }, 30000);
});
