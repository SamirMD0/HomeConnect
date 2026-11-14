import type { PropsWithChildren, ReactNode } from 'react';
import { View } from 'react-native';
import { AppButton } from '../components/AppButton';
import { StatusBanner } from '../components/StatusBanner';
import { FormScreen } from '../ui/FormScreen';
import { PageTitle } from '../ui/ScreenHeader';
/** Sales forms: keyboard-safe scroll; `footer` (an ActionBar) rides above the keyboard. */
export function FormPage({
  title,
  subtitle,
  footer,
  children,
}: PropsWithChildren<{ title: string; subtitle?: string; footer?: ReactNode }>) {
  return (
    <FormScreen footer={footer} contentStyle={{ paddingBottom: footer ? 24 : 128 }}>
      <PageTitle title={title} subtitle={subtitle} />
      {children}
    </FormScreen>
  );
}
export function DraftNotice({
  locked,
  error,
  onDiscard,
}: {
  locked: boolean;
  error: string;
  onDiscard: () => void;
}) {
  return (
    <View style={{ gap: 12 }}>
      {error ? <StatusBanner tone="danger" message={error} /> : null}
      {locked ? (
        <StatusBanner
          message="This may already be saved on the PC. Retry to get the same record."
          tone="warning"
        />
      ) : null}
      {!locked && <AppButton label="Discard form" variant="secondary" onPress={onDiscard} />}
    </View>
  );
}
