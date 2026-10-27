import type { Prisma } from '@prisma/client';
import { AppError } from '../../lib/errors';
import { multiBranchScopingEnabled } from './branch-config';

/** New accounts only. Reactivation never rewrites or replaces existing grants. */
export async function grantNewEmployeeBranch(
  user: { id: string; role: string },
  tx: Prisma.TransactionClient
): Promise<void> {
  if (user.role !== 'EMPLOYEE' || multiBranchScopingEnabled()) return;
  const branches = await tx.branch.findMany({
    where: { isActive: true },
    select: { id: true, createdById: true },
    take: 2,
  });
  if (branches.length > 1) {
    throw new AppError(
      'Select a branch before creating an employee.',
      409,
      'BRANCH_SELECTION_REQUIRED'
    );
  }
  if (!branches.length) return;
  const branch = branches[0];
  await tx.userBranchAccess.createMany({
    data: [{ userId: user.id, branchId: branch.id, grantedById: branch.createdById }],
    skipDuplicates: true,
  });
}
