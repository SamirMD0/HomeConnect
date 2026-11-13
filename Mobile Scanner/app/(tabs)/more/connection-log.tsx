import { ScrollView } from 'react-native';
import { ConnectionLogPanel } from '../../../src/connection/ConnectionLogPanel';
import { theme } from '../../../src/theme';

export default function ConnectionLog() {
  return (
    <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: 112 }}>
      <ConnectionLogPanel />
    </ScrollView>
  );
}
