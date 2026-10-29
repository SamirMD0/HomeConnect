import { ScrollView, StyleSheet, Text } from 'react-native';
import { AppButton } from '../components/AppButton';
import { StatusBanner } from '../components/StatusBanner';
import type { MobileBranch } from './branch-selection';

export function BranchPickerScreen({ branches, error, busy, onSelect, onRetry, onLogout }: {
  branches: MobileBranch[]; error: string | null; busy: boolean;
  onSelect: (branch: MobileBranch) => void; onRetry: () => void; onLogout: () => void;
}) {
  return <ScrollView contentContainerStyle={styles.content}>
    <Text style={styles.title}>Choose a branch</Text>
    {error && <StatusBanner tone="danger" message={error} />}
    {!busy && !error && branches.length === 0 && <StatusBanner tone="warning" message="No branch assigned — ask an administrator" />}
    {branches.map((branch) => <AppButton key={branch.id} label={branch.name} disabled={busy} onPress={() => onSelect(branch)} />)}
    <AppButton label={busy ? 'Loading branches…' : 'Refresh branches'} disabled={busy} onPress={onRetry} variant="secondary" />
    <AppButton label="Sign out" onPress={onLogout} variant="secondary" />
  </ScrollView>;
}
const styles = StyleSheet.create({ content: { padding: 20, gap: 14 }, title: { fontSize: 24, fontWeight: '800', color: '#0f172a' } });
