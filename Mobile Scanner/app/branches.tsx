import { SafeAreaView } from 'react-native-safe-area-context';
import { BranchPickerScreen } from '../src/branches/BranchPickerScreen';
import { useSession } from '../src/session/SessionProvider';
export default function Branches() {
  const session = useSession();
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <BranchPickerScreen
        branches={session.branch.branches}
        busy={session.branch.busy}
        error={session.branch.error}
        onSelect={(branch) => void session.branch.choose(branch)}
        onRetry={session.branch.retry}
        onLogout={() => void session.signOut()}
      />
    </SafeAreaView>
  );
}
