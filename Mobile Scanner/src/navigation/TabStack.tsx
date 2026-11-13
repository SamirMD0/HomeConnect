import { Stack } from 'expo-router';
import { theme } from '../theme';
const titles: Record<string, string> = {
  bill: 'Supplier bill',
  'pending-bills': 'Pending bills',
  invoice: 'Supplier invoice',
  payment: 'Payment',
  statement: 'Supplier statement',
  count: 'Stock count',
  'connection-log': 'Connection details',
};
export function TabStack() {
  return (
    <Stack
      screenOptions={({ route }) => ({
        title: titles[route.name] ?? route.name,
        headerTintColor: theme.colors.brand,
        headerStyle: { backgroundColor: theme.colors.surface },
        contentStyle: { backgroundColor: theme.colors.background },
      })}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
    </Stack>
  );
}
