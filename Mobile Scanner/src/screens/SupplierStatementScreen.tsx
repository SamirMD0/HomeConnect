import { View } from 'react-native';
import { AppButton } from '../components/AppButton';
import { SuppliersScreen } from '../lookup/screens/SuppliersScreen';
import { StatementScreen } from '../lookup/screens/StatementScreen';
import type { ConnectionSettings } from '../types/scanner.types';

/** Existing statement navigation now uses the desktop's server-computed document. */
export function SupplierStatementScreen({
  supplierId,
  onDone,
}: {
  connection: ConnectionSettings;
  token: string;
  supplierId?: string;
  onDone: () => void;
  onSessionInvalid: () => Promise<void>;
}) {
  if (supplierId) return <StatementScreen party="supplier" />;
  return (
    <View style={{ flex: 1 }}>
      <SuppliersScreen statement />
      <View style={{ padding: 16 }}>
        <AppButton label="Close" variant="secondary" onPress={onDone} />
      </View>
    </View>
  );
}
