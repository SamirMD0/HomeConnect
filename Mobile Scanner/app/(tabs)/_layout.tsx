import { Tabs, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GlassPanel } from '../../src/components/ui/glass';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { BranchHeader } from '../../src/navigation/BranchHeader';
import { theme } from '../../src/theme';
const icons = {
  home: 'home-outline',
  sell: 'people-outline',
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
          // Screens are see-through so the glass backdrop shows behind them.
          sceneStyle: { backgroundColor: 'transparent' },
          tabBarActiveTintColor: theme.colors.brandStrong,
          tabBarInactiveTintColor: theme.colors.muted,
          // Frosted glass bar, like the header and the PC sidebar.
          tabBarBackground: () => <GlassPanel style={StyleSheet.absoluteFill} />,
          tabBarStyle: {
            height: 72 + insets.bottom,
            paddingTop: 8,
            paddingBottom: insets.bottom + 6,
            backgroundColor: 'transparent',
            borderTopColor: 'rgba(255,255,255,0.7)',
            elevation: 0,
          },
          tabBarItemStyle: { paddingHorizontal: 0 },
          // Shrinks to fit instead of cutting words ("Custo...").
          tabBarLabel: ({ color, children }) => (
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
              style={{ color, fontSize: 12, fontFamily: 'PlusJakartaSans_600SemiBold', marginTop: 2, maxWidth: '100%' }}
            >
              {children}
            </Text>
          ),
          // Material 3 navigation bar: a soft pill behind the active icon,
          // filled icon when active, outline when not.
          tabBarIcon: ({ color, focused }) => {
            const outline = icons[route.name as keyof typeof icons] ?? 'ellipse-outline';
            const name = (
              focused ? outline.replace('-outline', '') : outline
            ) as keyof typeof Ionicons.glyphMap;
            return (
              <View
                style={{
                  width: 56,
                  height: 30,
                  borderRadius: theme.radius.pill,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: focused ? theme.colors.brandSoft : 'transparent',
                }}
              >
                <Ionicons name={name} color={color} size={22} />
              </View>
            );
          },
        })}
      >
        <Tabs.Screen name="home" options={{ title: 'Home' }} />
        <Tabs.Screen name="sell" options={{ title: 'Customers' }} />
        <Tabs.Screen
          name="scan-tab"
          options={{
            title: 'Scan',
            // The centre button opens the full-screen scanner instead of a tab.
            tabBarButton: () => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Scan a product"
                onPress={() => router.push('/scan')}
                style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
              >
                {({ pressed }) => (
                  <View
                    style={{
                      width: 56,
                      height: 56,
                      marginTop: -18,
                      borderRadius: 28,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: theme.colors.brand,
                      borderWidth: 4,
                      borderColor: theme.colors.surface,
                      elevation: 4,
                      opacity: pressed ? 0.8 : 1,
                    }}
                  >
                    <Ionicons name="scan" color={theme.colors.white} size={26} accessible={false} />
                  </View>
                )}
              </Pressable>
            ),
          }}
        />
        <Tabs.Screen name="stock" options={{ title: 'Stock' }} />
        <Tabs.Screen name="suppliers" options={{ title: 'Suppliers' }} />
        {/* Reports and settings open from the header menu button. */}
        <Tabs.Screen name="more" options={{ title: 'More', href: null }} />
      </Tabs>
    </View>
  );
}
