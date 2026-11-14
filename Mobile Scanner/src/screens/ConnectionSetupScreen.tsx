import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AuthLayout } from '../ui/AuthLayout';
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

export function ConnectionSetupScreen({
  initialSettings,
  onConnected,
}: ConnectionSetupScreenProps) {
  const [host, setHost] = useState(initialSettings?.host ?? '');
  const [port, setPort] = useState(String(initialSettings?.port ?? DEFAULT_SCANNER_PORT));
  const [secondHost, setSecondHost] = useState('');
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
    // A typed second address is raced with the first one.
    let second: string | null = null;
    if (secondHost.trim()) {
      const checked = parseConnection(secondHost, port);
      if (!checked.ok) {
        setMessage(`Second address: ${checked.message}`);
        setBusy(false);
        return;
      }
      second = checked.value.host;
    }
    // Typing the address the phone already knows keeps the PC's other addresses.
    const known =
      initialSettings && candidateHosts(initialSettings).includes(validation.value.host);
    const alternates = [
      ...(known ? candidateHosts(initialSettings) : []),
      ...(second ? [second] : []),
    ].filter((item, index, all) => item !== validation.value.host && all.indexOf(item) === index);
    const failure = await connect(
      alternates.length ? { ...validation.value, alternates } : validation.value
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
    <>
      <AuthLayout
        title="Connect to your shop"
        subtitle="Scan the code on the PC, or type its address"
      >
        {message && <StatusBanner tone="danger" message={message} />}
        {message && (
          <AppButton
            label={detailsOpen ? 'Hide details' : 'Connection details'}
            icon="pulse-outline"
            variant="ghost"
            onPress={() => setDetailsOpen((value) => !value)}
          />
        )}
        {message && detailsOpen && <ConnectionLogPanel limit={12} />}

        <AppButton
          label="Scan PC code"
          icon="qr-code-outline"
          onPress={() => {
            setMessage(null);
            setQrOpen(true);
          }}
          loading={busy && !manualOpen}
        />
        <AppButton
          label={manualOpen ? 'Hide address' : 'Type address'}
          icon={manualOpen ? 'chevron-up-outline' : 'create-outline'}
          variant="secondary"
          onPress={() => setManualOpen((value) => !value)}
        />

        {manualOpen && (
          <View style={styles.form}>
            <AppInput
              label="PC address"
              required
              icon="desktop-outline"
              value={host}
              onChangeText={setHost}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="numbers-and-punctuation"
              placeholder="192.168.1.20"
            />
            <AppInput
              label="Port"
              required
              value={port}
              onChangeText={setPort}
              keyboardType="number-pad"
              maxLength={5}
              placeholder={String(DEFAULT_SCANNER_PORT)}
            />
            <AppInput
              label="Second address (if the PC has one)"
              icon="git-branch-outline"
              value={secondHost}
              onChangeText={setSecondHost}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="numbers-and-punctuation"
              hint="Tried at the same time as the first one."
            />
            <AppButton label="Connect" onPress={() => void testAndContinue()} loading={busy} />
          </View>
        )}
      </AuthLayout>

      <QrPairScreen visible={qrOpen} onCancel={() => setQrOpen(false)} onPaired={handlePaired} />
    </>
  );
}

const styles = StyleSheet.create({
  form: { gap: 16, marginTop: 8 },
});
