import type { PropsWithChildren, ReactNode } from 'react';
import { Store } from 'lucide-react-native';
import { View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import appConfig from '../../app.json';
import { Card, CardContent } from '../components/ui/card';
import { Text } from '../components/ui/text';

/**
 * Connect, sign-in and branch screens: the logo on the glass backdrop and one
 * white card holding the form, like the PC's sign-in. No explanation text.
 * `corner` sits top right (e.g. Sign out on the branch screen).
 */
export function AuthLayout({
  title,
  children,
  corner,
}: PropsWithChildren<{ title: string; subtitle?: string; corner?: ReactNode }>) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAwareScrollView
      bottomOffset={32}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: 'center',
        paddingTop: insets.top + 24,
        paddingBottom: insets.bottom + 24,
        paddingHorizontal: 20,
        gap: 24,
      }}
    >
      {corner ? <View style={{ position: 'absolute', top: insets.top + 8, right: 12 }}>{corner}</View> : null}
      <View className="items-center gap-3">
        <View className="h-16 w-16 items-center justify-center rounded-2xl bg-primary shadow-lg shadow-brand-900/30">
          <Store size={34} color="#ffffff" />
        </View>
        <Text className="font-sans-extrabold text-2xl text-slate-900">Home Connect</Text>
      </View>
      <Card className="w-full max-w-md self-center">
        <CardContent className="gap-4 p-5">
          <Text accessibilityRole="header" className="font-sans-bold text-xl">
            {title}
          </Text>
          {children}
        </CardContent>
      </Card>
      <Text className="text-center text-xs text-slate-600">v{appConfig.expo.version}</Text>
    </KeyboardAwareScrollView>
  );
}
