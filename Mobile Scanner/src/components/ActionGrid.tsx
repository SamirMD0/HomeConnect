import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

interface ActionGridProps {
  onScan: () => void;
  onAttachReceipt: () => void;
  onSupplierInvoice: () => void;
  onSupplierPayment: () => void;
  onSupplierStatement: () => void;
  onSignOut: () => void;
  onChangeConnection: () => void;
}

export function ActionGrid(props: ActionGridProps) {
  const actions: { label: string; accessibilityLabel: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void; primary?: boolean }[] = [
    { label: 'Scan product', accessibilityLabel: 'Scan a product', icon: 'barcode-outline', onPress: props.onScan, primary: true },
    { label: 'Attach receipt', accessibilityLabel: 'Attach supplier receipt', icon: 'receipt-outline', onPress: props.onAttachReceipt },
    { label: 'Supplier invoice', accessibilityLabel: 'Record supplier invoice', icon: 'document-text-outline', onPress: props.onSupplierInvoice },
    { label: 'Supplier payment', accessibilityLabel: 'Record supplier payment', icon: 'wallet-outline', onPress: props.onSupplierPayment },
    { label: 'Supplier statement', accessibilityLabel: 'Supplier statement', icon: 'list-outline', onPress: props.onSupplierStatement },
    { label: 'Sign out', accessibilityLabel: 'Sign out', icon: 'log-out-outline', onPress: props.onSignOut },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.grid}>
        {actions.map((action) => (
          <Pressable
            key={action.icon}
            accessibilityRole="button"
            accessibilityLabel={action.accessibilityLabel}
            onPress={action.onPress}
            style={({ pressed }) => [styles.card, action.primary && styles.primaryCard, pressed && styles.pressed]}
          >
            <Ionicons name={action.icon} size={36} color={action.primary ? '#047857' : '#0f172a'} accessible={false} />
            <Text style={[styles.label, action.primary && styles.primaryLabel]}>{action.label}</Text>
          </Pressable>
        ))}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Change backend URL"
        onPress={props.onChangeConnection}
        style={({ pressed }) => [styles.settings, pressed && styles.pressed]}
      >
        <Ionicons name="cog-outline" size={32} color="#475569" accessible={false} />
        <Text style={styles.settingsLabel}>Change backend URL</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
  card: {
    width: '48%', aspectRatio: 1 / 0.9, minHeight: 132,
    backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 14,
    padding: 16, gap: 12, alignItems: 'center', justifyContent: 'center',
    elevation: 2, shadowColor: '#0f172a', shadowOffset: { width: 0, height: 2 }, shadowRadius: 4, shadowOpacity: 0.05,
  },
  primaryCard: { borderColor: '#a7f3d0' },
  pressed: { transform: [{ scale: 0.98 }], backgroundColor: '#f1f5f9' },
  label: { color: '#0f172a', fontSize: 16, fontWeight: '700', textAlign: 'center', flexShrink: 1 },
  primaryLabel: { color: '#047857' },
  settings: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, padding: 12, borderRadius: 14 },
  settingsLabel: { color: '#475569', fontSize: 14, fontWeight: '600' },
});
