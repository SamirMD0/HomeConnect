import { Stack } from 'expo-router';
import { ScreenHeader } from '../ui/ScreenHeader';
import { theme } from '../theme';
const titles: Record<string, string> = {
  bill: 'Supplier bill',
  'pending-bills': 'Pending bills',
  invoice: 'Supplier invoice',
  payment: 'Payment',
  statement: 'Supplier statement',
  count: 'Stock count',
  'connection-log': 'Connection details',
  receivables: 'Receivables',
  design: 'Design preview',
};
export function TabStack() {
  return (
    <Stack
      screenOptions={({ route }) => ({
        title: titles[route.name] ?? route.name,
        // Centred blue title and back chevron. The bell lives in the branch header above.
        header: ({ navigation, options, back }) => (
          <ScreenHeader
            title={
              typeof options.title === 'string' ? options.title : (titles[route.name] ?? route.name)
            }
            onBack={back ? navigation.goBack : undefined}
            topInset={false}
          />
        ),
        contentStyle: { backgroundColor: theme.colors.background },
      })}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
    </Stack>
  );
}
