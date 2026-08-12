import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { scannerApi, ScannerApiError } from '../api/scanner-api';
import { AppButton } from '../components/AppButton';
import { AppInput } from '../components/AppInput';
import { StatusBanner } from '../components/StatusBanner';
import { saveSessionToken } from '../storage/secure-storage';
import { ConnectionSettings } from '../types/scanner.types';
import { scannerBaseUrl } from '../utils/scanner-url';

interface PairingScreenProps {
  connection: ConnectionSettings;
  onPaired: (token: string) => void;
  onChangeConnection: () => void;
}

export function PairingScreen({ connection, onPaired, onChangeConnection }: PairingScreenProps) {
  const [code, setCode] = useState('');
  const [deviceLabel, setDeviceLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const pair = async () => {
    const trimmedCode = code.trim();
    const trimmedLabel = deviceLabel.trim();
    if (!/^\d{6}$/.test(trimmedCode)) {
      setMessage('Enter the six-digit code shown on the PC / أدخل الرمز المكوّن من 6 أرقام');
      return;
    }
    if (trimmedLabel.length > 40) {
      setMessage('Device name may contain at most 40 characters.');
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const result = await scannerApi.pair(connection, trimmedCode, trimmedLabel || undefined);
      await saveSessionToken(result.token);
      onPaired(result.token);
    } catch (error) {
      if (error instanceof ScannerApiError && error.kind === 'RATE_LIMITED') {
        setMessage('Too many attempts. Slow down and try again shortly / محاولات كثيرة، حاول لاحقاً');
      } else if (error instanceof ScannerApiError && error.kind === 'NETWORK') {
        setMessage(error.message);
      } else if (error instanceof ScannerApiError && error.kind === 'UNAUTHORIZED') {
        setMessage('Pairing failed. Generate a new code on the PC and try again / فشل الربط، أنشئ رمزاً جديداً');
      } else {
        setMessage('Could not pair this phone. Try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <Text style={styles.title}>Pair this phone / ربط الهاتف</Text>
          <Text style={styles.subtitle}>On the PC, open Scanner Hub and press Generate Code. The code works once and expires after five minutes.</Text>
          <Text style={styles.address}>{scannerBaseUrl(connection)}</Text>
        </View>

        {message && <StatusBanner tone="danger" message={message} />}

        <View style={styles.form}>
          <AppInput
            label="Six-digit pairing code / رمز الربط"
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            maxLength={6}
            placeholder="000000"
            textAlign="center"
            style={styles.codeInput}
          />
          <AppInput
            label="Device name (optional) / اسم الجهاز"
            value={deviceLabel}
            onChangeText={setDeviceLabel}
            maxLength={40}
            placeholder="Shop phone"
          />
          <AppButton label="Pair phone / ربط الهاتف" onPress={() => void pair()} loading={busy} />
          <AppButton label="Change PC address / تغيير عنوان الكمبيوتر" onPress={onChangeConnection} variant="secondary" />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, padding: 22, justifyContent: 'center', gap: 22, backgroundColor: '#f8fafc' },
  hero: { gap: 9 },
  title: { color: '#0f172a', fontSize: 29, fontWeight: '900' },
  subtitle: { color: '#64748b', fontSize: 15, lineHeight: 22 },
  address: { color: '#047857', fontSize: 13, fontWeight: '700' },
  form: { gap: 17 },
  codeInput: { fontSize: 28, fontWeight: '800', letterSpacing: 8 },
});
