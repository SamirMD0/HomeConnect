import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ComponentProps } from 'react';
import { authedHeaders, backendBaseUrl, HcApiError, requestJson } from '../api/hc-client';
import { AppButton } from '../components/AppButton';
import { StatusBanner } from '../components/StatusBanner';
import { ScannerScreen } from '../screens/ScannerScreen';
import { BranchPickerScreen } from './BranchPickerScreen';
import { onBranchRejected, selectAccessibleBranch, setSelectedBranch } from './branch-selection';
import type { MobileBranch } from './branch-selection';
import { clearSelectedBranch, loadSelectedBranch, saveSelectedBranch } from './branch-storage';

export function BranchScannerScreen(props: ComponentProps<typeof ScannerScreen>) {
  const requireSelection = useRef(false);
  const invalidate = useRef(props.onSessionInvalid);
  invalidate.current = props.onSessionInvalid;
  const [branches, setBranches] = useState<MobileBranch[]>([]);
  const [selected, setSelected] = useState<MobileBranch | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    setBusy(true);
    setError(null);
    const load = async () => {
      try {
        const saved = await loadSelectedBranch();
        const accessible = await requestJson<MobileBranch[]>(
          backendBaseUrl(props.connection) + '/api/v1/branches/accessible',
          { headers: authedHeaders({ baseUrl: '', token: props.token }) },
        );
        if (!active) return;
        const branch = selectAccessibleBranch(accessible, saved, requireSelection.current);
        if (branch) await saveSelectedBranch(branch.id);
        else await clearSelectedBranch();
        if (!active) return;
        setBranches(accessible);
        setSelected(branch);
      } catch (failure) {
        if (!active) return;
        if (failure instanceof HcApiError && failure.kind === 'UNAUTHORIZED') await invalidate.current();
        else setError(failure instanceof Error ? failure.message : 'Could not load branches.');
      } finally { if (active) setBusy(false); }
    };
    void load();
    return () => { active = false; };
  }, [props.connection, props.token, refresh]);
  useEffect(() => onBranchRejected(() => {
    requireSelection.current = true;
    setSelected(null); // Unmount supplier forms immediately, before the refresh.
    setBranches([]);
    setBusy(true);
    void clearSelectedBranch().then(() => setRefresh((value) => value + 1)).catch((failure: Error) => { setError(failure.message); setBusy(false); });
  }), []);
  useEffect(() => () => setSelectedBranch(null), []);
  const choose = async (branch: MobileBranch) => {
    try { await saveSelectedBranch(branch.id); requireSelection.current = false; setSelected(branch); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not store branch.'); }
  };
  if (!selected && !busy && !error && branches.length === 0) return <View style={styles.container}>
    <View style={styles.branch}>
      <StatusBanner tone="warning" message="No branch assigned — ask an administrator" />
      <AppButton label="Refresh branches" variant="secondary" onPress={() => setRefresh((value) => value + 1)} />
    </View>
    <ScannerScreen {...props} supplierActionsDisabled />
  </View>;
  if (!selected || busy) return <BranchPickerScreen branches={branches} error={error} busy={busy} onSelect={(branch) => void choose(branch)} onRetry={() => setRefresh((value) => value + 1)} onLogout={() => void props.onLogout()} />;
  return <View style={styles.container}>
    <View style={styles.branch}>
      <Text style={styles.name}>Branch: {selected.name}</Text>
      <AppButton label="Switch branch" variant="secondary" onPress={() => { setSelected(null); setSelectedBranch(null); }} />
    </View>
    <ScannerScreen key={selected.id} {...props} />
  </View>;
}
const styles = StyleSheet.create({ container: { flex: 1 }, branch: { padding: 16, gap: 8, backgroundColor: '#ecfdf5' }, name: { color: '#065f46', fontWeight: '800', fontSize: 17 } });
