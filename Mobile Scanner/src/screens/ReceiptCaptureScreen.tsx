import { CameraType, CameraView, useCameraPermissions } from 'expo-camera';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { HcApiError } from '../api/hc-client';
import { clientFrom } from '../api/products-api';
import { listSupplierPurchases, listSuppliers, SupplierPurchaseSummary, SupplierSummary } from '../api/suppliers-api';
import { AppButton } from '../components/AppButton';
import { AppInput } from '../components/AppInput';
import { StatusBanner } from '../components/StatusBanner';
import { createReceiptQueue, QueuedReceipt, ReceiptQueue } from '../services/receipt-queue';
import { ConnectionSettings } from '../types/scanner.types';

interface ReceiptCaptureScreenProps {
  connection: ConnectionSettings;
  token: string;
  onDone: () => void;
  onSessionInvalid: () => Promise<void>;
}

type Banner = { tone: 'info' | 'warning' | 'danger'; message: string };
type Step = 'PICK_SUPPLIER' | 'PICK_PURCHASE' | 'CAPTURE' | 'UPLOADING' | 'DONE';

/**
 * Three-step modal flow:
 *   1. Pick a supplier (searchable list).
 *   2. Pick a recent purchase under that supplier.
 *   3. Take a photo, confirm, upload.
 */
export function ReceiptCaptureScreen({ connection, token, onDone, onSessionInvalid }: ReceiptCaptureScreenProps) {
  const client = useMemo(() => clientFrom(connection, token), [connection, token]);
  const queueRef = useRef<ReceiptQueue | null>(null);
  if (!queueRef.current) queueRef.current = createReceiptQueue();
  const queue = queueRef.current;
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [step, setStep] = useState<Step>('PICK_SUPPLIER');
  const [banner, setBanner] = useState<Banner | null>(null);

  const refreshPendingCount = useCallback(async () => {
    try {
      const items = await queue.listPending();
      setPendingCount(items.length);
    } catch {
      // A corrupt or missing queue is treated as empty; the queue module
      // tolerates it on its own.
      setPendingCount(0);
    }
  }, [queue]);

  useEffect(() => {
    void refreshPendingCount();
  }, [refreshPendingCount]);

  const syncQueue = useCallback(async () => {
    setSyncing(true);
    try {
      const result = await queue.flush(client);
      await refreshPendingCount();
      if (result.attempted === 0) {
        setBanner({ tone: 'info', message: 'Nothing pending.' });
      } else if (result.failed === 0) {
        setBanner({ tone: 'info', message: `Uploaded ${result.synced} receipt(s).` });
      } else {
        setBanner({
          tone: 'warning',
          message: `Uploaded ${result.synced}. ${result.failed} failed and stayed in the queue.`,
        });
      }
    } finally {
      setSyncing(false);
    }
  }, [client, queue, refreshPendingCount]);

  const [suppliers, setSuppliers] = useState<SupplierSummary[] | null>(null);
  const [supplierFilter, setSupplierFilter] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState<SupplierSummary | null>(null);

  const [purchases, setPurchases] = useState<SupplierPurchaseSummary[] | null>(null);
  const [selectedPurchase, setSelectedPurchase] = useState<SupplierPurchaseSummary | null>(null);

  const [permission, requestPermission] = useCameraPermissions();
  const [cameraReady, setCameraReady] = useState(false);
  const [facing, setFacing] = useState<CameraType>('back');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const cameraRef = useRef<CameraView | null>(null);

  // --- Step 1: suppliers ------------------------------------------------------
  useEffect(() => {
    if (step !== 'PICK_SUPPLIER' || suppliers) return;
    let active = true;
    void (async () => {
      try {
        const rows = await listSuppliers(client);
        if (active) setSuppliers(rows);
      } catch (error) {
        if (!active) return;
        if (error instanceof HcApiError && error.kind === 'UNAUTHORIZED') await onSessionInvalid();
        else setBanner({ tone: 'danger', message: 'Could not load the supplier list.' });
      }
    })();
    return () => { active = false; };
  }, [client, onSessionInvalid, step, suppliers]);

  // --- Step 2: purchases ------------------------------------------------------
  useEffect(() => {
    if (step !== 'PICK_PURCHASE' || !selectedSupplier || purchases) return;
    let active = true;
    void (async () => {
      try {
        const rows = await listSupplierPurchases(client, selectedSupplier.id);
        if (active) setPurchases(rows);
      } catch (error) {
        if (!active) return;
        if (error instanceof HcApiError && error.kind === 'UNAUTHORIZED') await onSessionInvalid();
        else setBanner({ tone: 'danger', message: 'Could not load this supplier’s purchases.' });
      }
    })();
    return () => { active = false; };
  }, [client, onSessionInvalid, purchases, selectedSupplier, step]);

  const filteredSuppliers = useMemo(() => {
    const q = supplierFilter.trim().toLowerCase();
    if (!q || !suppliers) return suppliers ?? [];
    return suppliers.filter((row) => row.name.toLowerCase().includes(q) || (row.phone ?? '').includes(q));
  }, [supplierFilter, suppliers]);

  // --- Step 3: capture + upload ----------------------------------------------
  const openCamera = async () => {
    if (permission?.granted) {
      setStep('CAPTURE');
      return;
    }
    const next = await requestPermission();
    if (next.granted) setStep('CAPTURE');
    else setBanner({ tone: 'warning', message: 'Camera access was not granted.' });
  };

  const takePhoto = async () => {
    if (!cameraRef.current || !cameraReady) return;
    try {
      const result = await cameraRef.current.takePictureAsync({ quality: 0.85, skipProcessing: true });
      if (result?.uri) setPhotoUri(result.uri);
    } catch {
      setBanner({ tone: 'danger', message: 'Could not capture the photo. Try again.' });
    }
  };

  const uploadPhoto = async () => {
    if (!selectedPurchase || !photoUri) return;
    setStep('UPLOADING');
    setBanner(null);

    // Always enqueue first: this gives us a durable local copy that survives
    // app restart and Expo cache eviction. Then flush immediately so the
    // common case (online) still feels like one tap. Any failure leaves the
    // entry in the queue; the operator can retry via Sync.
    let enqueued: QueuedReceipt | null = null;
    try {
      enqueued = await queue.enqueue({
        supplierPurchaseId: selectedPurchase.id,
        supplierPurchaseLabel: `${selectedSupplier?.name ?? ''} · Ref # ${selectedPurchase.referenceNumber ?? selectedPurchase.id.slice(0, 8)}`,
        sourceUri: photoUri,
        mime: 'image/jpeg',
      });
    } catch (error) {
      setBanner({ tone: 'danger', message: error instanceof Error ? error.message : 'Could not save photo locally.' });
      setStep('CAPTURE');
      return;
    }

    try {
      const result = await queue.flush(client);
      await refreshPendingCount();
      if (result.synced > 0 && result.failed === 0) {
        setStep('DONE');
      } else {
        setBanner({
          tone: 'warning',
          message: 'Saved locally. Will retry upload when the server is reachable.',
        });
        setStep('DONE');
      }
    } catch (error) {
      await refreshPendingCount();
      if (error instanceof HcApiError && error.kind === 'UNAUTHORIZED') {
        await onSessionInvalid();
        return;
      }
      setBanner({
        tone: 'warning',
        message: 'Saved locally. Will retry upload when the server is reachable.',
      });
      setStep('DONE');
    }
    void enqueued; // referenced for the possible future UI badge
  };

  const resetAfterUpload = () => {
    setStep('PICK_SUPPLIER');
    setSelectedSupplier(null);
    setSelectedPurchase(null);
    setPurchases(null);
    setPhotoUri(null);
    setBanner(null);
    onDone();
  };

  // --- Render -----------------------------------------------------------------
  return (
    <View style={styles.container}>
      {pendingCount > 0 && (
        <View style={styles.pendingBar}>
          <Text style={styles.pendingText}>
            {pendingCount} receipt{pendingCount === 1 ? '' : 's'} waiting to upload
          </Text>
          <AppButton
            label={syncing ? 'Syncing…' : 'Sync now'}
            onPress={() => void syncQueue()}
            disabled={syncing}
            loading={syncing}
          />
        </View>
      )}

      {banner && <StatusBanner tone={banner.tone} message={banner.message} />}

      {step === 'PICK_SUPPLIER' && (
        <>
          <View style={styles.header}>
            <Text style={styles.title}>Step 1 — Choose supplier</Text>
          </View>
          <AppInput label="Search supplier" value={supplierFilter} onChangeText={setSupplierFilter} placeholder="Supplier name or phone" />
          {!suppliers ? (
            <ActivityIndicator size="large" color="#047857" style={styles.loader} />
          ) : (
            <FlatList
              data={filteredSuppliers}
              keyExtractor={(row) => row.id}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => { setSelectedSupplier(item); setStep('PICK_PURCHASE'); }}
                  style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                >
                  <Text style={styles.rowTitle}>{item.name}</Text>
                  {item.phone ? <Text style={styles.rowMeta}>{item.phone}</Text> : null}
                </Pressable>
              )}
              ListEmptyComponent={<Text style={styles.empty}>No suppliers match.</Text>}
            />
          )}
          <AppButton label="Cancel" variant="secondary" onPress={onDone} />
        </>
      )}

      {step === 'PICK_PURCHASE' && selectedSupplier && (
        <>
          <View style={styles.header}>
            <Text style={styles.title}>Step 2 — Choose purchase</Text>
            <Text style={styles.subtitle}>{selectedSupplier.name} · Step 2</Text>
          </View>
          {!purchases ? (
            <ActivityIndicator size="large" color="#047857" style={styles.loader} />
          ) : purchases.length === 0 ? (
            <Text style={styles.empty}>No purchases recorded yet for this supplier.</Text>
          ) : (
            <FlatList
              data={purchases}
              keyExtractor={(row) => row.id}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => { setSelectedPurchase(item); void openCamera(); }}
                  style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                >
                  <Text style={styles.rowTitle}>Ref # {item.referenceNumber || item.id.slice(0, 8)}</Text>
                  <Text style={styles.rowMeta}>{new Date(item.receivedOn).toLocaleDateString('en-GB')} · {item.status}</Text>
                </Pressable>
              )}
            />
          )}
          <AppButton label="Back to suppliers" variant="secondary" onPress={() => { setStep('PICK_SUPPLIER'); setSelectedSupplier(null); setPurchases(null); }} />
        </>
      )}

      <Modal visible={step === 'CAPTURE'} animationType="slide" statusBarTranslucent onRequestClose={() => setStep('PICK_PURCHASE')}>
        <View style={styles.cameraModal}>
          <Text style={styles.cameraTitle}>Step 3 — Capture receipt</Text>
          <View style={styles.cameraPreviewBox} collapsable={false}>
            {photoUri ? (
              <Image source={{ uri: photoUri }} resizeMode="contain" style={styles.cameraPreview} />
            ) : (
              <CameraView
                ref={cameraRef}
                facing={facing}
                mode="picture"
                ratio="4:3"
                style={styles.cameraPreview}
                onCameraReady={() => setCameraReady(true)}
                onMountError={({ message }) => setBanner({ tone: 'danger', message: `Camera could not start: ${message}` })}
              />
            )}
          </View>

          <ScrollView contentContainerStyle={styles.cameraActions}>
            {!photoUri ? (
              <>
                <AppButton label="Take photo" onPress={() => void takePhoto()} disabled={!cameraReady} />
                <AppButton label="Switch camera" variant="secondary" onPress={() => setFacing((c) => c === 'back' ? 'front' : 'back')} />
              </>
            ) : (
              <>
                <AppButton label="Upload" onPress={() => void uploadPhoto()} />
                <AppButton label="Retake" variant="secondary" onPress={() => setPhotoUri(null)} />
              </>
            )}
            <AppButton label="Cancel" variant="secondary" onPress={() => { setPhotoUri(null); setStep('PICK_PURCHASE'); }} />
          </ScrollView>
        </View>
      </Modal>

      {step === 'UPLOADING' && (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#047857" />
          <Text style={styles.loader}>Uploading…</Text>
        </View>
      )}

      {step === 'DONE' && (
        <View style={styles.center}>
          <Text style={styles.title}>Receipt uploaded ✓</Text>
          <AppButton label="Attach another" onPress={() => { setPhotoUri(null); setSelectedPurchase(null); setPurchases(null); setStep('PICK_PURCHASE'); }} />
          <AppButton label="Done" variant="secondary" onPress={resetAfterUpload} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12 },
  header: { gap: 4 },
  title: { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  subtitle: { color: '#475569' },
  loader: { textAlign: 'center', marginTop: 24, color: '#475569' },
  empty: { color: '#64748b', textAlign: 'center', paddingVertical: 24 },
  row: { paddingVertical: 12, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  rowPressed: { backgroundColor: '#f1f5f9' },
  rowTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  rowMeta: { fontSize: 12, color: '#64748b', marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  cameraModal: { flex: 1, backgroundColor: '#0f172a', padding: 16, gap: 12 },
  cameraTitle: { color: '#ffffff', fontSize: 18, fontWeight: '800' },
  cameraPreviewBox: { flex: 1, backgroundColor: '#000', borderRadius: 12, overflow: 'hidden' },
  cameraPreview: { flex: 1 },
  cameraActions: { gap: 10, paddingBottom: 24 },
  pendingBar: {
    gap: 8,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#fef3c7',
    borderWidth: 1,
    borderColor: '#f59e0b',
  },
  pendingText: { color: '#78350f', fontWeight: '700' },
});
