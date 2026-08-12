import { BarcodeType, CameraType, CameraView, useCameraPermissions } from 'expo-camera';
import { useRef, useState } from 'react';
import { Modal, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { scannerApi, ScannerApiError } from '../api/scanner-api';
import { AppButton } from '../components/AppButton';
import { AppInput } from '../components/AppInput';
import { ProductResult } from '../components/ProductResult';
import { StatusBanner } from '../components/StatusBanner';
import { ConnectionSettings, ScanResult } from '../types/scanner.types';
import { recentSubmission, RecentSubmission, shouldSuppressDuplicate } from '../utils/duplicate-scan';
import { prepareScanCode } from '../utils/scan-code';
import { scannerBaseUrl } from '../utils/scanner-url';

interface ScannerScreenProps {
  connection: ConnectionSettings;
  token: string;
  startupMessage: string | null;
  onSessionInvalid: () => Promise<void>;
  onChangeConnection: () => Promise<void>;
  onPairAgain: () => Promise<void>;
}

type Banner = { tone: 'info' | 'warning' | 'danger'; message: string };

const PRODUCT_BARCODE_TYPES: BarcodeType[] = ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'codabar'];

export function ScannerScreen({
  connection,
  token,
  startupMessage,
  onSessionInvalid,
  onChangeConnection,
  onPairAgain,
}: ScannerScreenProps) {
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
      setBanner({ tone: 'info', message: 'Duplicate scan ignored. Ready again shortly / تم تجاهل المسح المكرر' });
      return;
    }

    recentRef.current = recentSubmission(prepared.code, now);
    setBusy(true);
    setBanner(null);
    setResult(null);
    try {
      const next = await scannerApi.scan(connection, token, prepared.code);
      setResult(next);
      setManualCode('');
    } catch (error) {
      if (error instanceof ScannerApiError && error.kind === 'UNAUTHORIZED') {
        await onSessionInvalid();
        return;
      }
      if (error instanceof ScannerApiError && error.kind === 'RATE_LIMITED') {
        setBanner({ tone: 'warning', message: 'Scans are arriving too quickly. Wait a moment and try again / تمهل قليلاً' });
      } else if (error instanceof ScannerApiError && error.kind === 'NETWORK') {
        setBanner({ tone: 'danger', message: error.message });
      } else {
        setBanner({ tone: 'danger', message: 'The PC could not process this scan. Try again.' });
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
          <Text style={styles.eyebrow}>CONNECTED TO {scannerBaseUrl(connection)}</Text>
          <Text style={styles.title}>Scan a product</Text>
          <Text style={styles.arabic}>مسح منتج</Text>
        </View>
        <View style={styles.connectedDot} />
      </View>

      {banner && <StatusBanner tone={banner.tone} message={banner.message} />}

      <View style={styles.cameraSection}>
        <View style={styles.cameraPlaceholder}>
          <Text style={styles.cameraTitle}>Use the phone camera / استخدم الكاميرا</Text>
          <Text style={styles.cameraCopy}>Point the camera at a product barcode. The code is matched by the PC.</Text>
          <AppButton label="Open camera / فتح الكاميرا" onPress={() => void openCamera()} />
          {Platform.OS === 'android' && CameraView.isModernBarcodeScannerAvailable && (
            <AppButton label="Use system scanner / استخدام ماسح النظام" onPress={() => void launchNativeScanner()} variant="secondary" />
          )}
        </View>
      </View>

      <Modal
        animationType="slide"
        onRequestClose={() => { setCameraVisible(false); setCameraReady(false); }}
        statusBarTranslucent
        visible={cameraVisible && Boolean(permission?.granted)}
      >
        <View style={styles.cameraModal}>
          <Text style={styles.cameraModalTitle}>Scan a product barcode / مسح باركود المنتج</Text>
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
            {cameraReady ? 'Camera ready — point it at a barcode / الكاميرا جاهزة' : 'Starting camera… / جارٍ تشغيل الكاميرا'}
          </Text>
          <AppButton label="Restart camera / إعادة تشغيل الكاميرا" onPress={restartCamera} variant="secondary" />
          <AppButton label="Switch camera / تبديل الكاميرا" onPress={switchCamera} variant="secondary" />
          <AppButton
            label="Close camera / إغلاق الكاميرا"
            onPress={() => { setCameraVisible(false); setCameraReady(false); }}
            variant="secondary"
          />
        </View>
      </Modal>

      <View style={styles.dividerRow}>
        <View style={styles.divider} />
        <Text style={styles.or}>OR ENTER MANUALLY / أو أدخل يدوياً</Text>
        <View style={styles.divider} />
      </View>

      <View style={styles.manual}>
        <AppInput
          label="Barcode or SKU / الباركود أو رمز المنتج"
          value={manualCode}
          onChangeText={setManualCode}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={64}
          returnKeyType="send"
          onSubmitEditing={() => void submitCode(manualCode)}
          placeholder="Scan or type a code"
        />
        <AppButton label="Look up product / البحث عن المنتج" onPress={() => void submitCode(manualCode)} loading={busy} />
      </View>

      {result && (
        <View style={styles.resultSection}>
          <ProductResult result={result} />
          <AppButton
            label="Scan another / مسح منتج آخر"
            onPress={() => { setResult(null); setBanner(null); }}
            variant="secondary"
          />
        </View>
      )}

      <View style={styles.settings}>
        <AppButton label="Pair again / إعادة الربط" onPress={() => void onPairAgain()} variant="secondary" />
        <AppButton label="Change PC / تغيير الكمبيوتر" onPress={() => void onChangeConnection()} variant="secondary" />
      </View>

      <StatusBanner message="Read-only scanner: no prices, costs, stock, customers, or payments are stored or displayed." />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 18, gap: 18, backgroundColor: '#f8fafc', flexGrow: 1 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  headerText: { flex: 1, gap: 2 },
  eyebrow: { color: '#047857', fontSize: 10, fontWeight: '800' },
  title: { color: '#0f172a', fontSize: 29, fontWeight: '900' },
  arabic: { color: '#475569', fontSize: 20, fontWeight: '700' },
  connectedDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#10b981', marginTop: 8 },
  cameraSection: { gap: 10 },
  camera: { flex: 1 },
  cameraModal: { flex: 1, backgroundColor: '#0f172a', padding: 18, paddingTop: 48, gap: 12 },
  cameraModalTitle: { color: '#ffffff', fontSize: 20, fontWeight: '900', textAlign: 'center' },
  cameraModalPreview: { flex: 1, minHeight: 320, overflow: 'hidden', backgroundColor: '#020617' },
  cameraModalStatus: { color: '#d1fae5', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  cameraPlaceholder: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 18, backgroundColor: '#ffffff', padding: 20, gap: 12 },
  cameraTitle: { color: '#0f172a', fontSize: 19, fontWeight: '800' },
  cameraCopy: { color: '#64748b', fontSize: 14, lineHeight: 20 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  divider: { height: 1, backgroundColor: '#cbd5e1', flex: 1 },
  or: { color: '#64748b', fontSize: 10, fontWeight: '800' },
  manual: { gap: 12 },
  resultSection: { gap: 10 },
  settings: { gap: 9, marginTop: 4 },
});
