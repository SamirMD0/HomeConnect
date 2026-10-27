import type { Prisma } from '@prisma/client';
import { AppError, NotFoundError } from '../../lib/errors';
import { BranchesService, type BranchActor } from './branches.service';

export async function resolveCreationBranch(
  user: BranchActor,
  tx: Prisma.TransactionClient
): Promise<string> {
  const branches = await BranchesService.accessibleBranches(user, tx);
  if (branches.length === 0)
    throw new AppError(
      'No active branch is available for this user. An administrator must assign one in Settings → Branches.',
      409,
      'NO_BRANCH_AVAILABLE'
    );
  if (branches.length > 1)
    throw new AppError(
      'Select a branch before creating records.',
      409,
      'BRANCH_SELECTION_REQUIRED'
    );
  return branches[0].id;
}

export async function resolveCreationBranchForUser(
  userId: string,
  tx: Prisma.TransactionClient
): Promise<string> {
  const user = await tx.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!user) throw new NotFoundError('User not found');
  return resolveCreationBranch({ userId, role: user.role }, tx);
}
