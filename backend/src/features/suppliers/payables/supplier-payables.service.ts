import { scopeWhere, type BranchScope } from '../../branches/branch-scope';
import { branchFields } from '../../branches/branch-breakdown';
import { prisma } from '../../../lib/prisma';
import { prismaDateToBusinessDate, todayInBusinessTimezone } from '../../financial/domain/business-date';
import { buildSupplierPayables } from './supplier-payables';

export class SupplierPayablesService {
  static async get(businessDate = todayInBusinessTimezone(), scope: BranchScope) {
    // One read gives a consistent active ledger snapshot; no FIFO writes.
    // Archived suppliers remain visible when money is still owed.
    const records = await prisma.supplierTransaction.findMany({
      where: { ...scopeWhere(scope), status: 'ACTIVE' },
      select: { id: true, branchId:true, branch:{select:{name:true}}, supplier: { select: { id: true, name: true, phone: true } },
        direction: true, type: true, baseAmount: true, amount: true, currency: true,
        transactionDate: true, createdAt: true, dueDate: true, description: true, receiptNumber: true },
    });
    const report = buildSupplierPayables(records.map((r) => ({ ...r,
      transactionDate: prismaDateToBusinessDate(r.transactionDate), createdAt: r.createdAt.toISOString(),
      dueDate: r.dueDate ? prismaDateToBusinessDate(r.dueDate) : null,
    })), businessDate);
    const byId = new Map(records.map(row => [row.id, row]));
    const bySupplier = new Map(records.map(row => [row.supplier.id,row]));
    return {...report,
      suppliers:report.suppliers.map(row => ({...row,...branchFields(bySupplier.get(row.supplier.id)!)})),
      summary:{...report.summary,oldestOverdue:report.summary.oldestOverdue ? {...report.summary.oldestOverdue,...branchFields(byId.get(report.summary.oldestOverdue.id)!)} : null},
      rows:report.rows.map(row => ({...row,...branchFields(byId.get(row.id)!)}))};
  }
}
