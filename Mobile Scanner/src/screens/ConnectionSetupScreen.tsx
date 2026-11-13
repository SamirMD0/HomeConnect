import { theme } from '../theme';
import { useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { CompatibilityState } from '../api/system-api';
import { candidateHosts, findPc } from '../connection/find-pc';
import { AppButton } from '../components/AppButton';
import { AppInput } from '../components/AppInput';
import { StatusBanner } from '../components/StatusBanner';
import { saveConnection } from '../storage/secure-storage';
import { ConnectionSettings } from '../types/scanner.types';
import { DEFAULT_SCANNER_PORT, parseConnection } from '../utils/scanner-url';
import { QrPairScreen } from './QrPairScreen';
import { ConnectionLogPanel } from '../connection/ConnectionLogPanel';

interface ConnectionSetupScreenProps {
  initialSettings: ConnectionSettings | null;
  onConnected: (settings: ConnectionSettings, compat: CompatibilityState) => void;
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
  const [detailsOpen, setDetailsOpen] = useState(false);

  const connect = async (settings: ConnectionSettings): Promise<string | null> => {
    let found;
    try {
      found = await findPc(settings);
    } catch (error) {
      return error instanceof Error ? error.message : 'Could not reach the shop PC.';
    }
    try {
      await saveConnection(found.settings);
    } catch {
      return 'Could not securely save the PC connection.';
    }
    onConnected(found.settings, found.compat);
    return null;
  };

  const testAndContinue = async () => {
    const validation = parseConnection(host, port);
    if (!validation.ok) {
      setMessage(validation.message);
      return;
    }
    setBusy(true);
    setMessage(null);
    // Typing the address the phone already knows keeps the PC's other addresses.
    const known = initialSettings && candidateHosts(initialSettings).includes(validation.value.host);
    const failure = await connect(
      known ? { ...validation.value, alternates: candidateHosts(initialSettings) } : validation.value
    );
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
          <View style={styles.logo}>
            <Ionicons name="storefront-outline" size={40} color={theme.colors.brand} accessible={false} />
          </View>
          <Text accessibilityRole="header" style={styles.title}>Home Connect</Text>
          <Text style={styles.subtitle}>Connect to the shop PC</Text>
        </View>

        {message && <StatusBanner tone="danger" message={message} />}
        {message && (
          <AppButton
            label={detailsOpen ? 'Hide details' : 'Connection details'}
            icon="pulse-outline"
            variant="secondary"
            onPress={() => setDetailsOpen((value) => !value)}
          />
        )}
        {message && detailsOpen && <ConnectionLogPanel limit={12} />}

        <View style={styles.primary}>
          <AppButton
            label="Scan PC code"
            icon="qr-code-outline"
            onPress={() => { setMessage(null); setQrOpen(true); }}
            loading={busy && !manualOpen}
          />
          <AppButton
            label={manualOpen ? 'Hide address' : 'Type address'}
            icon={manualOpen ? 'chevron-up-outline' : 'create-outline'}
            variant="secondary"
            onPress={() => setManualOpen((value) => !value)}
          />
        </View>

        {manualOpen && (
          <View style={styles.form}>
            <AppInput
              label="PC address"
              value={host}
              onChangeText={setHost}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="numbers-and-punctuation"
              placeholder="192.168.1.20"
            />
            <AppInput
              label="Port"
              value={port}
              onChangeText={setPort}
              keyboardType="number-pad"
              maxLength={5}
              placeholder={String(DEFAULT_SCANNER_PORT)}
            />
            <AppButton label="Connect" icon="link-outline" onPress={() => void testAndContinue()} loading={busy} />
          </View>
        )}
      </ScrollView>

      <QrPairScreen visible={qrOpen} onCancel={() => setQrOpen(false)} onPaired={handlePaired} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  content: { flexGrow: 1, padding: 22, justifyContent: 'center', gap: 22, backgroundColor: theme.colors.background },
  hero: { gap: 6, alignItems: 'center' },
  logo: {
    width: 76,
    height: 76,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.brandSoft,
    marginBottom: 8,
  },
  title: { color: theme.colors.text, fontSize: 28, fontWeight: '800' },
  subtitle: { color: theme.colors.muted, fontSize: 16 },
  primary: { gap: 10, alignItems: 'stretch' },
  form: { gap: 17 },
});
