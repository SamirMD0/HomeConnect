import { Prisma, type SyncChange } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { NotFoundError, ValidationError } from '../../lib/errors';
import { CustomersService } from '../../services/customers.service';
import type { BranchScope } from '../branches/branch-scope';
import { branchSelect } from '../branches/branches.repository';
import { assertRecordInScope } from '../branches/parent-branch';
import { CategoriesService } from '../categories/categories.service';
import { documentBranch } from '../documents/document-branch';
import { ProductsService } from '../service/products/products.service';
import { SalesOrdersService } from '../sales/sales-orders/sales-orders.service';
import { SuppliersService } from '../suppliers/suppliers/suppliers.service';
import { getUnlinkedBill } from '../suppliers/receipts/receipts.service';

export type SyncRecord =
  | { entity: string; id: string; op: 'delete' }
  | { entity: string; id: string; op: 'upsert'; data: unknown };

async function loadRecord(change: SyncChange, scope: BranchScope): Promise<unknown | null> {
  const id = change.entityId;
  switch (change.entity) {
    case 'product':
      // The catalogue and inventory are global in the current PC application.
      return ProductsService.getCatalogRecord(id);
    case 'customer':
      return CustomersService.getCustomerWithFinancial(id, scope);
    case 'sales_order':
      await assertRecordInScope('salesOrder', id, scope);
      return { ...await SalesOrdersService.get(id), ...await documentBranch('salesOrder', id) };
    case 'supplier':
      return SuppliersService.get(id, scope);
    case 'supplier_bill':
      return getUnlinkedBill(id, scope);
    case 'branch':
      return prisma.branch.findFirst({
        where: { id: { equals: id, in: scope.branchIds } }, select: branchSelect,
      });
    case 'category':
      return CategoriesService.get(id);
    case 'user':
      return prisma.user.findUnique({
        where: { id, deletedAt: null },
        select: { id: true, username: true, fullName: true, role: true, isActive: true },
      });
    default:
      throw new Error(`Unsupported sync entity ${change.entity}`);
  }
}

export async function readChanges(afterSeq: bigint | number, limit = 500, scope: BranchScope) {
  if (typeof afterSeq === 'number' && !Number.isSafeInteger(afterSeq)) {
    throw new ValidationError('after must be a safe integer or bigint');
  }
  const after = BigInt(afterSeq);
  if (after < 0n || after > 9223372036854775807n || !Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw new ValidationError('Invalid sync cursor or limit');
  }
  const { changes, next, hasMore } = await prisma.$transaction(async tx => {
    // Shared producer locks are held through commit. Waiting exclusively here
    // prevents advancing beyond an earlier sequence from an unfinished writer.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(74103, 1)`;
    const changes = await tx.syncChange.findMany({
      where: { seq: { gt: after } }, orderBy: { seq: 'asc' }, take: limit,
    });
    const next = changes.at(-1)?.seq ?? after;
    const hasMore = changes.length === limit && Boolean(await tx.syncChange.findFirst({
      where: { seq: { gt: next } }, select: { seq: true }, orderBy: { seq: 'asc' },
    }));
    return { changes, next, hasMore };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 30000 });
  const latest = new Map<string, { change: SyncChange; wasInScope: boolean }>();
  for (const change of changes) {
    const key = `${change.entity}:${change.entityId}`;
    const wasInScope = Boolean(latest.get(key)?.wasInScope) ||
      change.branchId === null || scope.branchIds.includes(change.branchId);
    latest.delete(key);
    latest.set(key, { change, wasInScope });
  }
  const records: SyncRecord[] = [];
  for (const { change, wasInScope } of latest.values()) {
    const tombstone = { entity: change.entity, id: change.entityId, op: 'delete' as const };
    if (change.op === 'delete') {
      if (wasInScope) records.push(tombstone);
      continue;
    }
    try {
      const data = await loadRecord(change, scope);
      if (data !== null) {
        records.push({ entity: change.entity, id: change.entityId, op: 'upsert', data });
      } else if (wasInScope) {
        records.push(tombstone);
      }
    } catch (error) {
      if (!(error instanceof NotFoundError)) throw error;
      if (wasInScope) records.push(tombstone);
    }
  }
  // Decimal strings preserve PostgreSQL BIGSERIAL cursors in JSON and JS clients.
  return { records, nextSeq: next.toString(), hasMore };
}
