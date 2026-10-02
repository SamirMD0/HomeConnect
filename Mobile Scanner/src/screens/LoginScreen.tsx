import { useState } from 'react';
import { Alert, Keyboard, ScrollView, StyleSheet, Text, View } from 'react-native';
import { login } from '../api/auth-api';
import { HcApiError } from '../api/hc-client';
import { AppButton } from '../components/AppButton';
import { AppInput } from '../components/AppInput';
import { StatusBanner } from '../components/StatusBanner';
import { ConnectionSettings } from '../types/scanner.types';

interface LoginScreenProps {
  connection: ConnectionSettings;
  startupMessage: string | null;
  onLoggedIn: (accessToken: string, user: { id: string; email: string; fullName: string; role: 'ADMIN' | 'EMPLOYEE' }) => Promise<void>;
  onChangeConnection: () => Promise<void>;
}

type Banner = { tone: 'info' | 'warning' | 'danger'; message: string };

export function LoginScreen({ connection, startupMessage, onLoggedIn, onChangeConnection }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(
    startupMessage ? { tone: 'info', message: startupMessage } : null,
  );

  const canSubmit = email.trim().length > 0 && password.length > 0 && !submitting;

  const handleSubmit = async () => {
    Keyboard.dismiss();
    if (!canSubmit) return;
    setBanner(null);
    setSubmitting(true);
    try {
      const result = await login(connection, { email: email.trim(), password });
      await onLoggedIn(result.accessToken, result.user);
    } catch (error) {
      if (error instanceof HcApiError && error.kind === 'UNAUTHORIZED') {
        setBanner({ tone: 'danger', message: 'Email or password is wrong. Try again.' });
      } else if (error instanceof HcApiError && error.kind === 'RATE_LIMITED') {
        setBanner({ tone: 'warning', message: 'Too many attempts. Wait a minute, then try again.' });
      } else if (error instanceof HcApiError) {
        setBanner({ tone: 'danger', message: error.message });
      } else {
        setBanner({ tone: 'danger', message: 'Unexpected error. Try again.' });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const confirmChangeConnection = () => {
    Alert.alert(
      'Change backend URL',
      'This clears the current URL and sends you back to Setup. You will need to type the backend URL again.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Change', style: 'destructive', onPress: () => void onChangeConnection() },
      ],
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <Text style={styles.title}>Sign in</Text>
        <Text style={styles.subtitle}>
          Connecting to{' '}
          <Text style={styles.subtitleStrong}>
            {connection.host}:{connection.port}
          </Text>
        </Text>
      </View>

      {banner ? <StatusBanner tone={banner.tone} message={banner.message} /> : null}

      <View style={styles.form}>
        <AppInput
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          placeholder="you@shop.local"
          editable={!submitting}
        />
        <AppInput
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          textContentType="password"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!submitting}
        />

        <AppButton
          label={submitting ? 'Signing in…' : 'Sign in'}
          onPress={handleSubmit}
          loading={submitting}
          disabled={!canSubmit}
        />
      </View>

      <AppButton label="Change backend URL" variant="secondary" onPress={confirmChangeConnection} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 20 },
  header: { gap: 6 },
  title: { fontSize: 28, fontWeight: '800', color: '#0f172a' },
  subtitle: { color: '#475569' },
  subtitleStrong: { fontWeight: '700', color: '#0f172a' },
  form: { gap: 16 },
});
