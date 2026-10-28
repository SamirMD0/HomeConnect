import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useAuth } from '../../../hooks/useAuth';
import { branchesApi, type Branch } from '../branches';
import {
  BRANCH_ACCESS_DENIED_EVENT,
  clearStoredSelection,
  headerForSelection,
  isBranchDependentQuery,
  readStoredSelection,
  resolveSelection,
  setBranchScopeHeader,
  writeStoredSelection,
  type BranchSelection,
} from './branch-scope-store';

export interface BranchScopeContextValue {
  /** False until the user's branches are known; pages wait so their first fetch carries the right scope. */
  ready: boolean;
  branches: Branch[];
  selection: BranchSelection | null;
  selectedBranch: Branch | null;
  select: (selection: BranchSelection) => void;
}

export const BranchScopeContext = React.createContext<BranchScopeContextValue | undefined>(undefined);

export const accessibleBranchesKey = (userId: string | undefined) => ['branches', 'accessible', userId] as const;

function sameSelection(a: BranchSelection | null, b: BranchSelection | null): boolean {
  return headerForSelection(a ?? { kind: 'none' }) === headerForSelection(b ?? { kind: 'none' }) && a?.kind === b?.kind;
}

export const BranchScopeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id;
  const branchesQuery = useQuery({
    queryKey: accessibleBranchesKey(userId),
    queryFn: branchesApi.accessible,
    enabled: Boolean(userId),
    staleTime: 60_000,
  });
  const [selection, setSelection] = React.useState<BranchSelection | null>(null);
  const selectionRef = React.useRef<BranchSelection | null>(null);

  const apply = React.useCallback(
    (next: BranchSelection) => {
      const previous = selectionRef.current;
      selectionRef.current = next;
      setBranchScopeHeader(headerForSelection(next));
      setSelection(next);
      if (userId) writeStoredSelection(userId, next);
      // Reset (not just invalidate) so one branch's figures are never shown,
      // even briefly, under another branch's name.
      if (previous && !sameSelection(previous, next)) {
        void queryClient.resetQueries({ predicate: (query) => isBranchDependentQuery(query.queryKey) });
      }
      if (next.kind === 'none') {
        toast.error('No branch is assigned to your account. Ask an administrator to assign one in Settings → Branches.', {
          id: 'branch-none',
        });
      }
    },
    [queryClient, userId]
  );

  React.useEffect(() => {
    if (!userId || !branchesQuery.data) return;
    apply(resolveSelection(branchesQuery.data, readStoredSelection(userId)));
  }, [apply, branchesQuery.data, userId]);

  const branchesRef = React.useRef<Branch[]>([]);
  React.useEffect(() => {
    branchesRef.current = branchesQuery.data ?? [];
  }, [branchesQuery.data]);

  React.useEffect(() => {
    if (!userId) return undefined;
    const onDenied = () => {
      clearStoredSelection(userId);
      // Re-select at once from what we know (the stored choice is gone), then
      // refetch: if the branch list changed, the effect above re-resolves.
      apply(resolveSelection(branchesRef.current, null));
      toast.error('Your access to this branch changed. Showing the branches you can access.', {
        id: 'branch-access-denied',
      });
      void queryClient.invalidateQueries({ queryKey: accessibleBranchesKey(userId) });
    };
    window.addEventListener(BRANCH_ACCESS_DENIED_EVENT, onDenied);
    return () => window.removeEventListener(BRANCH_ACCESS_DENIED_EVENT, onDenied);
  }, [apply, queryClient, userId]);

  // Signing out (or switching user) must never leave the previous user's scope on the client.
  React.useEffect(
    () => () => {
      selectionRef.current = null;
      setBranchScopeHeader(null);
    },
    [userId]
  );

  const branches = React.useMemo(() => branchesQuery.data ?? [], [branchesQuery.data]);
  const value = React.useMemo<BranchScopeContextValue>(
    () => ({
      // If the branch list cannot be loaded, fall back to sending no header:
      // the server then answers for every branch the user may access, as before.
      ready: !userId || branchesQuery.isError || selection !== null,
      branches,
      selection,
      selectedBranch:
        selection?.kind === 'branch' ? branches.find((branch) => branch.id === selection.branchId) ?? null : null,
      select: apply,
    }),
    [apply, branches, branchesQuery.isError, selection, userId]
  );

  return <BranchScopeContext.Provider value={value}>{children}</BranchScopeContext.Provider>;
};

export function useBranchScope(): BranchScopeContextValue {
  const context = React.useContext(BranchScopeContext);
  if (!context) throw new Error('useBranchScope must be used within a BranchScopeProvider');
  return context;
}
