import { prisma } from '../../lib/prisma';
import type { BranchScope } from './branch-scope';

export interface BranchIdentity {
  branchId: string;
  branchCode: string;
  branchName: string;
}
export type BranchAggregate<T> = T & { branchBreakdown?: Array<T & BranchIdentity> };

/** Totals use the original full-scope calculation. Breakdown reruns that same
 * calculation per branch; it never derives or rounds totals from the rows.
 * Zero/one branch consistently omits branchBreakdown. */
export async function withBranchBreakdown<T extends object>(
  scope: BranchScope,
  calculate: (scope: BranchScope) => Promise<T>
): Promise<BranchAggregate<T>> {
  const total = await calculate(scope);
  if (scope.branchIds.length <= 1) return total;
  const branches = await prisma.branch.findMany({
    where: { id: { in: scope.branchIds } },
    select: { id: true, code: true, name: true },
    orderBy: { code: 'asc' },
  });
  const branchBreakdown = await Promise.all(
    branches.map(async (branch) => ({
      ...(await calculate({ mode: 'single', branchIds: [branch.id] })),
      branchId: branch.id,
      branchCode: branch.code,
      branchName: branch.name,
    }))
  );
  return { ...total, branchBreakdown };
}

/** Preserve the existing report envelope and add breakdown alongside its data. */
export async function withEnvelopeBranchBreakdown<T extends { data: object }>(
  scope: BranchScope,
  calculate: (scope: BranchScope) => Promise<T>
): Promise<T & { data: BranchAggregate<T['data']> }> {
  const total = await calculate(scope);
  const data = await withBranchBreakdown(scope, async (single) =>
    single === scope ? total.data : (await calculate(single)).data
  );
  return { ...total, data };
}

/** Display-only ownership metadata; never used to authorize a request. */
export function branchFields(record: {
  branchId?: string;
  branchName?: string;
  branch?: { name: string } | null;
}) {
  return { branchId: record.branchId, branchName: record.branchName ?? record.branch?.name };
}
export async function branchLabel(scope: BranchScope): Promise<string> {
  if (scope.branchIds.length !== 1) return scope.branchIds.length ? 'All branches' : '';
  return (
    (await prisma.branch.findUnique({ where: { id: scope.branchIds[0] }, select: { name: true } }))
      ?.name ?? ''
  );
}
