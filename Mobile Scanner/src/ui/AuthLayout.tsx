import type { PropsWithChildren } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import appConfig from '../../app.json';
import { theme } from '../theme';
import { PageTitle } from './ScreenHeader';

/**
 * Connect and sign-in frame: brand mark, large left title with a grey
 * subtitle, the form, and the version at the bottom. The focused field and
 * the main button stay above the keyboard.
 */
export function AuthLayout({
  title,
  subtitle,
  children,
}: PropsWithChildren<{ title: string; subtitle: string }>) {
  return (
    <KeyboardAwareScrollView
      bottomOffset={32}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.content}
      style={styles.screen}
    >
      <View style={styles.brand}>
        <View style={styles.mark}>
          <Ionicons name="storefront" size={26} color={theme.colors.onBrand} accessible={false} />
        </View>
        <Text style={styles.name}>Home Connect</Text>
      </View>
      <PageTitle title={title} subtitle={subtitle} />
      <View style={styles.body}>{children}</View>
      <Text style={styles.version}>Version {appConfig.expo.version}</Text>
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: {
    flexGrow: 1,
    padding: theme.spacing.xl,
    paddingTop: theme.spacing.xxl,
    gap: theme.spacing.xl,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  mark: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.brand,
  },
  name: { ...theme.text.titleSmall, color: theme.colors.brandStrong },
  body: { gap: theme.spacing.lg, flexGrow: 1 },
  version: { ...theme.text.caption, color: theme.colors.subtle, textAlign: 'center' },
});
