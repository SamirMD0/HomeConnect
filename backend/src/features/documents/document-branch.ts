import { prisma } from '../../lib/prisma';
import { NotFoundError } from '../../lib/errors';
import { findScopeRecord, scopeRecordMissing } from '../branches/parent-branch';

/** Display metadata only: callers remain behind the existing scope/parent guards. */
export async function documentBranch(kind: 'salesOrder' | 'payment' | 'salesReturn' | 'customer', id: string) {
  const record = await findScopeRecord(kind, id);
  if (!record) throw new NotFoundError(scopeRecordMissing[kind]);
  const [branch, activeCount] = await Promise.all([
    prisma.branch.findUniqueOrThrow({ where: { id: record.branchId }, select: { name: true, address: true, phone: true } }),
    prisma.branch.count({ where: { isActive: true } }),
  ]);
  return { branch, showBranchLine: activeCount > 1 };
}
