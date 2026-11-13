import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeType } from 'expo-camera';
import { AppButton } from '../components/AppButton';
import { AppInput } from '../components/AppInput';
import { theme } from '../theme';
import { recentSubmission, shouldSuppressDuplicate, type RecentSubmission } from '../utils/duplicate-scan';
import { prepareScanCode } from '../utils/scan-code';

const PRODUCT_BARCODE_TYPES: BarcodeType[] = ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'codabar'];

/**
 * Inline, continuous scanner for counting, receiving and price checks. The
 * camera stays open between scans; the same code is ignored for 2.5 s so one
 * barcode held in front of the lens counts once. Manual entry is always there
 * for damaged labels or when the camera is unavailable.
 */
export function ScanPanel({
  onCode,
  disabled = false,
  hint,
}: {
  onCode: (code: string) => Promise<void>;
  disabled?: boolean;
  hint?: string;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraOn, setCameraOn] = useState(false),
    [busy, setBusy] = useState(false),
    [manual, setManual] = useState(''),
    [message, setMessage] = useState('');
  const recent = useRef<RecentSubmission | null>(null),
    inFlight = useRef(false);

  const submit = async (raw: string) => {
    const prepared = prepareScanCode(raw);
    if (!prepared.ok) {
      setMessage(prepared.message);
      return;
    }
    const now = Date.now();
    if (inFlight.current || shouldSuppressDuplicate(recent.current, prepared.code, now)) return;
    recent.current = recentSubmission(prepared.code, now);
    inFlight.current = true;
    setBusy(true);
    setMessage('');
    try {
      await onCode(prepared.code);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const openCamera = async () => {
    const granted = permission?.granted || (await requestPermission()).granted;
    if (!granted) {
      setMessage('Camera access was not granted. Type the barcode or SKU instead.');
      return;
    }
    setCameraOn(true);
  };

  return (
    <View style={styles.panel}>
      {cameraOn ? (
        <View collapsable={false} style={styles.preview}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: PRODUCT_BARCODE_TYPES }}
            onBarcodeScanned={disabled ? undefined : ({ data }) => void submit(data)}
            onMountError={({ message: error }) => {
              setCameraOn(false);
              setMessage(`Camera could not start: ${error}`);
            }}
          />
        </View>
      ) : null}
      {busy || hint ? <Text style={styles.hint}>{busy ? 'Looking up…' : hint}</Text> : null}
      <AppButton
        label={cameraOn ? 'Close camera' : 'Open camera'}
        icon={cameraOn ? 'close-outline' : 'camera-outline'}
        variant="secondary"
        onPress={() => (cameraOn ? setCameraOn(false) : void openCamera())}
      />
      <View style={styles.manualRow}>
        <View style={{ flex: 1 }}>
          <AppInput
            label="Barcode or SKU"
            value={manual}
            onChangeText={setManual}
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={() => {
              const code = manual;
              setManual('');
              recent.current = null;
              void submit(code);
            }}
          />
        </View>
      </View>
      <AppButton
        label="Add code"
        icon="add-outline"
        variant="secondary"
        disabled={disabled || busy || !manual.trim()}
        onPress={() => {
          const code = manual;
          setManual('');
          recent.current = null;
          void submit(code);
        }}
      />
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: 10,
    padding: 12,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  preview: { height: 220, borderRadius: theme.radius.md, overflow: 'hidden', backgroundColor: '#000' },
  hint: { color: theme.colors.muted, fontSize: 14 },
  manualRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  message: { color: theme.colors.danger, fontSize: 14 },
});
