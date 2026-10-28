export interface MobileBranch { id: string; name: string }

/** Revalidate saved selections against the fresh accessible list on each login. */
export function selectAccessibleBranch(branches: MobileBranch[], savedId: string | null): MobileBranch | null {
  if (branches.length === 1) return branches[0]!;
  return branches.find((branch) => branch.id === savedId) ?? null;
}

let selectedId: string | null = null;
const rejectionListeners = new Set<() => void>();
export function setSelectedBranch(id: string | null) { selectedId = id; }
export function selectedBranchHeaders(): Record<string, string> {
  return selectedId ? { 'X-Branch-Scope': selectedId } : {};
}
export function onBranchRejected(listener: () => void) {
  rejectionListeners.add(listener);
  return () => { rejectionListeners.delete(listener); };
}
/** Ignore late failures from a branch that the operator has already switched away from. */
export function handleBranchRejection(status: number, code: string | null, sentId: string | null) {
  if (status !== 403 || code !== 'BRANCH_ACCESS_DENIED' || !sentId || sentId !== selectedId) return false;
  selectedId = null;
  for (const listener of rejectionListeners) listener();
  return true;
}
