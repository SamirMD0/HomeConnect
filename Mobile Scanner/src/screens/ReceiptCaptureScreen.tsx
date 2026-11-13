import { theme } from '../theme';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { HcApiError } from '../api/hc-client';
import { clientFrom } from '../api/products-api';
import {
  listSupplierPurchases,
  listSuppliers,
  SupplierPurchaseSummary,
  SupplierSummary,
} from '../api/suppliers-api';
import { selectedBranchHeaders } from '../branches/branch-selection';
import { AppButton } from '../components/AppButton';
import { AppInput } from '../components/AppInput';
import { StatusBanner } from '../components/StatusBanner';
import { receiptQueue, uploadFailureMessage } from '../services/receipt-queue';
import { prepareReceiptPhoto } from '../services/receipt-photo';
import { ConnectionSettings } from '../types/scanner.types';

interface Props {
  connection: ConnectionSettings;
  token: string;
  onDone: () => void;
  onSessionInvalid: () => Promise<void>;
}
export function ReceiptCaptureScreen({ connection, token, onDone, onSessionInvalid }: Props) {
  const client = useMemo(() => clientFrom(connection, token), [connection, token]);
  const [step, setStep] = useState<'supplier' | 'purchase' | 'pages' | 'done'>('supplier');
  const [suppliers, setSuppliers] = useState<SupplierSummary[]>([]);
  const [supplier, setSupplier] = useState<SupplierSummary | null>(null);
  const [purchases, setPurchases] = useState<SupplierPurchaseSummary[]>([]);
  const [purchase, setPurchase] = useState<SupplierPurchaseSummary | null>(null);
  const [filter, setFilter] = useState('');
  const [pages, setPages] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [camera, setCamera] = useState(false);
  const [ready, setReady] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const action = useRef(false);
  async function failure(error: unknown) {
    setMessage(error instanceof Error ? error.message : 'Could not finish this action.');
    if (error instanceof HcApiError && error.kind === 'UNAUTHORIZED') await onSessionInvalid();
  }
  useEffect(() => {
    let active = true;
    void listSuppliers(client)
      .then((rows) => {
        if (active) setSuppliers(rows);
      })
      .catch((error) => {
        if (active) setMessage(error.message);
      });
    return () => {
      active = false;
    };
  }, [client]);
  useEffect(() => {
    if (!supplier) return;
    let active = true;
    setBusy(true);
    void listSupplierPurchases(client, supplier.id)
      .then((rows) => {
        if (active) setPurchases(rows);
      })
      .catch((error) => {
        if (active) setMessage(error.message);
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [client, supplier]);
  const run = async (work: () => Promise<void>) => {
    if (action.current) return;
    action.current = true;
    setBusy(true);
    setMessage(null);
    try {
      await work();
    } catch (error) {
      await failure(error);
    } finally {
      action.current = false;
      setBusy(false);
    }
  };
  const take = () =>
    run(async () => {
      const photo = await cameraRef.current?.takePictureAsync({ skipProcessing: false });
      if (!photo) throw new Error('Camera did not return a photo. Please try again.');
      const uri = await prepareReceiptPhoto(photo);
      setPages((items) => [...items, uri]);
      setCamera(false);
    });
  const gallery = () =>
    run(async () => {
      const access = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!access.granted)
        throw new Error('Allow photo access to choose bill pages from the gallery.');
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        quality: 1,
      });
      if (result.canceled) return;
      const added: string[] = [];
      for (const photo of result.assets) added.push(await prepareReceiptPhoto(photo));
      setPages((items) => [...items, ...added]);
    });
  const upload = () =>
    run(async () => {
      if (!supplier || !pages.length) return;
      const queue = receiptQueue();
      const ids: string[] = [];
      // Remove each saved page from this draft immediately, so retrying a local
      // save failure cannot enqueue the already durable pages twice.
      for (const uri of pages) {
        const entry = await queue.enqueue({
          supplierId: supplier.id,
          supplierPurchaseId: purchase?.supplierReceivingId ?? null,
          supplierPurchaseLabel: `${supplier.name} · ${purchase?.referenceNumber ?? 'No purchase yet'}`,
          branchId: selectedBranchHeaders()['X-Branch-Scope'],
          serverUrl: client.baseUrl,
          note,
          sourceUri: uri,
          mime: 'image/jpeg',
        });
        ids.push(entry.id);
        setPages((items) => items.filter((page) => page !== uri));
      }
      await queue.flush(client);
      // A foreground flush may have started before these pages were enqueued.
      // Only drain pages that have never been attempted, leaving real failures
      // for the next sync or explicit Retry action.
      for (const entry of await queue.listPending()) {
        if (ids.includes(entry.id) && entry.status === 'pending')
          await queue.flush(client, undefined, entry.id);
      }
      const remaining = (await queue.listPending()).filter((entry) => ids.includes(entry.id));
      setMessage(
        remaining.length
          ? remaining.map(uploadFailureMessage).join(' ')
          : `Uploaded ${ids.length} bill page(s).`
      );
      setStep('done');
    });
  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Supplier bill</Text>
        {message && <StatusBanner tone={step === 'done' ? 'info' : 'warning'} message={message} />}
        {busy && <ActivityIndicator accessibilityLabel="Working" />}
        {step === 'supplier' && (
          <>
            <AppInput
              label="Choose supplier"
              placeholder="Supplier name or phone"
              value={filter}
              onChangeText={setFilter}
            />
            {suppliers
              .filter((item) =>
                `${item.name} ${item.phone}`.toLowerCase().includes(filter.toLowerCase())
              )
              .map((item) => (
                <AppButton
                  key={item.id}
                  label={item.name}
                  variant="secondary"
                  onPress={() => {
                    setSupplier(item);
                    setStep('purchase');
                    setMessage(null);
                  }}
                />
              ))}
          </>
        )}
        {step === 'purchase' && (
          <>
            <Text style={styles.subtitle}>{supplier?.name} — choose a purchase (optional)</Text>
            <AppButton
              label="No purchase yet"
              onPress={() => {
                setPurchase(null);
                setStep('pages');
              }}
            />
            {purchases.map((item) => (
              <View key={item.id} style={styles.card}>
                <AppButton
                  label={`Ref # ${item.referenceNumber ?? item.id.slice(0, 8)}`}
                  disabled={!item.supplierReceivingId}
                  variant="secondary"
                  onPress={() => {
                    setPurchase(item);
                    setStep('pages');
                  }}
                />
                {!item.supplierReceivingId && (
                  <Text>This purchase has no receiving. Save with “No purchase yet”.</Text>
                )}
              </View>
            ))}
            <AppButton
              label="Back to suppliers"
              variant="secondary"
              onPress={() => setStep('supplier')}
            />
          </>
        )}
        {step === 'pages' && (
          <>
            <Text style={styles.subtitle}>
              {supplier?.name} · {purchase?.referenceNumber ?? 'No purchase yet'}
            </Text>
            <Text>{pages.length} page(s) ready</Text>
            {pages.map((uri, index) => (
              <View key={uri} style={styles.card}>
                <Image
                  source={{ uri }}
                  style={styles.thumbnail}
                  accessibilityLabel={`Bill page ${index + 1}`}
                />
                <AppButton
                  label={`Remove page ${index + 1}`}
                  variant="secondary"
                  disabled={busy}
                  onPress={() => setPages((items) => items.filter((item) => item !== uri))}
                />
              </View>
            ))}
            <AppButton
              label="Take photo"
              disabled={busy}
              onPress={() =>
                void run(async () => {
                  if (!permission?.granted && !(await requestPermission()).granted)
                    throw new Error('Allow camera access, or choose from gallery.');
                  setReady(false);
                  setCamera(true);
                })
              }
            />
            <AppButton
              label="Choose from gallery"
              variant="secondary"
              disabled={busy}
              onPress={() => void gallery()}
            />
            <AppInput
              label="Note (optional)"
              value={note}
              onChangeText={setNote}
              maxLength={2000}
              multiline
              editable={!busy}
            />
            <AppButton
              label={`Upload ${pages.length} page(s)`}
              disabled={!pages.length}
              loading={busy}
              onPress={() => void upload()}
            />
            <AppButton
              label="Change purchase"
              variant="secondary"
              disabled={busy}
              onPress={() => setStep('purchase')}
            />
          </>
        )}
        <AppButton
          label={step === 'done' ? 'Done' : 'Cancel'}
          variant="secondary"
          disabled={busy}
          onPress={onDone}
        />
      </ScrollView>
      <Modal
        visible={camera}
        animationType="slide"
        onRequestClose={() => {
          if (!busy) setCamera(false);
        }}
      >
        <SafeAreaView style={styles.screen}>
          <CameraView
            ref={cameraRef}
            style={styles.camera}
            facing="back"
            onCameraReady={() => setReady(true)}
            onMountError={({ message: error }) => {
              setMessage(error);
              setCamera(false);
            }}
          />
          <View style={styles.content}>
            <AppButton
              label="Capture page"
              disabled={!ready}
              loading={busy}
              onPress={() => void take()}
            />
            <AppButton
              label="Close camera"
              variant="secondary"
              disabled={busy}
              onPress={() => setCamera(false)}
            />
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: 16, paddingBottom: 112, gap: 12 },
  title: { fontSize: 24, fontWeight: '800', color: theme.colors.text },
  subtitle: { fontSize: 16, color: theme.colors.muted },
  card: { padding: 12, gap: 8, backgroundColor: theme.colors.surface, borderRadius: 12 },
  thumbnail: { width: '100%', height: 180, resizeMode: 'contain' },
  camera: { flex: 1, minHeight: 200 },
});
