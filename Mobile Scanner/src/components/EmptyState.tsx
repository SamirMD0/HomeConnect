import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';
import { AppButton } from './AppButton';
import { theme } from '../theme';
import { IconTile } from '../ui/Stats';
export function EmptyState({
  title,
  message,
  action,
  icon = 'file-tray-outline',
}: {
  title: string;
  message: string;
  action?: { label: string; onPress: () => void };
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={styles.container}>
      <View style={styles.tile}>
        <IconTile icon={icon} tone="neutral" size={56} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {action && <AppButton {...action} />}
    </View>
  );
}
const styles = StyleSheet.create({
  container: { padding: theme.spacing.xl, gap: theme.spacing.sm, alignItems: 'stretch' },
  tile: { alignItems: 'center', marginBottom: theme.spacing.sm },
  title: { ...theme.text.titleSmall, color: theme.colors.text, textAlign: 'center' },
  message: {
    ...theme.text.body,
    color: theme.colors.muted,
    textAlign: 'center',
    marginBottom: theme.spacing.sm,
  },
});
