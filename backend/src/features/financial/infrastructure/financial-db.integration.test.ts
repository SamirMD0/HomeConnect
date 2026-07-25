import { randomUUID } from 'crypto';
import { config } from 'dotenv';
import { describe, expect, it } from 'vitest';
import { businessDateToPrisma, prismaDateToBusinessDate } from '../domain/business-date';
import { moneyToApiString } from '../domain/money';

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
          paymentDate: businessDateToPrisma('2026-02-28'),
          createdById: userId,
        },
      });

      await expect(
        prisma.paymentAllocation.create({
          data: {
            paymentId,
            amount: '1.00',
          },
        })
      ).rejects.toThrow();

      await expect(
        prisma.debt.create({
          data: {
            customerId,
            description: 'Rejected zero amount',
            originalAmount: '0.00',
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
});
