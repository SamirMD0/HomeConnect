import { DebtStatus, PaymentMethod, Role } from '@prisma/client';
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
import { DebtsService } from './debts.service';

const runDebtDbTests = process.env.RUN_PHASE4_DEBT_DB_TESTS === '1';
const databaseUrl = process.env.DATABASE_URL ?? '';
const databaseName = databaseUrl.split('/').pop()?.split('?')[0] ?? '';
const isIsolatedPhase4Database = databaseName.includes('phase4');
const describeDebtDb = runDebtDbTests && isIsolatedPhase4Database ? describe : describe.skip;
const accountPassword = 'admin-password';

describeDebtDb('single debt database flow', () => {
  it('creates debt, records payments transactionally, enforces idempotency, and cancels eligible debt', async () => {
    const adminId = randomUUID();
    const customerId = randomUUID();
    const flowDebtIds: string[] = [];
    const paymentIds: string[] = [];

    try {
      await prisma.user.create({
        data: {
          id: adminId,
          username: `phase4_admin_${adminId}`,
          password: await bcrypt.hash(accountPassword, 12),
          fullName: 'Phase 4 Admin',
          role: Role.ADMIN,
        },
      });

      await prisma.customer.create({
        data: {
          id: customerId,
          name: 'Phase 4 Customer',
          phone: `phase4_${customerId}`,
          createdBy: adminId,
        },
      });

      const debt = await DebtsService.createDebt(
        customerId,
        {
          amount: '600.00',
          description: 'Refrigerator',
          dueDate: '2026-08-10',
          notes: null,
        },
        { userId: adminId, role: Role.ADMIN }
      );
      flowDebtIds.push(debt.id);

      expect(debt.originalAmount).toBe('600.00');
      expect(debt.remainingBalance).toBe('600.00');
      expect(debt.status).toBe(DebtStatus.UNPAID);

      const partial = await DebtsService.recordDebtPayment(
        debt.id,
        {
          amount: '200.00',
          paymentDate: '2026-07-24',
          paymentMethod: PaymentMethod.CASH,
          reference: null,
          notes: null,
          idempotencyKey: 'phase4-partial-key',
        },
        { userId: adminId, role: Role.ADMIN }
      );
      paymentIds.push(partial.payments[0].id);

      expect(partial.totalPaid).toBe('200.00');
      expect(partial.remainingBalance).toBe('400.00');
      expect(partial.status).toBe(DebtStatus.PARTIALLY_PAID);
      expect(partial.payments[0].allocations[0]).toMatchObject({
        debtId: debt.id,
        installmentId: null,
        amount: '200.00',
      });

      await expect(
        DebtsService.recordDebtPayment(
          debt.id,
          {
            amount: '401.00',
            paymentDate: '2026-07-24',
            paymentMethod: PaymentMethod.CASH,
            reference: null,
            notes: null,
            idempotencyKey: 'phase4-overpay-key',
          },
          { userId: adminId, role: Role.ADMIN }
        )
      ).rejects.toThrow(OverpaymentError);

      const retry = await DebtsService.recordDebtPayment(
        debt.id,
        {
          amount: '200.00',
          paymentDate: '2026-07-24',
          paymentMethod: PaymentMethod.CASH,
          reference: null,
          notes: null,
          idempotencyKey: 'phase4-partial-key',
        },
        { userId: adminId, role: Role.ADMIN }
      );
      expect(retry.payments).toHaveLength(1);

      await expect(
        DebtsService.recordDebtPayment(
          debt.id,
          {
            amount: '201.00',
            paymentDate: '2026-07-24',
            paymentMethod: PaymentMethod.CASH,
            reference: null,
            notes: null,
            idempotencyKey: 'phase4-partial-key',
          },
          { userId: adminId, role: Role.ADMIN }
        )
      ).rejects.toThrow(PaymentIdempotencyConflictError);

      const paid = await DebtsService.recordDebtPayment(
        debt.id,
        {
          amount: '400.00',
          paymentDate: '2026-07-24',
          paymentMethod: PaymentMethod.CASH,
          reference: null,
          notes: null,
          idempotencyKey: 'phase4-final-key',
        },
        { userId: adminId, role: Role.ADMIN }
      );
      paymentIds.push(paid.payments.find((payment) => payment.id !== paymentIds[0])?.id ?? '');

      expect(paid.totalPaid).toBe('600.00');
      expect(paid.remainingBalance).toBe('0.00');
      expect(paid.status).toBe(DebtStatus.PAID);

      await expect(
        DebtsService.recordDebtPayment(
          debt.id,
          {
            amount: '1.00',
            paymentDate: '2026-07-24',
            paymentMethod: PaymentMethod.CASH,
            reference: null,
            notes: null,
            idempotencyKey: 'phase4-after-paid-key',
          },
          { userId: adminId, role: Role.ADMIN }
        )
      ).rejects.toThrow(FinancialRecordAlreadyPaidError);

      const cancelDebt = await DebtsService.createDebt(
        customerId,
        {
          amount: '50.00',
          description: 'Cancelled eligible debt',
          dueDate: '2026-08-10',
          notes: null,
        },
        { userId: adminId, role: Role.ADMIN }
      );
      flowDebtIds.push(cancelDebt.id);

      const cancelled = await DebtsService.cancelDebt(
        cancelDebt.id,
        { reason: 'Customer returned product', accountPassword },
        { userId: adminId, role: Role.ADMIN }
      );

      expect(cancelled.status).toBe(DebtStatus.CANCELLED);
      expect(cancelled.cancellation?.reason).toBe('Customer returned product');

      await expect(
        DebtsService.recordDebtPayment(
          cancelDebt.id,
          {
            amount: '1.00',
            paymentDate: '2026-07-24',
            paymentMethod: PaymentMethod.CASH,
            reference: null,
            notes: null,
            idempotencyKey: 'phase4-cancelled-payment-key',
          },
          { userId: adminId, role: Role.ADMIN }
        )
      ).rejects.toThrow(FinancialRecordCancelledError);
    } finally {
      await prisma.paymentAllocation.deleteMany({
        where: {
          OR: [
            { debtId: { in: flowDebtIds } },
            { paymentId: { in: paymentIds.filter(Boolean) } },
          ],
        },
      });
      await prisma.payment.deleteMany({
        where: {
          OR: [
            { id: { in: paymentIds.filter(Boolean) } },
            { customerId },
          ],
        },
      });
      await prisma.debt.deleteMany({ where: { id: { in: flowDebtIds } } });
      await prisma.customer.deleteMany({ where: { id: customerId } });
      await prisma.user.deleteMany({ where: { id: adminId } });
      await prisma.$disconnect();
    }
  }, 30000);
});
