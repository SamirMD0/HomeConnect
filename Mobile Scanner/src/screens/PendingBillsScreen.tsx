import { useEffect, useMemo, useState } from 'react';
import { Alert, AppState, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { clientFrom } from '../api/products-api';
import {
  listSupplierPurchases,
  listSuppliers,
  SupplierPurchaseSummary,
  SupplierSummary,
} from '../api/suppliers-api';
import { selectedBranchHeaders } from '../branches/branch-selection';
import { AppButton } from '../components/AppButton';
import { StatusBanner } from '../components/StatusBanner';
import { QueuedReceipt, receiptQueue, uploadFailureMessage } from '../services/receipt-queue';
import { ConnectionSettings } from '../types/scanner.types';

export function PendingBillsScreen({
  connection,
  token,
  onDone,
}: {
  connection: ConnectionSettings;
  token: string;
  onDone: () => void;
}) {
  const client = useMemo(() => clientFrom(connection, token), [connection, token]);
  const [items, setItems] = useState<QueuedReceipt[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [changing, setChanging] = useState<QueuedReceipt | null>(null);
  const [suppliers, setSuppliers] = useState<SupplierSummary[]>([]);
  const [purchases, setPurchases] = useState<SupplierPurchaseSummary[]>([]);
  const queue = receiptQueue();
  const refresh = async () => setItems(await queue.listPending());
  useEffect(() => {
    const load = () => {
      void queue
        .listPending()
        .then(setItems)
        .catch((error: Error) => setMessage(error.message));
    };
    load();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') load();
    });
    const timer = setInterval(load, 2000);
    return () => {
      subscription.remove();
      clearInterval(timer);
    };
  }, [queue]);
  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await action();
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not update pending bills.');
    } finally {
      setBusy(false);
    }
  };
  const change = async (id: string | null, label: string) => {
    if (!changing) return;
    await queue.changePurchase(changing.id, id, label, changing.supplierId);
    setChanging(null);
  };
  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Pending bills</Text>
        {message && <StatusBanner tone="warning" message={message} />}
        {changing ? (
          <>
            <Text>Change purchase for {changing.supplierPurchaseLabel}</Text>
            {!changing.supplierId && (
              <>
                <Text>Choose a supplier for this older saved bill.</Text>
                {suppliers.map((supplier) => (
                  <AppButton
                    key={supplier.id}
                    label={supplier.name}
                    disabled={busy}
                    variant="secondary"
                    onPress={() =>
                      void run(async () => {
                        setPurchases(await listSupplierPurchases(client, supplier.id));
                        setChanging({
                          ...changing,
                          supplierId: supplier.id,
                          supplierPurchaseLabel: supplier.name,
                        });
                      })
                    }
                  />
                ))}
              </>
            )}
            {changing.supplierId && (
              <AppButton
                label="No purchase yet"
                disabled={busy}
                onPress={() =>
                  void run(() =>
                    change(
                      null,
                      `${changing.supplierPurchaseLabel.split(' · ')[0]} · No purchase yet`
                    )
                  )
                }
              />
            )}
            {purchases
              .filter((row) => row.supplierReceivingId)
              .map((row) => (
                <AppButton
                  key={row.id}
                  label={`Ref # ${row.referenceNumber ?? row.id.slice(0, 8)}`}
                  disabled={busy}
                  variant="secondary"
                  onPress={() =>
                    void run(() =>
                      change(
                        row.supplierReceivingId!,
                        `${changing.supplierPurchaseLabel.split(' · ')[0]} · Ref # ${row.referenceNumber ?? row.id.slice(0, 8)}`
                      )
                    )
                  }
                />
              ))}
            <AppButton
              label="Cancel change"
              variant="secondary"
              onPress={() => setChanging(null)}
            />
          </>
        ) : (
          <>
            {!items.length && <Text>No pending bills.</Text>}
            {items.map((item) => {
              const otherScope = Boolean(
                (item.branchId && item.branchId !== selectedBranchHeaders()['X-Branch-Scope']) ||
                (item.serverUrl && item.serverUrl !== client.baseUrl)
              );
              return (
                <View key={item.id} style={styles.card}>
                  <Image
                    source={{ uri: item.localPath }}
                    style={styles.thumbnail}
                    accessibilityLabel={`Bill for ${item.supplierPurchaseLabel}`}
                  />
                  <Text style={styles.label}>{item.supplierPurchaseLabel}</Text>
                  <Text>Status: {item.status}</Text>
                  {item.lastError && <Text accessibilityLiveRegion="polite">{item.lastError}</Text>}
                  {otherScope && (
                    <Text>Switch to the original server for this bill and branch to retry.</Text>
                  )}
                  <AppButton
                    label="Retry"
                    disabled={busy || item.status === 'uploading' || otherScope}
                    onPress={() =>
                      void run(async () => {
                        await queue.retry(item.id);
                        await queue.flush(client, undefined, item.id);
                        const remaining = (await queue.listPending()).find(
                          (row) => row.id === item.id
                        );
                        setMessage(remaining ? uploadFailureMessage(remaining) : 'Bill uploaded.');
                      })
                    }
                  />
                  {item.status === 'blocked' && (
                    <AppButton
                      label="Change purchase"
                      variant="secondary"
                      disabled={busy || otherScope}
                      onPress={() =>
                        void run(async () => {
                          if (item.supplierId)
                            setPurchases(await listSupplierPurchases(client, item.supplierId));
                          else {
                            setSuppliers(await listSuppliers(client));
                            setPurchases([]);
                          }
                          setChanging(item);
                        })
                      }
                    />
                  )}
                  <AppButton
                    label="Delete"
                    variant="danger"
                    disabled={busy || item.status === 'uploading'}
                    onPress={() =>
                      Alert.alert(
                        'Delete pending bill?',
                        'This removes the photo saved on this phone.',
                        [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Delete',
                            style: 'destructive',
                            onPress: () => void run(() => queue.remove(item.id)),
                          },
                        ]
                      )
                    }
                  />
                </View>
              );
            })}
          </>
        )}
        <AppButton label="Done" variant="secondary" disabled={busy} onPress={onDone} />
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 16, gap: 12 },
  title: { fontSize: 24, fontWeight: '800', color: '#0f172a' },
  label: { fontSize: 16, fontWeight: '700', color: '#334155' },
  card: { padding: 16, gap: 8, backgroundColor: '#ffffff', borderRadius: 12 },
  thumbnail: { width: '100%', height: 160, resizeMode: 'contain' },
});
