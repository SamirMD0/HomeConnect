import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { scannerApi, ScannerApiError } from '../api/scanner-api';
import { AppButton } from '../components/AppButton';
import { AppInput } from '../components/AppInput';
import { StatusBanner } from '../components/StatusBanner';
import { saveConnection } from '../storage/secure-storage';
import { ConnectionSettings } from '../types/scanner.types';
import { DEFAULT_SCANNER_PORT, parseConnection } from '../utils/scanner-url';
import { QrPairScreen } from './QrPairScreen';

interface ConnectionSetupScreenProps {
  initialSettings: ConnectionSettings | null;
  onConnected: (settings: ConnectionSettings) => void;
}

export function ConnectionSetupScreen({ initialSettings, onConnected }: ConnectionSetupScreenProps) {
  const [host, setHost] = useState(initialSettings?.host ?? '');
  const [port, setPort] = useState(String(initialSettings?.port ?? DEFAULT_SCANNER_PORT));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // Manual IP/port is the fallback. Keep it collapsed by default so the first
  // action most operators see is "Scan QR" — the fix for the main pain point.
  const [manualOpen, setManualOpen] = useState(!!initialSettings);
  const [qrOpen, setQrOpen] = useState(false);

  const connect = async (settings: ConnectionSettings): Promise<string | null> => {
    try {
      await scannerApi.testConnection(settings);
      await saveConnection(settings);
      onConnected(settings);
      return null;
    } catch (error) {
      return error instanceof ScannerApiError ? error.message : 'Could not securely save the PC connection.';
    }
  };

  const testAndContinue = async () => {
    const validation = parseConnection(host, port);
    if (!validation.ok) {
      setMessage(validation.message);
      return;
    }
    setBusy(true);
    setMessage(null);
    const failure = await connect(validation.value);
    if (failure) setMessage(failure);
    setBusy(false);
  };

  const handlePaired = async (settings: ConnectionSettings) => {
    setQrOpen(false);
    setBusy(true);
    setMessage(null);
    setHost(settings.host);
    setPort(String(settings.port));
    const failure = await connect(settings);
    if (failure) {
      // Show the manual form prefilled with the scanned values so the operator
      // can see what the QR said and either retry or edit it.
      setManualOpen(true);
      setMessage(`${failure} The scanned address was ${settings.host}:${settings.port}.`);
    }
    setBusy(false);
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>HOME CONNECT</Text>
          <Text style={styles.title}>Connect to the shop PC</Text>
          <Text style={styles.subtitle}>
            On the PC, open Scanner Hub and turn on Mobile Scanner. Scan the QR shown there — no typing needed.
          </Text>
        </View>

        {message && <StatusBanner tone="danger" message={message} />}

        <View style={styles.primary}>
          <AppButton
            label="Scan Scanner Hub QR"
            onPress={() => { setMessage(null); setQrOpen(true); }}
            loading={busy && !manualOpen}
          />
          <Pressable onPress={() => setManualOpen((value) => !value)} accessibilityRole="button">
            <Text style={styles.toggleLink}>
              {manualOpen
                ? 'Hide manual address entry'
                : 'Enter address manually'}
            </Text>
          </Pressable>
        </View>

        {manualOpen && (
          <View style={styles.form}>
            <AppInput
              label="PC IP address"
              value={host}
              onChangeText={setHost}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="numbers-and-punctuation"
              placeholder="192.168.1.20"
              hint="Use the address displayed in Scanner Hub. The phone and PC must be on the same Wi-Fi."
            />
            <AppInput
              label="Scanner port"
              value={port}
              onChangeText={setPort}
              keyboardType="number-pad"
              maxLength={5}
              placeholder={String(DEFAULT_SCANNER_PORT)}
            />
            <AppButton label="Test connection and continue" onPress={() => void testAndContinue()} loading={busy} />
          </View>
        )}

        <StatusBanner
          message="Nothing is sent to the internet. This app talks only to the PC address you enter"
        />
      </ScrollView>

      <QrPairScreen visible={qrOpen} onCancel={() => setQrOpen(false)} onPaired={handlePaired} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, padding: 22, justifyContent: 'center', gap: 22, backgroundColor: '#f8fafc' },
  hero: { gap: 7 },
  eyebrow: { color: '#047857', fontSize: 12, fontWeight: '900', letterSpacing: 2 },
  title: { color: '#0f172a', fontSize: 30, fontWeight: '900' },
  subtitle: { color: '#64748b', fontSize: 15, lineHeight: 22, marginTop: 6 },
  primary: { gap: 10, alignItems: 'stretch' },
  toggleLink: { color: '#047857', fontWeight: '700', textAlign: 'center', paddingVertical: 6 },
  form: { gap: 17 },
});
