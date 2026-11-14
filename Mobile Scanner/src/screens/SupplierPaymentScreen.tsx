import { theme } from '../theme';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { HcApiError } from '../api/hc-client';
import { clientFrom } from '../api/products-api';
import { PaymentMethod, recordSupplierPayment } from '../api/supplier-transactions-api';
import { listSuppliers, SupplierSummary } from '../api/suppliers-api';
import { AppButton } from '../components/AppButton';
import { AppInput } from '../components/AppInput';
import { StatusBanner } from '../components/StatusBanner';
import { selectedBranchHeaders } from '../branches/branch-selection';
import { receiptQueue, uploadFailureMessage } from '../services/receipt-queue';
import { prepareReceiptPhoto } from '../services/receipt-photo';
import { ConnectionSettings } from '../types/scanner.types';
import { FormScreen } from '../ui/FormScreen';
import { PageTitle } from '../ui/ScreenHeader';
import { IconTile } from '../ui/Stats';

interface SupplierPaymentScreenProps {
  connection: ConnectionSettings;
  token: string;
  onDone: () => void;
  onSessionInvalid: () => Promise<void>;
}

type Step = 'PICK_SUPPLIER' | 'DETAILS' | 'REVIEW' | 'DONE';
type Currency = 'USD' | 'LBP';
type Banner = { tone: 'warning' | 'danger'; message: string };

const methods: { value: PaymentMethod; label: string }[] = [
  { value: 'CASH_USD', label: 'Cash USD' },
  { value: 'CASH_LBP', label: 'Cash LBP' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'BANK_TRANSFER', label: 'Bank transfer' },
];

export function SupplierPaymentScreen({
  connection,
  token,
  onDone,
  onSessionInvalid,
}: SupplierPaymentScreenProps) {
  const client = useMemo(() => clientFrom(connection, token), [connection, token]);
  const [step, setStep] = useState<Step>('PICK_SUPPLIER');
  const [suppliers, setSuppliers] = useState<SupplierSummary[] | null>(null);
  const [filter, setFilter] = useState('');
  const [supplier, setSupplier] = useState<SupplierSummary | null>(null);
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<Currency>('USD');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH_USD');
  const [note, setNote] = useState('');
  const [banner, setBanner] = useState<Banner | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pages, setPages] = useState<string[]>([]);
  const [billMessage, setBillMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const rows = await listSuppliers(client);
        if (active) setSuppliers(rows);
      } catch (error) {
        if (!active) return;
        if (error instanceof HcApiError && error.kind === 'UNAUTHORIZED') await onSessionInvalid();
        else setBanner({ tone: 'danger', message: 'Could not load suppliers' });
      }
    })();
    return () => {
      active = false;
    };
  }, [client, onSessionInvalid]);

  const filteredSuppliers = useMemo(() => {
    const query = filter.trim().toLocaleLowerCase();
    if (!query) return suppliers ?? [];
    return (suppliers ?? []).filter(
      (row) => row.name.toLocaleLowerCase().includes(query) || row.phone?.includes(query)
    );
  }, [filter, suppliers]);

  const numericAmount = Number(amount);
  const validAmount =
    Number.isFinite(numericAmount) &&
    numericAmount > 0 &&
    (currency === 'USD' || Number.isInteger(numericAmount));
  const selectedMethod = methods.find((method) => method.value === paymentMethod)!;

  const chooseCurrency = (next: Currency) => {
    setCurrency(next);
    if (paymentMethod === 'CASH_USD' || paymentMethod === 'CASH_LBP') {
      setPaymentMethod(next === 'USD' ? 'CASH_USD' : 'CASH_LBP');
    }
  };

  const chooseMethod = (method: PaymentMethod) => {
    setPaymentMethod(method);
    if (method === 'CASH_USD') setCurrency('USD');
    if (method === 'CASH_LBP') setCurrency('LBP');
  };

  const addPage = async (source: 'camera' | 'gallery') => {
    try {
      const access =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!access.granted) {
        setBanner({
          tone: 'warning',
          message:
            source === 'camera'
              ? 'Allow camera access to photograph the bill'
              : 'Allow photo access to choose the bill',
        });
        return;
      }
      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images'],
              allowsMultipleSelection: true,
              quality: 1,
            });
      if (result.canceled) return;
      const added: string[] = [];
      for (const photo of result.assets) added.push(await prepareReceiptPhoto(photo));
      setPages((items) => [...items, ...added]);
    } catch (error) {
      setBanner({
        tone: 'danger',
        message: error instanceof Error ? error.message : 'Could not add the photo',
      });
    }
  };

  /** Queue the bill pages, linked to the new payment, and try to send them now. */
  const attachBill = async (paymentId: string) => {
    if (!supplier || !pages.length) return;
    try {
      const queue = receiptQueue();
      const ids: string[] = [];
      let groupLeadId: string | undefined;
      for (const uri of pages) {
        const entry = await queue.enqueue({
          supplierId: supplier.id,
          supplierPurchaseId: null,
          supplierTransactionId: paymentId,
          ...(groupLeadId ? { groupLeadId } : {}),
          supplierPurchaseLabel: `${supplier.name} · Payment`,
          branchId: selectedBranchHeaders()['X-Branch-Scope'],
          serverUrl: client.baseUrl,
          sourceUri: uri,
          mime: 'image/jpeg',
        });
        ids.push(entry.id);
        groupLeadId ??= entry.id;
      }
      setPages([]);
      await queue.flush(client);
      const left = (await queue.listPending()).filter((entry) => ids.includes(entry.id));
      setBillMessage(
        left.length ? left.map(uploadFailureMessage).join(' ') : 'Bill photo attached'
      );
    } catch (error) {
      setBillMessage(
        error instanceof Error ? error.message : 'Bill photo saved on this phone. It will retry.'
      );
    }
  };

  const review = () => {
    if (!validAmount) {
      setBanner({
        tone: 'warning',
        message:
          currency === 'LBP' ? 'Enter a positive whole LBP amount' : 'Enter a positive amount',
      });
      return;
    }
    setBanner(null);
    setStep('REVIEW');
  };

  const submit = async () => {
    if (!supplier || !validAmount || submitting) return;
    setSubmitting(true);
    setBanner(null);
    try {
      const payment = await recordSupplierPayment(client, {
        supplierId: supplier.id,
        amount: numericAmount,
        currency,
        paymentMethod,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      setStep('DONE');
      void attachBill(payment.id);
    } catch (error) {
      if (error instanceof HcApiError && error.kind === 'UNAUTHORIZED') {
        await onSessionInvalid();
      } else {
        setBanner({
          tone: 'danger',
          message:
            error instanceof HcApiError ? error.message : 'Could not record payment. Try again',
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const recordAnother = () => {
    setSupplier(null);
    setAmount('');
    setCurrency('USD');
    setPaymentMethod('CASH_USD');
    setNote('');
    setPages([]);
    setBillMessage(null);
    setBanner(null);
    setStep('PICK_SUPPLIER');
  };

  return (
    <FormScreen>
      <PageTitle
        title="Pay supplier"
        subtitle={supplier && step !== 'PICK_SUPPLIER' ? supplier.name : undefined}
      />

      {banner && <StatusBanner tone={banner.tone} message={banner.message} />}

      {step === 'PICK_SUPPLIER' && (
        <View style={styles.section}>
          <Text style={styles.step}>1 of 3 · Choose supplier</Text>
          <AppInput
            label="Search suppliers"
            value={filter}
            onChangeText={setFilter}
            placeholder="Name or phone"
          />
          {!suppliers ? (
            <ActivityIndicator color={theme.colors.brand} />
          ) : filteredSuppliers.length === 0 ? (
            <Text style={styles.empty}>No suppliers found</Text>
          ) : (
            filteredSuppliers.map((row) => (
              <Pressable
                key={row.id}
                onPress={() => {
                  setSupplier(row);
                  setBanner(null);
                  setStep('DETAILS');
                }}
                style={({ pressed }) => [styles.supplierRow, pressed && styles.pressed]}
              >
                <Text style={styles.rowTitle}>{row.name}</Text>
                {row.phone ? <Text style={styles.rowMeta}>{row.phone}</Text> : null}
              </Pressable>
            ))
          )}
          <AppButton label="Cancel" variant="secondary" onPress={onDone} />
        </View>
      )}

      {step === 'DETAILS' && supplier && (
        <View style={styles.section}>
          <Text style={styles.step}>2 of 3 · Payment details</Text>
          <Text style={styles.supplierName}>{supplier.name}</Text>
          <AppInput
            label="Amount"
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder={currency === 'USD' ? '0.00' : '0'}
          />
          <Text style={styles.fieldLabel}>Currency</Text>
          <View style={styles.segmentRow}>
            {(['USD', 'LBP'] as Currency[]).map((value) => (
              <Pressable
                key={value}
                onPress={() => chooseCurrency(value)}
                style={[styles.segment, currency === value && styles.selected]}
              >
                <Text style={[styles.choiceText, currency === value && styles.selectedText]}>
                  {value}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.fieldLabel}>Payment method</Text>
          <View style={styles.methodGrid}>
            {methods.map((method) => (
              <Pressable
                key={method.value}
                onPress={() => chooseMethod(method.value)}
                style={[styles.method, paymentMethod === method.value && styles.selected]}
              >
                <Text
                  style={[styles.choiceText, paymentMethod === method.value && styles.selectedText]}
                >
                  {method.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <AppInput
            label="Note (optional)"
            value={note}
            onChangeText={setNote}
            multiline
            maxLength={500}
            style={styles.note}
          />
          <Text style={styles.fieldLabel}>Bill photo (optional)</Text>
          {pages.length ? (
            <View style={styles.pageRow}>
              {pages.map((uri, index) => (
                <Pressable
                  key={uri}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove bill page ${index + 1}`}
                  onPress={() => setPages((items) => items.filter((item) => item !== uri))}
                >
                  <Image source={{ uri }} style={styles.pageThumb} />
                  <Text style={styles.rowMeta}>Page {index + 1} · tap to remove</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <View style={styles.segmentRow}>
            <View style={styles.flex}>
              <AppButton
                label={pages.length ? 'Add page' : 'Take photo'}
                variant="secondary"
                onPress={() => void addPage('camera')}
              />
            </View>
            <View style={styles.flex}>
              <AppButton
                label="Gallery"
                variant="secondary"
                onPress={() => void addPage('gallery')}
              />
            </View>
          </View>
          <AppButton label="Review payment" onPress={review} />
          <AppButton label="Back" variant="secondary" onPress={() => setStep('PICK_SUPPLIER')} />
        </View>
      )}

      {step === 'REVIEW' && supplier && (
        <View style={styles.section}>
          <Text style={styles.step}>3 of 3 · Review</Text>
          <View style={styles.summary}>
            <Text style={styles.summaryLabel}>Supplier</Text>
            <Text style={styles.summaryValue}>{supplier.name}</Text>
            <Text style={styles.summaryLabel}>Amount</Text>
            <Text style={styles.amount}>
              {currency} {amount}
            </Text>
            <Text style={styles.summaryLabel}>Method</Text>
            <Text style={styles.summaryValue}>{selectedMethod.label}</Text>
            {note.trim() ? (
              <>
                <Text style={styles.summaryLabel}>Note</Text>
                <Text style={styles.summaryValue}>{note.trim()}</Text>
              </>
            ) : null}
            {pages.length ? (
              <>
                <Text style={styles.summaryLabel}>Bill photo</Text>
                <Text style={styles.summaryValue}>
                  {pages.length} page{pages.length === 1 ? '' : 's'}
                </Text>
              </>
            ) : null}
          </View>
          <AppButton label="Record payment" onPress={() => void submit()} loading={submitting} />
          <AppButton label="Edit details" variant="secondary" onPress={() => setStep('DETAILS')} />
        </View>
      )}

      {step === 'DONE' && (
        <View style={styles.done}>
          <IconTile icon="checkmark-circle" tone="success" size={64} />
          <Text style={styles.title}>Payment recorded</Text>
          {billMessage ? (
            <StatusBanner
              tone={billMessage === 'Bill photo attached' ? 'info' : 'warning'}
              message={billMessage}
            />
          ) : null}
          <AppButton label="Record another" onPress={recordAnother} />
          <AppButton label="Done" variant="secondary" onPress={onDone} />
        </View>
      )}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  title: { ...theme.text.headline, color: theme.colors.text, textAlign: 'center' },
  section: { gap: 12 },
  step: { ...theme.text.label, color: theme.colors.brandStrong },
  empty: { color: theme.colors.muted, textAlign: 'center', paddingVertical: 24 },
  supplierRow: {
    minHeight: 64,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceMuted,
  },
  pressed: { backgroundColor: theme.colors.brandSoft },
  rowTitle: { color: theme.colors.text, fontSize: 16, fontWeight: '700' },
  rowMeta: { color: theme.colors.muted, fontSize: 12, marginTop: 3 },
  supplierName: { color: theme.colors.text, fontSize: 20, fontWeight: '800' },
  fieldLabel: { color: theme.colors.muted, fontSize: 14, fontWeight: '700' },
  segmentRow: { flexDirection: 'row', gap: 10 },
  segment: {
    flex: 1,
    minHeight: 52,
    justifyContent: 'center',
    borderRadius: theme.radius.sm,
    borderWidth: 1.5,
    borderColor: theme.colors.fieldBorder,
    backgroundColor: theme.colors.field,
    alignItems: 'center',
  },
  selected: { backgroundColor: theme.colors.brand, borderColor: theme.colors.brand },
  choiceText: { color: theme.colors.text, fontWeight: '800', textAlign: 'center' },
  selectedText: { color: theme.colors.surface },
  methodGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  method: {
    width: '48%',
    minHeight: 64,
    padding: 10,
    borderRadius: theme.radius.md,
    borderWidth: 1.5,
    borderColor: theme.colors.fieldBorder,
    backgroundColor: theme.colors.field,
    justifyContent: 'center',
  },
  note: { minHeight: 90, paddingTop: 12, textAlignVertical: 'top' },
  summary: {
    padding: 16,
    gap: 5,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceMuted,
  },
  summaryLabel: { color: theme.colors.muted, fontSize: 12, fontWeight: '700', marginTop: 6 },
  summaryValue: { color: theme.colors.text, fontSize: 16, fontWeight: '700' },
  amount: { color: theme.colors.brand, fontSize: 25, fontWeight: '900' },
  pageRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  pageThumb: { width: 96, height: 128, borderRadius: 10, backgroundColor: theme.colors.border },
  flex: { flex: 1 },
  done: { flex: 1, minHeight: 400, alignItems: 'center', justifyContent: 'center', gap: 12 },
});
