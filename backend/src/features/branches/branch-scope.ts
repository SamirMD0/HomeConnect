import { AppError, NotFoundError } from '../../lib/errors';

export interface BranchScope {
  mode: 'single' | 'all';
  branchIds: string[];
}

/** An empty accessible set deliberately matches no records. */
export function scopeWhere(scope: BranchScope) {
  return { branchId: { in: scope.branchIds } };
}

/** Write policy: every mutation needs exactly one accessible branch, even when its
 * record supplies the branch. Multi-branch all scope always returns 409. Missing
 * headers stay writable for a single-branch shop. Phase 4 mutations from All must
 * send X-Branch-Scope set to the record’s branch. */
export function writeBranch(scope: BranchScope): string {
  if (scope.branchIds.length === 0) {
    throw new AppError(
      'No active branch is available for this user. An administrator must assign one in Settings → Branches.',
      409,
      'NO_BRANCH_AVAILABLE'
    );
  }
  if (scope.branchIds.length !== 1) {
    throw new AppError(
      'Select a branch before creating records.',
      409,
      'BRANCH_SELECTION_REQUIRED'
    );
  }
  return scope.branchIds[0];
}

export function assertInScope(
  branchId: string,
  scope: BranchScope,
  missingMessage = 'Resource not found'
): void {
  if (!scope.branchIds.includes(branchId)) throw new NotFoundError(missingMessage);
}
