import { theme } from '../theme';
import { StyleSheet, Text, View } from 'react-native';

interface StatusBannerProps {
  message: string;
  tone?: 'info' | 'success' | 'warning' | 'danger';
}

export function StatusBanner({ message, tone = 'info' }: StatusBannerProps) {
  return (
    <View accessibilityRole={tone === 'danger' ? 'alert' : undefined} style={[styles.base, styles[tone]]}>
      <Text style={[styles.text, tone === 'danger' && styles.dangerText]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { borderWidth: 1, borderRadius: 12, padding: 12 },
  info: { backgroundColor: theme.colors.brandSoft, borderColor: theme.colors.brandBorder },
  success: { backgroundColor: theme.colors.successSoft, borderColor: theme.colors.successBorder },
  warning: { backgroundColor: theme.colors.warningSoft, borderColor: theme.colors.warningBorder },
  danger: { backgroundColor: theme.colors.dangerSoft, borderColor: theme.colors.dangerBorder },
  text: { color: theme.colors.muted, fontSize: 14, lineHeight: 20 },
  dangerText: { color: theme.colors.danger },
});
