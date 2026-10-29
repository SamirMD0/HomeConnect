import type { Request, Response, NextFunction } from 'express';
import { databaseUuidSchema } from '../../validators/database-uuid';
import { CustomerImportService } from './customer-import.service';

/** Import requests bind to the explicit batch destination. The lifecycle service
 * repeats this check in its transaction so revocation cannot race a commit. */
export async function customerImportBranchGuard(req: Request, _res: Response, next: NextFunction) {
  try {
    const importId = req.path.split('/')[1];
    const destination = importId ? { importId } : { branchId: req.body?.branchId };
    const id = importId || req.body?.branchId;
    if (databaseUuidSchema().safeParse(id).success)
      req.branchScope = await CustomerImportService.authorizeDestination(req.user!, destination);
    next();
  } catch (error) {
    next(error);
  }
}
