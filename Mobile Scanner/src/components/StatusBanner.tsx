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
  info: { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' },
  success: { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' },
  warning: { backgroundColor: '#fffbeb', borderColor: '#fde68a' },
  danger: { backgroundColor: '#fff1f2', borderColor: '#fecdd3' },
  text: { color: '#334155', fontSize: 14, lineHeight: 20 },
  dangerText: { color: '#9f1239' },
});
