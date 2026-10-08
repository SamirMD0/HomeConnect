import { CameraView, useCameraPermissions } from 'expo-camera';
import { useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { AppButton } from '../components/AppButton';
import { StatusBanner } from '../components/StatusBanner';
import { ConnectionSettings } from '../types/scanner.types';
import { parsePairingPayload } from '../utils/pairing-payload';

/**
 * One-shot QR scanner for Scanner Hub's pairing code. Returns the parsed
 * {host, port} on the first well-formed QR, or null when the operator closes.
 *
 * Permission handling mirrors ScannerScreen: ask when the state is still
 * undetermined, show a plain-English hint when the operator declines, and keep
 * the manual-entry fallback in the parent screen rather than failing here.
 */

interface QrPairScreenProps {
  visible: boolean;
  onCancel: () => void;
  onPaired: (settings: ConnectionSettings) => void;
}

export function QrPairScreen({ visible, onCancel, onPaired }: QrPairScreenProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [session, setSession] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consumed, setConsumed] = useState(false);

  if (!visible) return null;

  if (!permission) {
    return (
      <Modal visible transparent={false} onRequestClose={onCancel}>
        <View style={styles.container}>
          <Text style={styles.copy}>Checking camera permission…</Text>
        </View>
      </Modal>
    );
  }

  if (!permission.granted) {
    return (
      <Modal visible transparent={false} onRequestClose={onCancel}>
        <View style={styles.container}>
          <Text style={styles.title}>Camera access needed</Text>
          <Text style={styles.copy}>
            To pair without typing the PC address, allow the camera so this app can read the
            QR shown on the shop PC under Scanner Hub.
          </Text>
          <AppButton label="Grant camera access" onPress={() => { void requestPermission(); }} />
          <AppButton label="Enter address manually" variant="secondary" onPress={onCancel} />
        </View>
      </Modal>
    );
  }

  const handleScan = ({ data }: { data: string }) => {
    if (consumed) return;
    const parsed = parsePairingPayload(data);
    if (!parsed) {
      // Keep the camera running; the operator may have aimed at the wrong code.
      setError('That QR is not a Scanner Hub pairing code. On the PC, open Scanner Hub to find it.');
      return;
    }
    setConsumed(true);
    onPaired(parsed);
  };

  const restart = () => {
    setReady(false);
    setError(null);
    setConsumed(false);
    setSession((value) => value + 1);
  };

  const close = () => {
    setReady(false);
    setError(null);
    setConsumed(false);
    onCancel();
  };

  return (
    <Modal visible animationType="slide" statusBarTranslucent onRequestClose={close}>
      <View style={styles.container}>
        <Text style={styles.title}>Scan Scanner Hub QR</Text>
        <Text style={styles.copy}>
          On the shop PC, open Scanner Hub and turn on Mobile Scanner. Point this phone at the QR code shown there.
        </Text>
        {error ? <StatusBanner tone="warning" message={error} /> : null}
        <View style={styles.cameraFrame} collapsable={false}>
          <CameraView
            key={`qr-${session}`}
            facing="back"
            mode="picture"
            style={styles.camera}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={consumed ? undefined : handleScan}
            onCameraReady={() => setReady(true)}
            onMountError={({ message }) => {
              setReady(false);
              setError(`Camera could not start: ${message}`);
            }}
          />
        </View>
        <Text style={styles.status}>
          {ready ? 'Camera ready — aim at the QR' : 'Starting camera…'}
        </Text>
        <AppButton label="Restart camera" variant="secondary" onPress={restart} />
        <AppButton label="Enter address manually" variant="secondary" onPress={close} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', padding: 20, gap: 14 },
  title: { color: '#ecfdf5', fontSize: 22, fontWeight: '900' },
  copy: { color: '#cbd5e1', fontSize: 14, lineHeight: 20 },
  status: { color: '#a7f3d0', fontSize: 13, textAlign: 'center' },
  cameraFrame: { flex: 1, borderRadius: 18, overflow: 'hidden', backgroundColor: '#020617' },
  camera: { flex: 1 },
});
