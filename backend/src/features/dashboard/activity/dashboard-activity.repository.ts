import { DebtKind } from '@prisma/client';
import { activityLogModel, prisma } from '../../../lib/prisma';

export class DashboardActivityRepository {
  static async load(limit: number) {
    const actor = { select: { fullName: true } } as const;
    const take = Math.min(limit, 15);
    const [legacy, payments, debts, plans, supplierTransactions, serviceJobs, serviceAudits, products, presets] = await Promise.all([
      activityLogModel.findMany({ take, orderBy: { createdAt: 'desc' }, include: { user: actor } }),
      prisma.payment.findMany({ take, orderBy: { createdAt: 'desc' }, include: { customer: { select: { name: true } }, createdBy: actor } }),
      prisma.debt.findMany({ where: { kind: DebtKind.STANDARD }, take, orderBy: { createdAt: 'desc' }, include: { customer: { select: { name: true } }, createdBy: actor } }),
      prisma.installmentPlan.findMany({ take, orderBy: { createdAt: 'desc' }, include: { customer: { select: { name: true } }, createdBy: actor } }),
      prisma.supplierTransaction.findMany({ take, orderBy: { createdAt: 'desc' }, include: { supplier: { select: { name: true } }, createdBy: actor } }),
      prisma.serviceJob.findMany({ take, orderBy: { createdAt: 'desc' }, include: { customer: { select: { name: true } }, createdBy: actor } }),
      prisma.serviceAudit.findMany({ where: { serviceJobId: { not: null } }, take, orderBy: { changedAt: 'desc' }, include: { serviceJob: { select: { jobNumber: true } } } }),
      prisma.product.findMany({ take, orderBy: { createdAt: 'desc' }, include: { createdBy: actor } }),
      prisma.pricingPreset.findMany({ take, orderBy: { updatedAt: 'desc' }, include: { updatedBy: actor, createdBy: actor } }),
    ]);
    return { legacy, payments, debts, plans, supplierTransactions, serviceJobs, serviceAudits, products, presets };
  }
}

export type DashboardActivityRecords = Awaited<ReturnType<typeof DashboardActivityRepository.load>>;

