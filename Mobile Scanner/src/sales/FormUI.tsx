import type { PropsWithChildren } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { theme } from '../theme';
import { AppButton } from '../components/AppButton';
import { StatusBanner } from '../components/StatusBanner';
import { readStyles } from '../lookup/ReadUI';
export function FormPage({ title, children }: PropsWithChildren<{ title: string }>) {
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={110}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 16, paddingBottom: 128, gap: 16 }}
      >
        <Text accessibilityRole="header" style={readStyles.title}>
          {title}
        </Text>
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
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
