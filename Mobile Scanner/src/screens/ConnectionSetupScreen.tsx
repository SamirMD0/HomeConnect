import { useState } from 'react';
import { View } from 'react-native';
import { AuthLayout } from '../ui/AuthLayout';
import { Activity, ChevronUp, Keyboard, Monitor, Network, QrCode } from 'lucide-react-native';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Text } from '../components/ui/text';
import type { CompatibilityState } from '../api/system-api';
import { candidateHosts, findPc } from '../connection/find-pc';
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
      <AuthLayout title="Connect">
        {message && <StatusBanner tone="danger" message={message} />}
        {message && (
          <Button variant="ghost" size="sm" onPress={() => setDetailsOpen((value) => !value)}>
            <Activity size={16} color="#1B2124" />
            <Text>{detailsOpen ? 'Hide details' : 'Details'}</Text>
          </Button>
        )}
        {message && detailsOpen && <ConnectionLogPanel limit={12} />}

        <Button
          size="lg"
          loading={busy && !manualOpen}
          onPress={() => {
            setMessage(null);
            setQrOpen(true);
          }}
        >
          <QrCode size={22} color="#ffffff" />
          <Text>Scan QR</Text>
        </Button>
        <Button variant="outline" onPress={() => setManualOpen((value) => !value)}>
          {manualOpen ? <ChevronUp size={18} color="#1B2124" /> : <Keyboard size={18} color="#1B2124" />}
          <Text>Enter address</Text>
        </Button>

        {manualOpen && (
          <View className="gap-4 pt-1">
            <View className="flex-row gap-3">
              <View className="flex-[3]">
                <Input
                  label="IP"
                  required
                  icon={Monitor}
                  value={host}
                  onChangeText={setHost}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="numbers-and-punctuation"
                  placeholder="192.168.0.103"
                />
              </View>
              <View className="flex-[2]">
                <Input
                  label="Port"
                  required
                  value={port}
                  onChangeText={setPort}
                  keyboardType="number-pad"
                  maxLength={5}
                  placeholder={String(DEFAULT_SCANNER_PORT)}
                />
              </View>
            </View>
            <Input
              label="Second IP (optional)"
              icon={Network}
              value={secondHost}
              onChangeText={setSecondHost}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="numbers-and-punctuation"
            />
            <Button onPress={() => void testAndContinue()} loading={busy}>
              <Text>Connect</Text>
            </Button>
          </View>
        )}
      </AuthLayout>

      <QrPairScreen visible={qrOpen} onCancel={() => setQrOpen(false)} onPaired={handlePaired} />
    </>
  );
}
