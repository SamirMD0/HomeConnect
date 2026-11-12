import { theme } from '../theme';
import { BarcodeType, CameraType, CameraView, useCameraPermissions } from 'expo-camera';
import { useMemo, useRef, useState } from 'react';
import { Modal, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { backendBaseUrl, HcApiError } from '../api/hc-client';
import { clientFrom, scanLookup } from '../api/products-api';
import { AppButton } from '../components/AppButton';
import { AppInput } from '../components/AppInput';
import { ProductResult } from '../components/ProductResult';
import { StatusBanner } from '../components/StatusBanner';
import { ConnectionSettings, ScanResult } from '../types/scanner.types';
import { recentSubmission, RecentSubmission, shouldSuppressDuplicate } from '../utils/duplicate-scan';
import { prepareScanCode } from '../utils/scan-code';

interface ScannerScreenProps {
  connection: ConnectionSettings;
  token: string;
  userDisplayName: string;
  startupMessage: string | null;
  onDone?: () => void;
  onProductDetail?: (id: string) => void;
  onSessionInvalid: () => Promise<void>;
}

type Banner = { tone: 'info' | 'warning' | 'danger'; message: string };

const PRODUCT_BARCODE_TYPES: BarcodeType[] = ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'codabar'];

export function ScannerScreen({
  connection,
  token,
  userDisplayName,
  startupMessage,
  onSessionInvalid,
  onDone,
  onProductDetail,
}: ScannerScreenProps) {
  const client = useMemo(() => clientFrom(connection, token), [connection, token]);
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraVisible, setCameraVisible] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraSession, setCameraSession] = useState(0);
  const [facing, setFacing] = useState<CameraType>('back');
  const [manualCode, setManualCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [banner, setBanner] = useState<Banner | null>(startupMessage ? { tone: 'warning', message: startupMessage } : null);
  const recentRef = useRef<RecentSubmission | null>(null);

  const submitCode = async (rawCode: string) => {
    if (busy) return;
    const prepared = prepareScanCode(rawCode);
    if (!prepared.ok) {
      setBanner({ tone: 'warning', message: prepared.message });
      return;
    }

    const now = Date.now();
    if (shouldSuppressDuplicate(recentRef.current, prepared.code, now)) {
      setBanner({ tone: 'info', message: 'Duplicate scan ignored. Ready again shortly' });
      return;
    }

    recentRef.current = recentSubmission(prepared.code, now);
    setBusy(true);
    setBanner(null);
    setResult(null);
    try {
      const next = await scanLookup(client, prepared.code);
      setResult(next);
      setManualCode('');
    } catch (error) {
      if (error instanceof HcApiError && error.kind === 'UNAUTHORIZED') {
        await onSessionInvalid();
        return;
      }
      if (error instanceof HcApiError && error.kind === 'RATE_LIMITED') {
        setBanner({ tone: 'warning', message: 'Scans are arriving too quickly. Wait a moment and try again' });
      } else if (error instanceof HcApiError && error.kind === 'NETWORK') {
        setBanner({ tone: 'danger', message: error.message });
      } else {
        setBanner({ tone: 'danger', message: 'The server could not process this scan. Try again.' });
      }
    } finally {
      setBusy(false);
    }
  };

  const launchNativeScanner = async () => {
    setCameraVisible(false);
    setCameraReady(false);
    let scanned = false;
    const subscription = CameraView.onModernBarcodeScanned(({ data }) => {
      if (scanned) return;
      scanned = true;
      subscription.remove();
      void submitCode(data);
    });

    try {
      await CameraView.launchScanner({ barcodeTypes: PRODUCT_BARCODE_TYPES });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The native barcode scanner could not start.';
      setBanner({ tone: 'danger', message: `Camera could not start: ${message}` });
    } finally {
      subscription.remove();
    }
  };

  const openCamera = async () => {
    if (permission?.granted) {
      setCameraReady(false);
      setCameraSession((current) => current + 1);
      setCameraVisible(true);
      return;
    }
    const next = await requestPermission();
    setCameraReady(false);
    setCameraSession((current) => current + 1);
    setCameraVisible(next.granted);
    if (!next.granted) {
      setBanner({ tone: 'warning', message: 'Camera access was not granted. Manual entry remains available.' });
    }
  };

  const restartCamera = () => {
    setCameraReady(false);
    setCameraSession((current) => current + 1);
  };

  const switchCamera = () => {
    setCameraReady(false);
    setFacing((current) => current === 'back' ? 'front' : 'back');
    setCameraSession((current) => current + 1);
  };

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>
            Signed in as {userDisplayName}
          </Text>
          <Text style={styles.backendUrl}>{backendBaseUrl(connection)}</Text>
        </View>
        <View style={styles.connectedDot} />
      </View>

      <AppButton label="Open camera" onPress={() => void openCamera()} />
      {onDone && <AppButton label="Done" variant="secondary" onPress={onDone} />}
      {banner && <StatusBanner tone={banner.tone} message={banner.message} />}

      <Modal
        animationType="slide"
        onRequestClose={() => { setCameraVisible(false); setCameraReady(false); }}
        statusBarTranslucent
        visible={cameraVisible && Boolean(permission?.granted)}
      >
        <View style={styles.cameraModal}>
          <Text style={styles.cameraModalTitle}>Scan a product barcode</Text>
          <View collapsable={false} style={styles.cameraModalPreview}>
            <CameraView
              key={`${cameraSession}-${facing}`}
              facing={facing}
              mode="picture"
              ratio="4:3"
              style={styles.camera}
              barcodeScannerSettings={{ barcodeTypes: PRODUCT_BARCODE_TYPES }}
              onBarcodeScanned={busy || result ? undefined : ({ data }) => {
                setCameraVisible(false);
                setCameraReady(false);
                void submitCode(data);
              }}
              onCameraReady={() => setCameraReady(true)}
              onMountError={({ message }) => {
                setCameraReady(false);
                setBanner({ tone: 'danger', message: `Camera could not start: ${message}` });
              }}
            />
          </View>
          <Text style={styles.cameraModalStatus}>
            {cameraReady ? 'Camera ready — point it at a barcode' : 'Starting camera…'}
          </Text>
          {Platform.OS === 'android' && CameraView.isModernBarcodeScannerAvailable && (
            <AppButton label="Use system scanner" onPress={() => void launchNativeScanner()} variant="secondary" />
          )}
          <AppButton label="Restart camera" onPress={restartCamera} variant="secondary" />
          <AppButton label="Switch camera" onPress={switchCamera} variant="secondary" />
          <AppButton
            label="Close camera"
            onPress={() => { setCameraVisible(false); setCameraReady(false); }}
            variant="secondary"
          />
        </View>
      </Modal>

      <View style={styles.dividerRow}>
        <View style={styles.divider} />
        <Text style={styles.or}>OR ENTER MANUALLY</Text>
        <View style={styles.divider} />
      </View>

      <View style={styles.manual}>
        <AppInput
          label="Barcode or SKU"
          value={manualCode}
          onChangeText={setManualCode}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={64}
          returnKeyType="send"
          onSubmitEditing={() => void submitCode(manualCode)}
          placeholder="Scan or type a code"
        />
        <AppButton label="Look up product" onPress={() => void submitCode(manualCode)} loading={busy} />
      </View>

      {result && (
        <View style={styles.resultSection}>
          <ProductResult result={result} />
          {result.product && onProductDetail && <AppButton label="View product details" onPress={() => onProductDetail(result.product!.id)} />}
          <AppButton
            label="Scan another"
            onPress={() => { setResult(null); setBanner(null); }}
            variant="secondary"
          />
        </View>
      )}

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 18, gap: 18, backgroundColor: theme.colors.background, flexGrow: 1 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  headerText: { flex: 1, gap: 2 },
  eyebrow: { color: theme.colors.brand, fontSize: 14, fontWeight: '700' },
  backendUrl: { color: theme.colors.muted, fontSize: 13 },
  connectedDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: theme.colors.success, marginTop: 8 },
  camera: { flex: 1 },
  cameraModal: { flex: 1, backgroundColor: theme.colors.text, padding: 18, paddingTop: 48, gap: 12 },
  cameraModalTitle: { color: theme.colors.surface, fontSize: 20, fontWeight: '900', textAlign: 'center' },
  cameraModalPreview: { flex: 1, minHeight: 320, overflow: 'hidden', backgroundColor: theme.colors.text },
  cameraModalStatus: { color: theme.colors.successSoft, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  divider: { height: 1, backgroundColor: theme.colors.border, flex: 1 },
  or: { color: theme.colors.muted, fontSize: 10, fontWeight: '800' },
  manual: { gap: 12 },
  resultSection: { gap: 10 },
});
