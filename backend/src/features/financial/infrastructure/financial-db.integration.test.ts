import { randomUUID } from 'crypto';
import { config } from 'dotenv';
import { Currency, Role } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { describe, expect, it } from 'vitest';
import { businessDateToPrisma, prismaDateToBusinessDate } from '../domain/business-date';
import { moneyToApiString, parseMoney, roundMoney } from '../domain/money';
import { DebtsService } from '../debts/debts.service';
import { SuppliersRepository } from '../../suppliers/suppliers/suppliers.repository';

config({ path: 'backend/.env' });

const runDatabaseTests = process.env.RUN_FINANCIAL_DB_TESTS === '1' && Boolean(process.env.DATABASE_URL);
const describeDatabase = runDatabaseTests ? describe : describe.skip;

describeDatabase('financial Prisma integration', () => {
  it('round-trips Decimal and PostgreSQL DATE values and keeps financial constraints active', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    const userId = randomUUID();
    const customerId = randomUUID();
    const debtId = randomUUID();
    const paymentId = randomUUID();
    const allocationId = randomUUID();

    try {
      await prisma.user.create({
        data: {
          id: userId,
          username: `phase3_${userId}`,
          password: 'test-password',
          fullName: 'Phase 3 Integration User',
          role: 'ADMIN',
        },
      });

      await prisma.customer.create({
        data: {
          id: customerId,
          name: 'Phase 3 Integration Customer',
          phone: `phase3_${customerId}`,
          createdBy: userId,
        },
      });

      await prisma.debt.create({
        data: {
          id: debtId,
          customerId,
          description: 'Phase 3 decimal/date round trip',
          originalAmount: '123.45',
          baseOriginalAmount: '123.45',
          dueDate: businessDateToPrisma('2026-02-28'),
          createdById: userId,
        },
      });

      const debt = await prisma.debt.findUniqueOrThrow({ where: { id: debtId } });
      expect(moneyToApiString(debt.originalAmount)).toBe('123.45');
      expect(prismaDateToBusinessDate(debt.dueDate)).toBe('2026-02-28');

      await prisma.payment.create({
        data: {
          id: paymentId,
          customerId,
          totalAmount: '10.00',
          baseAmount: '10.00',
          paymentDate: businessDateToPrisma('2026-02-28'),
          createdById: userId,
        },
      });

      await expect(
        prisma.paymentAllocation.create({
          data: {
            paymentId,
            amount: '1.00',
            paymentAmount: '1.00',
          },
        })
      ).rejects.toThrow();

      await expect(
        prisma.debt.create({
          data: {
            customerId,
            description: 'Rejected zero amount',
            originalAmount: '0.00',
            baseOriginalAmount: '0.00',
            dueDate: businessDateToPrisma('2026-02-28'),
            createdById: userId,
          },
        })
      ).rejects.toThrow();

      await prisma.paymentAllocation.create({
        data: {
          id: allocationId,
          paymentId,
          debtId,
          amount: '10.00',
          paymentAmount: '10.00',
        },
      });
    } finally {
      await prisma.paymentAllocation.deleteMany({ where: { paymentId } });
      await prisma.payment.deleteMany({ where: { id: paymentId } });
      await prisma.debt.deleteMany({ where: { id: debtId } });
      await prisma.customer.deleteMany({ where: { id: customerId } });
      await prisma.user.deleteMany({ where: { id: userId } });
      await prisma.$disconnect();
    }
  }, 20000);

  it('enforces INV-16/17/18/19/25 for currency snapshots and base aggregation', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    const userId = randomUUID();
    const customerId = randomUUID();
    const supplierId = randomUUID();

    try {
      await prisma.user.create({
        data: {
          id: userId,
          username: `currency_${userId}`,
          password: 'test-password',
          fullName: 'Currency Integration User',
          role: Role.ADMIN,
        },
      });
      await prisma.customer.create({
        data: { id: customerId, name: 'Currency Customer', phone: `currency_${customerId}`, createdBy: userId },
      });
      await prisma.supplier.create({
        data: { id: supplierId, name: 'Currency Supplier', phone: `currency_${supplierId}`, createdById: userId },
      });
      await prisma.exchangeRate.create({
        data: {
          fromCurrency: Currency.USD,
          toCurrency: Currency.LBP,
          rate: '90000',
          effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
          createdById: userId,
        },
      });

      // INV-16: input rejects fractional LBP while computed values use explicit HALF_UP.
      expect(() => parseMoney('1000.50', Currency.LBP)).toThrow();
      expect(roundMoney('1000.5', Currency.LBP, Decimal.ROUND_HALF_UP).toFixed(0)).toBe('1001');

      const debt = await DebtsService.createDebt(customerId, {
        amount: '1000.00', currency: Currency.USD, description: 'Cross-currency debt',
        dueDate: '2026-12-31', notes: null,
      }, { userId, role: Role.ADMIN });
      const paid = await DebtsService.recordDebtPayment(debt.id, {
        amount: '4500000', currency: Currency.LBP, paymentDate: '2026-02-28',
        paymentMethod: 'CASH', reference: null, notes: null, idempotencyKey: `currency-${userId}`,
      }, { userId, role: Role.ADMIN });

      // INV-18: the balance function consumed the USD obligation-side amount.
      expect(paid.remainingBalance).toBe('950.00');
      const payment = await prisma.payment.findFirstOrThrow({
        where: { customerId, idempotencyKey: `currency-${userId}` }, include: { allocations: true },
      });
      expect(payment.totalAmount.toFixed(0)).toBe('4500000');
      expect(payment.baseAmount.toFixed(2)).toBe('50.00');
      expect(payment.allocations[0].amount.toFixed(2)).toBe('50.00');
      expect(payment.allocations[0].paymentAmount.toFixed(0)).toBe('4500000');
      expect(payment.allocations[0].exchangeRate.toFixed(6)).toBe('90000.000000');

      // INV-19: allocations reconcile in the payment's own currency.
      const allocatedPaymentAmount = payment.allocations.reduce(
        (sum, allocation) => sum.plus(allocation.paymentAmount), new Decimal(0)
      );
      expect(allocatedPaymentAmount.equals(payment.totalAmount)).toBe(true);

      // INV-17: appending a later rate cannot revalue the stored transaction.
      const historicalSnapshot = {
        totalAmount: payment.totalAmount.toString(), baseAmount: payment.baseAmount.toString(),
        exchangeRate: payment.exchangeRate.toString(), allocation: payment.allocations[0].amount.toString(),
      };
      await prisma.exchangeRate.create({
        data: {
          fromCurrency: Currency.USD, toCurrency: Currency.LBP, rate: '100000',
          effectiveFrom: new Date('2026-03-01T00:00:00.000Z'), createdById: userId,
        },
      });
      const unchanged = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id }, include: { allocations: true } });
      expect({
        totalAmount: unchanged.totalAmount.toString(), baseAmount: unchanged.baseAmount.toString(),
        exchangeRate: unchanged.exchangeRate.toString(), allocation: unchanged.allocations[0].amount.toString(),
      }).toEqual(historicalSnapshot);

      // INV-25: native LBP totals exceed the money cap, but authoritative aggregation uses safe USD base values.
      await prisma.supplierTransaction.createMany({
        data: [0, 1].map((index) => ({
          supplierId, type: 'SUPPLIER_DEBT' as const, direction: 'INCREASE_OWED' as const,
          amount: '9000000000', currency: Currency.LBP, exchangeRate: '90000', baseAmount: '100000.00',
          transactionDate: new Date(`2026-02-${20 + index}T00:00:00.000Z`),
          description: `Large LBP purchase ${index + 1}`, createdById: userId,
        })),
      });
      const balances = await SuppliersRepository.balances([supplierId]);
      expect(balances.get(supplierId)?.increase).toBe('200000');
    } finally {
      await prisma.paymentAllocation.deleteMany({ where: { payment: { customerId } } });
      await prisma.payment.deleteMany({ where: { customerId } });
      await prisma.debt.deleteMany({ where: { customerId } });
      await prisma.supplierTransaction.deleteMany({ where: { supplierId } });
      await prisma.exchangeRate.deleteMany({ where: { createdById: userId } });
      await prisma.supplier.deleteMany({ where: { id: supplierId } });
      await prisma.customer.deleteMany({ where: { id: customerId } });
      await prisma.user.deleteMany({ where: { id: userId } });
      await prisma.$disconnect();
    }
  }, 30000);
});
