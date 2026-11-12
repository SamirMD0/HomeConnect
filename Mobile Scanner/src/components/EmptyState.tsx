import { StyleSheet, Text, View } from 'react-native';
import { AppButton } from './AppButton';
import { theme } from '../theme';
export function EmptyState({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {action && <AppButton {...action} />}
    </View>
  );
}
const styles = StyleSheet.create({
  container: { padding: theme.spacing.xl, gap: theme.spacing.lg, alignItems: 'stretch' },
  title: { fontSize: theme.type.title, fontWeight: '700', color: theme.colors.text },
  message: { fontSize: theme.type.body, lineHeight: 24, color: theme.colors.muted },
});
