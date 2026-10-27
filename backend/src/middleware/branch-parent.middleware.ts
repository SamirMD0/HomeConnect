import type { NextFunction, Request, Response } from 'express';
import { assertInScope, writeBranch } from '../features/branches/branch-scope';
import {
  findScopeRecord,
  scopeRecordMissing,
  type ScopeRecordKind,
} from '../features/branches/parent-branch';
import { databaseUuidSchema } from '../validators/database-uuid';

/** One branch-only guard before every router sharing a branch-owned prefix. */
function parentScopeGuard(kind: ScopeRecordKind, enforceCollectionWrites = false) {
  return async function guardParentScope(req: Request, _res: Response, next: NextFunction) {
    try {
      const rawId = req.path.split('/')[1] ?? '';
      let id: string;
      try {
        id = decodeURIComponent(rawId);
      } catch {
        return next();
      }
      const mutation = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
      if (!databaseUuidSchema().safeParse(id).success) {
        if (enforceCollectionWrites && mutation) writeBranch(req.branchScope!);
        return next();
      }
      // Legacy receipt URLs identify a receiving; purchase detail identifies a transaction.
      const recordKind =
        kind === 'supplierPurchase' && req.path.split('/')[2]?.toLowerCase() === 'receipts'
          ? 'receiptReceiving'
          : kind;
      const parent = await findScopeRecord(recordKind, id);
      // Leave missing-parent behavior to the existing downstream handler.
      if (parent) {
        const message =
          kind === 'supplier' &&
          req.method === 'POST' &&
          req.path.split('/')[2]?.toLowerCase() === 'purchases'
            ? 'Supplier not found / المورد غير موجود'
            : scopeRecordMissing[recordKind];
        assertInScope(parent.branchId, req.branchScope!, message);
        if (mutation) writeBranch(req.branchScope!);
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

export const customerParentGuard = parentScopeGuard('customer');
export const supplierParentGuard = parentScopeGuard('supplier');
export const recordScopeGuard = (kind: ScopeRecordKind) => parentScopeGuard(kind, true);
