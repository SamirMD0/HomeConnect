import type { NextFunction, Request, Response } from 'express';
import { assertInScope, writeBranch } from '../features/branches/branch-scope';
import { prisma } from '../lib/prisma';
import { databaseUuidSchema } from '../validators/database-uuid';

/** Mounted at the entity prefix, before every router sharing that prefix. */
function parentScopeGuard(kind: 'customer' | 'supplier') {
  return async function guardParentScope(req: Request, _res: Response, next: NextFunction) {
    try {
      // Decode the same segment Express will expose to downstream parameter handlers.
      // An encoded UUID must not bypass the parent guard.
      const rawId = req.path.split('/')[1] ?? '';
      let id: string;
      try {
        id = decodeURIComponent(rawId);
      } catch {
        return next();
      }
      if (!databaseUuidSchema().safeParse(id).success) return next();
      const parent =
        kind === 'customer'
          ? await prisma.customer.findUnique({ where: { id }, select: { branchId: true } })
          : await prisma.supplier.findUnique({ where: { id }, select: { branchId: true } });
      // Preserve downstream missing-parent handling (including validation and role checks).
      if (parent) {
        const message =
          kind === 'customer'
            ? 'Customer not found'
            : req.method === 'POST' && req.path.split('/')[2]?.toLowerCase() === 'purchases'
              ? 'Supplier not found / المورد غير موجود'
              : 'Supplier not found';
        assertInScope(parent.branchId, req.branchScope!, message);
        if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) writeBranch(req.branchScope!);
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

export const customerParentGuard = parentScopeGuard('customer');
export const supplierParentGuard = parentScopeGuard('supplier');
