import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { authedHeaders, backendBaseUrl, HcApiError, prepareApiSession, requestJson } from '../api/hc-client';
import { receiptQueue } from '../services/receipt-queue';
import { clearQueryCache } from '../query/client';
import {
  onBranchRejected,
  selectAccessibleBranch,
  setSelectedBranch,
  type MobileBranch,
} from './branch-selection';
import { clearSelectedBranch, loadSelectedBranch, saveSelectedBranch } from './branch-storage';
import type { ConnectionSettings } from '../types/scanner.types';

export function useBranchSession(
  connection: ConnectionSettings | null,
  token: string | null,
  invalidate: () => Promise<void>
) {
  const requireSelection = useRef(false);
  const [branches, setBranches] = useState<MobileBranch[]>([]);
  const [selected, setSelected] = useState<MobileBranch | null>(null);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    if (!connection || !token) {
      setSelected(null);
      setSelectedBranch(null);
      setBranches([]);
      setBusy(false);
      return;
    }
    setBusy(true);
    setError(null);
    void (async () => {
      try {
        const saved = await loadSelectedBranch();
        const accessible = await requestJson<MobileBranch[]>(
          `${backendBaseUrl(connection)}/api/v1/branches/accessible`,
          { headers: authedHeaders({ baseUrl: '', token }) }
        );
        if (!active) return;
        const branch = selectAccessibleBranch(accessible, saved, requireSelection.current);
        if (selectedRef.current && selectedRef.current.id !== branch?.id) {
          setSelected(null);
          setSelectedBranch(null);
          await clearQueryCache();
        }
        if (branch) await saveSelectedBranch(branch.id);
        else await clearSelectedBranch();
        if (active) {
          setBranches(accessible);
          setSelected(branch);
        }
      } catch (failure) {
        if (!active) return;
        if (failure instanceof HcApiError && failure.kind === 'UNAUTHORIZED') await invalidate();
        else setError(failure instanceof Error ? failure.message : 'Could not load branches.');
      } finally {
        if (active) setBusy(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [connection, token, revision, invalidate]);
  const switchBranch = useCallback(async () => {
    requireSelection.current = true;
    setSelected(null);
    setSelectedBranch(null);
    try {
      await clearQueryCache();
      await clearSelectedBranch();
      setRevision((value) => value + 1);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not switch branch.');
    }
  }, []);
  useEffect(
    () =>
      onBranchRejected(() => {
        void switchBranch().catch((failure: Error) => setError(failure.message));
      }),
    [switchBranch]
  );
  useEffect(() => () => setSelectedBranch(null), []);
  // Phase 0 queue wiring: after login/validated branch and on app foreground.
  useEffect(() => {
    if (!selected || busy || !connection || !token) return;
    let active = true;
    const sync = () => {
      const baseUrl = backendBaseUrl(connection);
      void prepareApiSession(baseUrl)
        .then((currentToken) => {
          if (active && currentToken) return receiptQueue().flush({ baseUrl, token: currentToken });
        })
        .catch((failure: Error) => setError(failure.message));
    };
    sync();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') sync();
    });
    return () => { active = false; subscription.remove(); };
  }, [selected, busy, connection, token]);
  const choose = async (branch: MobileBranch) => {
    try {
      await clearQueryCache();
      await saveSelectedBranch(branch.id);
      requireSelection.current = false;
      setSelected(branch);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not select branch.');
    }
  };
  return {
    selected,
    branches,
    busy,
    error,
    switchBranch,
    choose,
    retry: () => setRevision((value) => value + 1),
  };
}
