import { theme } from '../theme';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { HcApiError } from '../api/hc-client';
import { clientFrom } from '../api/products-api';
import {
  PaymentMethod,
  recordSupplierPayment,
} from '../api/supplier-transactions-api';
import { listSuppliers, SupplierSummary } from '../api/suppliers-api';
import { AppButton } from '../components/AppButton';
import { AppInput } from '../components/AppInput';
import { StatusBanner } from '../components/StatusBanner';
import { ConnectionSettings } from '../types/scanner.types';

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
    return () => { active = false; };
  }, [client, onSessionInvalid]);

  const filteredSuppliers = useMemo(() => {
    const query = filter.trim().toLocaleLowerCase();
    if (!query) return suppliers ?? [];
    return (suppliers ?? []).filter((row) =>
      row.name.toLocaleLowerCase().includes(query) || row.phone?.includes(query));
  }, [filter, suppliers]);

  const numericAmount = Number(amount);
  const validAmount = Number.isFinite(numericAmount)
    && numericAmount > 0
    && (currency === 'USD' || Number.isInteger(numericAmount));
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

  const review = () => {
    if (!validAmount) {
      setBanner({
        tone: 'warning',
        message: currency === 'LBP'
          ? 'Enter a positive whole LBP amount'
          : 'Enter a positive amount',
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
      await recordSupplierPayment(client, {
        supplierId: supplier.id,
        amount: numericAmount,
        currency,
        paymentMethod,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      setStep('DONE');
    } catch (error) {
      if (error instanceof HcApiError && error.kind === 'UNAUTHORIZED') {
        await onSessionInvalid();
      } else {
        setBanner({
          tone: 'danger',
          message: error instanceof HcApiError
            ? error.message
            : 'Could not record payment. Try again',
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
    setBanner(null);
    setStep('PICK_SUPPLIER');
  };

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <Text style={styles.title}>Record supplier payment</Text>
      </View>

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
          {!suppliers ? <ActivityIndicator color={theme.colors.brand} /> : filteredSuppliers.length === 0 ? (
            <Text style={styles.empty}>No suppliers found</Text>
          ) : filteredSuppliers.map((row) => (
            <Pressable
              key={row.id}
              onPress={() => { setSupplier(row); setBanner(null); setStep('DETAILS'); }}
              style={({ pressed }) => [styles.supplierRow, pressed && styles.pressed]}
            >
              <Text style={styles.rowTitle}>{row.name}</Text>
              {row.phone ? <Text style={styles.rowMeta}>{row.phone}</Text> : null}
            </Pressable>
          ))}
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
                <Text style={[styles.choiceText, currency === value && styles.selectedText]}>{value}</Text>
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
                <Text style={[styles.choiceText, paymentMethod === method.value && styles.selectedText]}>{method.label}</Text>
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
          <StatusBanner
            tone="info"
            message="Receipt attachment to payments is coming soon"
          />
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
            <Text style={styles.amount}>{currency} {amount}</Text>
            <Text style={styles.summaryLabel}>Method</Text>
            <Text style={styles.summaryValue}>{selectedMethod.label}</Text>
            {note.trim() ? <><Text style={styles.summaryLabel}>Note</Text><Text style={styles.summaryValue}>{note.trim()}</Text></> : null}
          </View>
          <AppButton label="Record payment" onPress={() => void submit()} loading={submitting} />
          <AppButton label="Edit details" variant="secondary" onPress={() => setStep('DETAILS')} />
        </View>
      )}

      {step === 'DONE' && (
        <View style={styles.done}>
          <Text style={styles.title}>Payment recorded ✓</Text>
          <AppButton label="Record another" onPress={recordAnother} />
          <AppButton label="Done" variant="secondary" onPress={onDone} />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingBottom: 112, padding: 18, gap: 16, backgroundColor: theme.colors.background, flexGrow: 1 },
  header: { gap: 3 },
  title: { color: theme.colors.text, fontSize: 24, fontWeight: '900' },
  section: { gap: 12 },
  step: { color: theme.colors.brand, fontSize: 13, fontWeight: '800' },
  empty: { color: theme.colors.muted, textAlign: 'center', paddingVertical: 24 },
  supplierRow: { padding: 13, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  pressed: { backgroundColor: theme.colors.neutralSoft },
  rowTitle: { color: theme.colors.text, fontSize: 16, fontWeight: '700' },
  rowMeta: { color: theme.colors.muted, fontSize: 12, marginTop: 3 },
  supplierName: { color: theme.colors.text, fontSize: 20, fontWeight: '800' },
  fieldLabel: { color: theme.colors.muted, fontSize: 14, fontWeight: '700' },
  segmentRow: { flexDirection: 'row', gap: 10 },
  segment: { flex: 1, padding: 13, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, alignItems: 'center' },
  selected: { backgroundColor: theme.colors.brand, borderColor: theme.colors.brand },
  choiceText: { color: theme.colors.text, fontWeight: '800', textAlign: 'center' },
  selectedText: { color: theme.colors.surface },
  methodGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  method: { width: '48%', minHeight: 70, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, justifyContent: 'center' },
  note: { minHeight: 90, paddingTop: 12, textAlignVertical: 'top' },
  summary: { padding: 16, gap: 5, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.brandSoft, backgroundColor: theme.colors.surface },
  summaryLabel: { color: theme.colors.muted, fontSize: 12, fontWeight: '700', marginTop: 6 },
  summaryValue: { color: theme.colors.text, fontSize: 16, fontWeight: '700' },
  amount: { color: theme.colors.brand, fontSize: 25, fontWeight: '900' },
  done: { flex: 1, minHeight: 400, alignItems: 'stretch', justifyContent: 'center', gap: 12 },
});
