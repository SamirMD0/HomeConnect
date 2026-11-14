import Ionicons from '@expo/vector-icons/Ionicons';
import { theme } from '../theme';
import { StyleSheet, Text, View } from 'react-native';
import { toneColors } from '../ui/Badge';

const toneMap = {
  info: 'brand',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
} as const;
const icons = {
  info: 'information-circle',
  success: 'checkmark-circle',
  warning: 'warning',
  danger: 'alert-circle',
} as const;

interface StatusBannerProps {
  message: string;
  tone?: 'info' | 'success' | 'warning' | 'danger';
}

export function StatusBanner({ message, tone = 'info' }: StatusBannerProps) {
  return (
    <View
      accessibilityRole={tone === 'danger' ? 'alert' : undefined}
      style={[styles.base, styles[tone]]}
    >
      <Ionicons
        name={icons[tone]}
        size={20}
        color={toneColors[toneMap[tone]].fg}
        accessible={false}
      />
      <Text
        style={[
          styles.text,
          { color: tone === 'info' ? theme.colors.text : toneColors[toneMap[tone]].fg },
        ]}
      >
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    padding: 12,
  },
  info: { backgroundColor: theme.colors.brandSoft, borderColor: theme.colors.brandBorder },
  success: { backgroundColor: theme.colors.successSoft, borderColor: theme.colors.successBorder },
  warning: { backgroundColor: theme.colors.warningSoft, borderColor: theme.colors.warningBorder },
  danger: { backgroundColor: theme.colors.dangerSoft, borderColor: theme.colors.dangerBorder },
  text: { flex: 1, ...theme.text.label, fontWeight: '500' },
});
