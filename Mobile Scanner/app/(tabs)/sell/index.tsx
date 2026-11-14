import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { CustomersScreen } from '../../../src/lookup/screens/CustomersScreen';
import { ReceivablesCard } from '../../../src/customers/ReceivablesCard';
import { useSession } from '../../../src/session/SessionProvider';
import { theme } from '../../../src/theme';

type Tile = { label: string; icon: keyof typeof Ionicons.glyphMap; path: string };

/**
 * Customers tab (route folder kept as `sell` so every existing link works):
 * receivables first, a row of sales actions, then the customer list.
 */
export default function Customers() {
  const router = useRouter();
  const session = useSession();
  const tiles: Tile[] = [
    ...(session.can('orders.create')
      ? [{ label: 'New order', icon: 'cart-outline' as const, path: '/(tabs)/sell/new-order' }]
      : []),
    { label: 'Orders', icon: 'receipt-outline', path: '/(tabs)/sell/orders' },
    { label: 'Prepaid', icon: 'time-outline', path: '/(tabs)/sell/prepaid' },
    { label: 'Payment', icon: 'wallet-outline', path: '/(tabs)/sell/payment' },
  ];
  return (
    <View style={{ flex: 1 }}>
      <CustomersScreen
        intro={
          <View style={styles.intro}>
            <ReceivablesCard onPress={() => router.push('/(tabs)/sell/receivables')} />
            <View style={styles.tiles}>
              {tiles.map((tile) => (
                <Pressable
                  key={tile.label}
                  accessibilityRole="button"
                  accessibilityLabel={tile.label}
                  onPress={() => router.push(tile.path as never)}
                  style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
                >
                  <View style={styles.tileIcon}>
                    <Ionicons name={tile.icon} size={24} color={theme.colors.brand} accessible={false} />
                  </View>
                  <Text style={styles.tileLabel} numberOfLines={1}>
                    {tile.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  intro: { gap: theme.spacing.md },
  tiles: { flexDirection: 'row', gap: theme.spacing.sm },
  tile: { flex: 1, minHeight: 76, alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: theme.radius.md },
  pressed: { backgroundColor: theme.colors.brandSoft },
  tileIcon: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.brandSoft,
  },
  tileLabel: { fontSize: theme.type.caption, fontWeight: '600', color: theme.colors.text },
});
