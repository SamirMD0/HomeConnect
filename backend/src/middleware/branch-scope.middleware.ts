import type { NextFunction, Request, Response } from 'express';
import { BranchesService } from '../features/branches/branches.service';
import { AppError, AuthenticationError, ValidationError } from '../lib/errors';
import { databaseUuidSchema } from '../validators/database-uuid';

export async function branchScopeMiddleware(req: Request, _res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AuthenticationError();
    const header = req.headers['x-branch-scope'];
    if (
      header !== undefined &&
      header !== 'all' &&
      !databaseUuidSchema().safeParse(header).success
    ) {
      throw new ValidationError('Invalid X-Branch-Scope; expected a branch UUID or "all"');
    }
    // Fetch on every request: branch deactivation and grant revocation apply immediately.
    const branches = await BranchesService.accessibleBranches(req.user);
    const branchIds = branches.map((branch) => branch.id);
    if (header !== undefined && header !== 'all') {
      const id = (header as string).toLowerCase();
      if (!branchIds.includes(id)) {
        throw new AppError('You do not have access to this branch.', 403, 'BRANCH_ACCESS_DENIED');
      }
      req.branchScope = { mode: 'single', branchIds: [id] };
    } else {
      req.branchScope = { mode: 'all', branchIds };
    }
    next();
  } catch (error) {
    next(error);
  }
}
