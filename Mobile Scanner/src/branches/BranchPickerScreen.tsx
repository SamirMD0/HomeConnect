import { useState } from 'react';
import { Building2, LogOut, RefreshCw } from 'lucide-react-native';
import { StatusBanner } from '../components/StatusBanner';
import { Button } from '../components/ui/button';
import { Select } from '../components/ui/select';
import { Text } from '../components/ui/text';
import { AuthLayout } from '../ui/AuthLayout';
import type { MobileBranch } from './branch-selection';

/** First branch choice after sign-in: one dropdown, Continue, and Sign out in the corner. */
export function BranchPickerScreen({
  branches,
  error,
  busy,
  onSelect,
  onRetry,
  onLogout,
}: {
  branches: MobileBranch[];
  error: string | null;
  busy: boolean;
  onSelect: (branch: MobileBranch) => void;
  onRetry: () => void;
  onLogout: () => void;
}) {
  const [picked, setPicked] = useState<string | null>(branches.length === 1 ? (branches[0]?.id ?? null) : null);
  const branch = branches.find((item) => item.id === picked) ?? null;
  return (
    <AuthLayout
      title="Branch"
      corner={
        <Button variant="ghost" size="sm" onPress={onLogout}>
          <LogOut size={16} color="#1B2124" />
          <Text>Sign out</Text>
        </Button>
      }
    >
      {error && <StatusBanner tone="danger" message={error} />}
      {!busy && !error && branches.length === 0 && (
        <StatusBanner tone="warning" message="No branch assigned. Ask an administrator." />
      )}
      {branches.length > 0 && (
        <Select
          label="Branch"
          icon={Building2}
          placeholder="Choose a branch"
          value={picked}
          options={branches.map((item) => ({ value: item.id, label: item.name }))}
          onChange={setPicked}
          disabled={busy}
        />
      )}
      <Button disabled={!branch || busy} onPress={() => branch && onSelect(branch)}>
        <Text>Continue</Text>
      </Button>
      <Button variant="ghost" size="sm" disabled={busy} onPress={onRetry}>
        <RefreshCw size={16} color="#1B2124" />
        <Text>{busy ? 'Loading…' : 'Refresh'}</Text>
      </Button>
    </AuthLayout>
  );
}
