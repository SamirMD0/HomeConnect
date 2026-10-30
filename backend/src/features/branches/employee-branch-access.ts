import type { Prisma } from '@prisma/client';
import { AppError } from '../../lib/errors';
import { multiBranchScopingEnabled } from './branch-config';

/** Grant the sole active branch on employee creation or ADMIN demotion, so a
 * single-branch shop never creates an employee who sees nothing. With two or
 * more active branches an administrator assigns branches in Settings → Users.
 * Existing grants are preserved; promotion and reactivation never rewrite them. */
export async function grantSoleBranchToEmployee(
  user: { id: string; role: string },
  tx: Prisma.TransactionClient
): Promise<void> {
  if (user.role !== 'EMPLOYEE') return;
  const branches = await tx.branch.findMany({
    where: { isActive: true },
    select: { id: true, createdById: true },
    take: 2,
  });
  if (branches.length > 1) {
    if (multiBranchScopingEnabled()) return;
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
