import { scopeWhere, type BranchScope } from '../../branches/branch-scope';
import { DebtKind } from '@prisma/client';
import { activityLogModel, prisma } from '../../../lib/prisma';

export class DashboardActivityRepository {
  static async load(limit: number, role: string, scope: BranchScope) {
    const actor = { select: { fullName: true } } as const;
    const take = Math.min(limit, 15);
    const [legacy, payments, debts, plans, supplierTransactions, serviceJobs, serviceAudits, products, presets] = await Promise.all([
      activityLogModel.findMany({ where: { OR: [scopeWhere(scope), ...(role === 'ADMIN' ? [{branchId:null}] : [])] }, take, orderBy: { createdAt: 'desc' }, include: { user: actor, branch: {select:{name:true}} } }),
      prisma.payment.findMany({ where: scopeWhere(scope),  take, orderBy: { createdAt: 'desc' }, include: { branch: {select:{name:true}}, customer: { select: { name: true } }, createdBy: actor } }),
      prisma.debt.findMany({ where: { ...scopeWhere(scope),  kind: DebtKind.STANDARD }, take, orderBy: { createdAt: 'desc' }, include: { branch: {select:{name:true}}, customer: { select: { name: true } }, createdBy: actor } }),
      prisma.installmentPlan.findMany({ where: scopeWhere(scope),  take, orderBy: { createdAt: 'desc' }, include: { branch: {select:{name:true}}, customer: { select: { name: true } }, createdBy: actor } }),
      prisma.supplierTransaction.findMany({ where: scopeWhere(scope),  take, orderBy: { createdAt: 'desc' }, include: { branch: {select:{name:true}}, supplier: { select: { name: true } }, createdBy: actor } }),
      prisma.serviceJob.findMany({ where: scopeWhere(scope),  take, orderBy: { createdAt: 'desc' }, include: { branch: {select:{name:true}}, customer: { select: { name: true } }, createdBy: actor } }),
      prisma.serviceAudit.findMany({ where: { serviceJobId: { not: null }, serviceJob: scopeWhere(scope) }, take, orderBy: { changedAt: 'desc' }, include: { serviceJob: { select: { jobNumber: true, branchId: true, branch: {select:{name:true}} } } } }),
      role === 'ADMIN' ? prisma.product.findMany({ take, orderBy: { createdAt: 'desc' }, include: { createdBy: actor } }) : Promise.resolve([]),
      role === 'ADMIN' ? prisma.pricingPreset.findMany({ take, orderBy: { updatedAt: 'desc' }, include: { updatedBy: actor, createdBy: actor } }) : Promise.resolve([]),
    ]);
    return { legacy, payments, debts, plans, supplierTransactions, serviceJobs, serviceAudits, products, presets };
  }
}

export type DashboardActivityRecords = Awaited<ReturnType<typeof DashboardActivityRepository.load>>;

