import { Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { buildSyncRecord } from '../sync-feed.service';
import type { BranchScope } from '../../branches/branch-scope';

export const snapshotEntities = ['product', 'customer', 'supplier', 'supplier_bill', 'branch', 'category', 'user', 'sales_order'] as const;
export async function snapshotCursor(): Promise<string | null> {
  try {
    return await prisma.$transaction(async tx => {
      await tx.$executeRaw`SET LOCAL lock_timeout = '2s'`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(74103, 1)`;
      return ((await tx.syncChange.aggregate({ _max: { seq: true } }))._max.seq ?? 0n).toString();
    });
  } catch (error) {
    const e = error as { code?: string; meta?: { code?: string } };
    if (e.code === '55P03' || e.meta?.code === '55P03') return null;
    throw error;
  }
}
export async function systemScope(): Promise<BranchScope> {
  return { mode: 'all', branchIds: (await prisma.branch.findMany({ select: { id: true } })).map(branch => branch.id) };
}

export async function sourcePage(entity: string, after: string, cutoff: string, scope: BranchScope) {
  const base = { where: { id: { gt: after || undefined } }, orderBy: { id: 'asc' as const }, take: 200 };
  const selected = { id: true, branchId: true } as const;
  let rows: { id: string; branchId?: string | null; billGroupId?: string | null }[];
  switch (entity) {
    case 'product': rows = await prisma.product.findMany({ ...base, select: { id: true } }); break;
    case 'customer': rows = await prisma.customer.findMany({ ...base, where: { ...base.where, deletedAt: null }, select: selected }); break;
    case 'supplier': rows = await prisma.supplier.findMany({ ...base, select: selected }); break;
    case 'supplier_bill': rows = await prisma.supplierReceivingReceipt.findMany({ ...base,
      where: { ...base.where, deletedAt: null, replacedAt: null, supplierReceivingId: null, supplierTransactionId: null },
      select: { ...selected, billGroupId: true } }); break;
    case 'branch': rows = await prisma.branch.findMany({ ...base, select: { id: true } }); break;
    case 'category': rows = await prisma.category.findMany({ ...base, select: { id: true } }); break;
    case 'user': rows = await prisma.user.findMany({ ...base, where: { ...base.where, isActive: true, deletedAt: null }, select: { id: true } }); break;
    case 'sales_order': rows = await prisma.salesOrder.findMany({ ...base, where: { ...base.where, orderDate: { gte: new Date(cutoff) } }, select: selected }); break;
    default: throw new Error('Unsupported snapshot entity');
  }
  const records = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const id = entity === 'supplier_bill' ? row.billGroupId ?? row.id : row.id;
    if (seen.has(id)) continue;
    seen.add(id);
    const record = await buildSyncRecord({ entity, entityId: id, branchId: row.branchId ?? null }, scope);
    if (record) records.push(record);
  }
  return { records, after: rows.at(-1)?.id ?? after, done: rows.length < 200 };
}

export const saveProgress = (data: Prisma.SyncWorkerStateUpdateInput) => prisma.syncWorkerState.update({ where: { id: 1 }, data });
