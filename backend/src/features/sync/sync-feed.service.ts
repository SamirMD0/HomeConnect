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
import { CustomerFinancialSummaryService } from '../financial/customer-summary/customer-financial-summary.service';
import { customerFinancialSummaryQuerySchema } from '../financial/customer-summary/customer-financial-summary.validator';
import { InventoryService } from '../inventory/inventory.service';

export type SyncRecord =
  | { entity: string; id: string; branchId: string | null; op: 'delete' }
  | { entity: string; id: string; branchId: string | null; op: 'upsert'; data: unknown };

async function loadRecord(change: Pick<SyncChange, 'entity' | 'entityId'>, scope: BranchScope): Promise<unknown | null> {
  const id = change.entityId;
  switch (change.entity) {
    case 'product': {
      // The catalogue and inventory are global in the current PC application.
      const product = await ProductsService.getCatalogRecord(id);
      return { ...product, inventory: await InventoryService.getProductInventory(id) };
    }
    case 'customer': {
      const customer = await CustomersService.getCustomerWithFinancial(id, scope);
      return { ...customer, financialSummary: await CustomerFinancialSummaryService.getCustomerFinancialSummary(id, customerFinancialSummaryQuerySchema.parse({
        includeCancelled: 'false', includePayments: 'false', debtLimit: 100, planLimit: 100,
      })) };
    }
    case 'sales_order': {
      await assertRecordInScope('salesOrder', id, scope);
      const order = await SalesOrdersService.get(id);
      return {
        ...order,
        // Phones resolve current stock/prices through product records. Keep the
        // PC's sale amounts and fulfillment facts, plus convenient product names.
        items: order.items.map(({ inventory, product, ...item }) => ({
          ...item,
          product: product ? {
            id: product.id, name: product.name, model: product.model,
            sku: product.sku, barcode: product.barcode, isActive: product.isActive,
          } : null,
        })),
        ...await documentBranch('salesOrder', id),
      };
    }
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

// Snapshot and delta deliberately share the PC's existing read projections.
export async function buildSyncRecord(change: Pick<SyncChange, 'entity' | 'entityId' | 'branchId'>, scope: BranchScope): Promise<SyncRecord | null> {
  try {
    const data = await loadRecord(change, scope);
    if (data === null) return null;
    const ownBranch = (data as { branchId?: string }).branchId;
    const branchId = ['product', 'category', 'user'].includes(change.entity) ? null :
      change.entity === 'branch' ? change.entityId : ownBranch ?? change.branchId;
    return { entity: change.entity, id: change.entityId, branchId, op: 'upsert', data };
  } catch (error) {
    if (error instanceof NotFoundError) return null;
    throw error;
  }
}

export async function readChanges(afterSeq: bigint | number, limit = 500, scope: BranchScope, options: { deadline?: number; system?: boolean } = {}) {
  if (typeof afterSeq === 'number' && !Number.isSafeInteger(afterSeq)) {
    throw new ValidationError('after must be a safe integer or bigint');
  }
  const after = BigInt(afterSeq);
  if (after < 0n || after > 9223372036854775807n || !Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw new ValidationError('Invalid sync cursor or limit');
  }
  const batch = await prisma.$transaction(async tx => {
    // Shared producer locks are held through commit. Waiting exclusively here
    // prevents advancing beyond an earlier sequence from an unfinished writer.
    await tx.$executeRaw`SET LOCAL lock_timeout = '2s'`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(74103, 1)`;
    const changes = await tx.syncChange.findMany({
      where: { seq: { gt: after } }, orderBy: { seq: 'asc' }, take: limit,
    });
    const next = changes.at(-1)?.seq ?? after;
    const hasMore = changes.length === limit && Boolean(await tx.syncChange.findFirst({
      where: { seq: { gt: next } }, select: { seq: true }, orderBy: { seq: 'asc' },
    }));
    return { changes, next, hasMore };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 30000 }).catch((error: unknown) => {
    if (isLockTimeout(error)) return null;
    throw error;
  });
  if (batch === null) {
    return { records: [], nextSeq: after.toString(), hasMore: false, busy: true as const };
  }
  const { changes, next, hasMore } = batch;
  if (options.system) {
    // A branch can be created after the worker initially resolves its scope.
    // Include ownership observed in this committed batch before projecting it.
    scope = { mode: 'all', branchIds: [...new Set([...scope.branchIds, ...changes.flatMap(row => row.branchId ? [row.branchId] : [])])] };
  }
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
    if (options.deadline !== undefined && Date.now() >= options.deadline) {
      return { records: [], nextSeq: after.toString(), hasMore: false, busy: true as const };
    }
    const tombstone = { entity: change.entity, id: change.entityId, branchId: change.branchId, op: 'delete' as const };
    if (change.op === 'delete') {
      if (wasInScope) records.push(tombstone);
      continue;
    }
    try {
      const record = await buildSyncRecord(change, scope);
      if (record !== null) {
        records.push(record);
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

function isLockTimeout(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const postgresError = error as { code?: string; meta?: { code?: string } };
  return postgresError.code === '55P03' ||
    (postgresError.code === 'P2010' && postgresError.meta?.code === '55P03');
}
