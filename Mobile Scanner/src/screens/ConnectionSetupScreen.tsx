import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { scannerApi, ScannerApiError } from '../api/scanner-api';
import { AppButton } from '../components/AppButton';
import { AppInput } from '../components/AppInput';
import { StatusBanner } from '../components/StatusBanner';
import { saveConnection } from '../storage/secure-storage';
import { ConnectionSettings } from '../types/scanner.types';
import { DEFAULT_SCANNER_PORT, parseConnection } from '../utils/scanner-url';

interface ConnectionSetupScreenProps {
  initialSettings: ConnectionSettings | null;
  onConnected: (settings: ConnectionSettings) => void;
}

export function ConnectionSetupScreen({ initialSettings, onConnected }: ConnectionSetupScreenProps) {
  const [host, setHost] = useState(initialSettings?.host ?? '');
  const [port, setPort] = useState(String(initialSettings?.port ?? DEFAULT_SCANNER_PORT));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const testAndContinue = async () => {
    const validation = parseConnection(host, port);
    if (!validation.ok) {
      setMessage(validation.message);
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      await scannerApi.testConnection(validation.value);
      await saveConnection(validation.value);
      onConnected(validation.value);
    } catch (error) {
      setMessage(error instanceof ScannerApiError
        ? error.message
        : 'Could not securely save the PC connection.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>HOME CONNECT</Text>
          <Text style={styles.title}>Connect to the shop PC</Text>
          <Text style={styles.arabic}>الاتصال بكمبيوتر المتجر</Text>
          <Text style={styles.subtitle}>
            On the PC, open Scanner Hub and turn on Mobile Scanner. Enter the address shown there.
          </Text>
        </View>

        {message && <StatusBanner tone="danger" message={message} />}

        <View style={styles.form}>
          <AppInput
            label="PC IP address / عنوان الكمبيوتر"
            value={host}
            onChangeText={setHost}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="numbers-and-punctuation"
            placeholder="192.168.1.20"
            hint="Use the address displayed in Scanner Hub. The phone and PC must be on the same Wi-Fi."
          />
          <AppInput
            label="Scanner port / منفذ الماسح"
            value={port}
            onChangeText={setPort}
            keyboardType="number-pad"
            maxLength={5}
            placeholder={String(DEFAULT_SCANNER_PORT)}
          />
          <AppButton label="Test connection and continue / اختبار ومتابعة" onPress={() => void testAndContinue()} loading={busy} />
        </View>

        <StatusBanner
          message="Nothing is sent to the internet. This app talks only to the PC address you enter / لا يتم إرسال أي شيء إلى الإنترنت"
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, padding: 22, justifyContent: 'center', gap: 22, backgroundColor: '#f8fafc' },
  hero: { gap: 7 },
  eyebrow: { color: '#047857', fontSize: 12, fontWeight: '900', letterSpacing: 2 },
  title: { color: '#0f172a', fontSize: 30, fontWeight: '900' },
  arabic: { color: '#334155', fontSize: 21, fontWeight: '700', textAlign: 'left' },
  subtitle: { color: '#64748b', fontSize: 15, lineHeight: 22, marginTop: 6 },
  form: { gap: 17 },
});
