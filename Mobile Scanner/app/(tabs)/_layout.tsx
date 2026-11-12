import { Tabs, useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { BranchHeader } from '../../src/navigation/BranchHeader';
import { theme } from '../../src/theme';
const icons = {
  home: 'home-outline',
  sell: 'cart-outline',
  stock: 'cube-outline',
  suppliers: 'business-outline',
  more: 'grid-outline',
} as const;
export default function TabLayout() {
  const router = useRouter(),
    insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={({ route }) => ({
          header: () => <BranchHeader />,
          tabBarActiveTintColor: theme.colors.brand,
          tabBarInactiveTintColor: theme.colors.muted,
          tabBarStyle: {
            height: 64 + insets.bottom,
            paddingBottom: insets.bottom + 4,
            backgroundColor: theme.colors.surface,
            borderTopColor: theme.colors.border,
          },
          tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
          tabBarIcon: ({ color, size }) => (
            <Ionicons
              name={icons[route.name as keyof typeof icons] ?? 'ellipse-outline'}
              color={color}
              size={size}
            />
          ),
        })}
      >
        <Tabs.Screen name="home" options={{ title: 'Home' }} />
        <Tabs.Screen name="sell" options={{ title: 'Sell' }} />
        <Tabs.Screen name="stock" options={{ title: 'Stock' }} />
        <Tabs.Screen name="suppliers" options={{ title: 'Suppliers' }} />
        <Tabs.Screen name="more" options={{ title: 'More' }} />
      </Tabs>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Scan a product from any tab"
        onPress={() => router.push('/scan')}
        style={({ pressed }) => ({
          position: 'absolute',
          right: 20,
          bottom: 80 + insets.bottom,
          width: 56,
          height: 56,
          borderRadius: 28,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.brand,
          elevation: 4,
          opacity: pressed ? 0.8 : 1,
        })}
      >
        <Ionicons name="scan" color={theme.colors.white} size={28} accessible={false} />
      </Pressable>
    </View>
  );
}
