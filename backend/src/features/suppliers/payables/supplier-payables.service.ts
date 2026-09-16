import { prisma } from '../../../lib/prisma';
import { prismaDateToBusinessDate, todayInBusinessTimezone } from '../../financial/domain/business-date';
import { buildSupplierPayables } from './supplier-payables';

export class SupplierPayablesService {
  static async get(businessDate = todayInBusinessTimezone()) {
    // One read gives a consistent active ledger snapshot; no FIFO writes.
    // Archived suppliers remain visible when money is still owed.
    const records = await prisma.supplierTransaction.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, supplier: { select: { id: true, name: true, phone: true } },
        direction: true, type: true, baseAmount: true, amount: true, currency: true,
        transactionDate: true, createdAt: true, dueDate: true, description: true, receiptNumber: true },
    });
    return buildSupplierPayables(records.map((r) => ({ ...r,
      transactionDate: prismaDateToBusinessDate(r.transactionDate), createdAt: r.createdAt.toISOString(),
      dueDate: r.dueDate ? prismaDateToBusinessDate(r.dueDate) : null,
    })), businessDate);
  }
}
