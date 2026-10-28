import React from 'react';
import { BranchScopeContext } from './BranchScopeProvider';
import { pushRecordBranch } from './branch-scope-store';

/**
 * Branch UI helpers for list and detail pages. Each one degrades to today's
 * single-branch behaviour when rendered without a BranchScopeProvider (tests,
 * isolated previews), so adopting them never breaks an existing screen.
 */

export const BRANCH_COLUMN_LABEL = 'Branch / الفرع';
export const CREATE_NEEDS_BRANCH = 'Select a branch in the header to create records.';

function useScopeContext() {
  return React.useContext(BranchScopeContext);
}

/** True when rows may come from several branches, so lists show a Branch column. */
export function useShowBranchColumn(): boolean {
  const scope = useScopeContext();
  return Boolean(scope && scope.selection?.kind === 'all' && scope.branches.length > 1);
}

/**
 * New top-level records need exactly one branch. In "All branches" (two or
 * more branches) creation is blocked until the user picks one.
 */
export function useCreateGuard(): { blocked: boolean; reason: string | undefined } {
  const blocked = useShowBranchColumn();
  return { blocked, reason: blocked ? CREATE_NEEDS_BRANCH : undefined };
}

/**
 * Reads `branchId` from any API record or dialog target. Ledger and prepaid
 * dialog targets are typed narrowly but carry the row's branchId at runtime.
 */
export function branchIdOf(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const branchId = (value as { branchId?: unknown }).branchId;
  return typeof branchId === 'string' && branchId ? branchId : undefined;
}

/** While mounted, writes from this page or dialog carry the record's branch. */
export function useRecordBranch(branchId: string | null | undefined): void {
  React.useEffect(() => {
    if (!branchId) return undefined;
    return pushRecordBranch(branchId);
  }, [branchId]);
}

/**
 * Branch label placed under a row's name, for tables whose row components
 * share column spans (ledger-style tables). Renders only when rows may come
 * from several branches.
 */
export function BranchRowLabel({ branchId }: { branchId: string | null | undefined }) {
  const show = useShowBranchColumn();
  if (!show) return null;
  return (
    <span className="mt-1 block">
      <BranchBadge branchId={branchId} />
    </span>
  );
}

/** Branch code and name for a row. Inactive or unknown branches still show something honest. */
export function BranchBadge({ branchId }: { branchId: string | null | undefined }) {
  const scope = useScopeContext();
  if (!branchId) return <span className="text-slate-400">—</span>;
  const branch = scope?.branches.find((item) => item.id === branchId);
  return (
    <span className="inline-flex max-w-[180px] items-center gap-1.5 rounded-md bg-slate-50 px-1.5 py-0.5 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-600/15">
      <span className="rounded bg-brand-600 px-1 text-[10px] font-bold uppercase text-white">{branch ? branch.code.slice(0, 4) : '—'}</span>
      <span className="user-text truncate" dir="auto">{branch ? branch.name : 'Other branch'}</span>
    </span>
  );
}
