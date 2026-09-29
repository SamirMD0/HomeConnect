import { isIsolatedTestDatabase } from '../../../test/database';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { SupplierPayablesService } from './supplier-payables.service';
import { SupplierPurchasesService } from '../purchases/supplier-purchases.service';
import { businessDateToPrisma, todayInBusinessTimezone } from '../../financial/domain/business-date';


const describeDb = process.env.RUN_SUPPLIER_PURCHASE_DB_TESTS === '1' && isIsolatedTestDatabase(process.env.DATABASE_URL) ? describe : describe.skip;
const db = new PrismaClient();

describeDb('supplier payable database invariants', () => {
  afterAll(() => db.$disconnect());
  it('derives partial FIFO payment/credit settlement while leaving source transactions byte-for-byte unchanged', async () => {
    const userId = randomUUID();
    const supplierId = randomUUID();
    await db.user.create({ data: { id: userId, username: `aging-${userId}`, fullName: 'Aging Admin', role: 'ADMIN', password: 'unused-test-password-hash' } });
    await db.supplier.create({ data: { id: supplierId, name: 'Aging Test Supplier', phone: `aging-${supplierId}`, createdById: userId } });
    try {
      for (const [amount, dueDate, type, direction] of [
        ['100', '2026-08-01', 'SUPPLIER_DEBT', 'INCREASE_OWED'], ['100', '2026-09-20', 'SUPPLIER_DEBT', 'INCREASE_OWED'],
        ['40', null, 'SUPPLIER_DEBT', 'INCREASE_OWED'], ['60', null, 'SUPPLIER_PAYMENT', 'DECREASE_OWED'],
        ['70', null, 'SUPPLIER_CREDIT', 'DECREASE_OWED'],
      ] as const) await db.supplierTransaction.create({ data: { supplierId, amount, baseAmount: amount, type, direction,
        transactionDate: businessDateToPrisma('2026-08-01'), dueDate: dueDate ? businessDateToPrisma(dueDate) : null,
        description: 'FIFO fixture', createdById: userId,
      } });
      const before = await db.supplierTransaction.findMany({ where: { supplierId }, orderBy: { id: 'asc' } });
      const report = await SupplierPayablesService.get('2026-09-14');
      const position = report.suppliers.find((s) => s.supplier.id === supplierId);
      expect(position).toMatchObject({ totalPayables: '110.00', ledgerBalance: '110.00', independentlyComputedLedgerBalance: '110.00', difference: '0.00' });
      expect(report.rows.filter((r) => r.supplier.id === supplierId).map((r) => [r.status, r.remainingAmount])).toEqual([['DUE_SOON', '70.00'], ['UNSCHEDULED', '40.00']]);
      expect(await db.supplierTransaction.findMany({ where: { supplierId }, orderBy: { id: 'asc' } })).toEqual(before);
      await db.supplierTransaction.update({ where: { id: before.find((r) => r.type === 'SUPPLIER_CREDIT')!.id }, data: { status: 'REMOVED', removedAt: new Date(), removedById: userId, removedReason: 'Test removal' } });
      expect((await SupplierPayablesService.get('2026-09-14')).suppliers.find((s) => s.supplier.id === supplierId)?.ledgerBalance).toBe('180.00');
    } finally {
      await db.supplierTransaction.deleteMany({ where: { supplierId } });
      await db.supplier.delete({ where: { id: supplierId } });
      await db.user.delete({ where: { id: userId } });
    }
  }, 30_000);

  it('persists purchase due dates and protects them in idempotent replay without changing payment amounts', async () => {
    const userId = randomUUID();
    const supplierId = randomUUID();
    const taxRateId = randomUUID();
    const taxProfileId = randomUUID();
    await db.user.create({ data: { id: userId, username: `due-${userId}`, fullName: 'Due Admin', role: 'ADMIN', password: 'unused-test-password-hash' } });
    await db.supplier.create({ data: { id: supplierId, name: 'Due Test Supplier', phone: `due-${supplierId}`, createdById: userId } });
    try {
      await db.taxRate.create({ data: { id: taxRateId, code: `DUE_ZERO_${taxRateId}`, name: 'Due date test zero rate', nameAr: 'اختبار', ratePercent: '0.000', effectiveFrom: new Date('2020-01-01T00:00:00.000Z'), createdById: userId } });
      await db.taxProfile.create({ data: { id: taxProfileId, code: `DUE_ZERO_${taxProfileId}`, name: 'Due date test zero profile', nameAr: 'اختبار', taxRateId } });
      const input = { idempotencyKey: randomUUID(), transactionDate: todayInBusinessTimezone(), dueDate: '2030-01-01',
        description: 'Scheduled supplier purchase', receiveStock: false, paidAmount: '50.00',
        lines: [{ kind: 'MANUAL' as const, description: 'Supplier service', amount: '100.00', taxProfileId }],
      };
      const first = await SupplierPurchasesService.create(supplierId, input, { userId, role: 'ADMIN' }, {});
      expect(first.dueDate).toBe('2030-01-01');
      const replay = await SupplierPurchasesService.create(supplierId, input, { userId, role: 'ADMIN' }, {});
      expect(replay.id).toBe(first.id);
      await expect(SupplierPurchasesService.create(supplierId, { ...input, dueDate: '2030-01-02' }, { userId, role: 'ADMIN' }, {})).rejects.toThrow();
      const payment = await db.supplierTransaction.findFirstOrThrow({ where: { supplierId, type: 'SUPPLIER_PAYMENT' } });
      expect(payment.amount.toFixed(2)).toBe('50.00');
      expect(payment.dueDate).toBeNull();
      expect(await db.supplierTransaction.count({ where: { supplierId } })).toBe(2);
    } finally {
      await db.supplierAudit.deleteMany({ where: { supplierId } });
      await db.supplierPurchaseLine.deleteMany({ where: { supplierTransaction: { supplierId } } });
      await db.supplierTransaction.deleteMany({ where: { supplierId } });
      await db.supplier.delete({ where: { id: supplierId } });
      await db.taxProfile.delete({ where: { id: taxProfileId } });
      await db.taxRate.delete({ where: { id: taxRateId } });
      await db.user.delete({ where: { id: userId } });
    }
  }, 30_000);
});
