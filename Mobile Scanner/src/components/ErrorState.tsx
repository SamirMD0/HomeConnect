import { View } from 'react-native';
import { StatusBanner } from './StatusBanner';
import { AppButton } from './AppButton';
import { theme } from '../theme';
export function ErrorState({
  message,
  onRetry,
  busy,
}: {
  message: string;
  onRetry: () => void;
  busy?: boolean;
}) {
  return (
    <View style={{ padding: theme.spacing.lg, gap: theme.spacing.md }}>
      <StatusBanner tone="danger" message={message} />
      <AppButton label="Retry" onPress={onRetry} loading={busy} />
    </View>
  );
}
