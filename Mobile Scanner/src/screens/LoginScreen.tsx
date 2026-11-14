import { useState } from 'react';
import { Alert, Keyboard } from 'react-native';
import { login } from '../api/auth-api';
import { HcApiError } from '../api/hc-client';
import { AppButton } from '../components/AppButton';
import { AppInput } from '../components/AppInput';
import { StatusBanner } from '../components/StatusBanner';
import { ConnectionSettings } from '../types/scanner.types';
import { AuthLayout } from '../ui/AuthLayout';

interface LoginScreenProps {
  connection: ConnectionSettings;
  startupMessage: string | null;
  onLoggedIn: (
    accessToken: string,
    user: { id: string; username: string; fullName: string; role: 'ADMIN' | 'EMPLOYEE' },
    refreshToken?: string | null
  ) => Promise<void>;
  onChangeConnection: () => Promise<void>;
}

type Banner = { tone: 'info' | 'warning' | 'danger'; message: string };

export function LoginScreen({
  connection,
  startupMessage,
  onLoggedIn,
  onChangeConnection,
}: LoginScreenProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(
    startupMessage ? { tone: 'info', message: startupMessage } : null
  );

  const canSubmit = username.trim().length > 0 && password.length > 0 && !submitting;

  const handleSubmit = async () => {
    Keyboard.dismiss();
    if (!canSubmit) return;
    setBanner(null);
    setSubmitting(true);
    try {
      const result = await login(connection, { username: username.trim(), password });
      await onLoggedIn(result.accessToken, result.user, result.refreshToken);
    } catch (error) {
      if (error instanceof HcApiError && error.kind === 'UNAUTHORIZED') {
        setBanner({ tone: 'danger', message: 'Username or password is wrong. Try again.' });
      } else if (error instanceof HcApiError && error.kind === 'RATE_LIMITED') {
        setBanner({
          tone: 'warning',
          message: 'Too many attempts. Wait a minute, then try again.',
        });
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
    Alert.alert('Change PC', 'Connect this phone to a different PC?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Change', style: 'destructive', onPress: () => void onChangeConnection() },
    ]);
  };

  return (
    <AuthLayout title="Welcome back" subtitle={`Sign in to the shop PC at ${connection.host}`}>
      {banner ? <StatusBanner tone={banner.tone} message={banner.message} /> : null}
      <AppInput
        label="Username"
        required
        icon="person-outline"
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="username"
        returnKeyType="next"
        editable={!submitting}
      />
      <AppInput
        label="Password"
        required
        icon="lock-closed-outline"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        textContentType="password"
        autoComplete="password"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="go"
        onSubmitEditing={() => void handleSubmit()}
        editable={!submitting}
      />
      <AppButton
        label={submitting ? 'Signing in…' : 'Sign in'}
        onPress={handleSubmit}
        loading={submitting}
        disabled={!canSubmit}
      />
      <AppButton
        label="Use another PC"
        icon="swap-horizontal-outline"
        variant="ghost"
        onPress={confirmChangeConnection}
      />
    </AuthLayout>
  );
}
