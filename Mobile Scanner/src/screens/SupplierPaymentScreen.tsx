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

const methods: { value: PaymentMethod; label: string; arabic: string }[] = [
  { value: 'CASH_USD', label: 'Cash USD', arabic: 'نقداً بالدولار' },
  { value: 'CASH_LBP', label: 'Cash LBP', arabic: 'نقداً بالليرة' },
  { value: 'CHEQUE', label: 'Cheque', arabic: 'شيك' },
  { value: 'BANK_TRANSFER', label: 'Bank transfer', arabic: 'تحويل مصرفي' },
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
        else setBanner({ tone: 'danger', message: 'Could not load suppliers / تعذّر تحميل المورّدين' });
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
          ? 'Enter a positive whole LBP amount / أدخل مبلغاً صحيحاً بالليرة'
          : 'Enter a positive amount / أدخل مبلغاً صحيحاً',
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
            : 'Could not record payment. Try again / تعذّر تسجيل الدفعة',
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
        <Text style={styles.subtitle}>تسجيل دفعة لمورّد</Text>
      </View>

      {banner && <StatusBanner tone={banner.tone} message={banner.message} />}

      {step === 'PICK_SUPPLIER' && (
        <View style={styles.section}>
          <Text style={styles.step}>1 of 3 · Choose supplier / اختر المورّد</Text>
          <AppInput
            label="Search suppliers / بحث عن مورّد"
            value={filter}
            onChangeText={setFilter}
            placeholder="Name or phone"
          />
          {!suppliers ? <ActivityIndicator color="#047857" /> : filteredSuppliers.length === 0 ? (
            <Text style={styles.empty}>No suppliers found / لم يتم العثور على مورّدين</Text>
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
          <AppButton label="Cancel / إلغاء" variant="secondary" onPress={onDone} />
        </View>
      )}

      {step === 'DETAILS' && supplier && (
        <View style={styles.section}>
          <Text style={styles.step}>2 of 3 · Payment details / تفاصيل الدفعة</Text>
          <Text style={styles.supplierName}>{supplier.name}</Text>
          <AppInput
            label="Amount / المبلغ"
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder={currency === 'USD' ? '0.00' : '0'}
          />
          <Text style={styles.fieldLabel}>Currency / العملة</Text>
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
          <Text style={styles.fieldLabel}>Payment method / طريقة الدفع</Text>
          <View style={styles.methodGrid}>
            {methods.map((method) => (
              <Pressable
                key={method.value}
                onPress={() => chooseMethod(method.value)}
                style={[styles.method, paymentMethod === method.value && styles.selected]}
              >
                <Text style={[styles.choiceText, paymentMethod === method.value && styles.selectedText]}>{method.label}</Text>
                <Text style={[styles.methodArabic, paymentMethod === method.value && styles.selectedText]}>{method.arabic}</Text>
              </Pressable>
            ))}
          </View>
          <AppInput
            label="Note (optional) / ملاحظة (اختياري)"
            value={note}
            onChangeText={setNote}
            multiline
            maxLength={500}
            style={styles.note}
          />
          <StatusBanner
            tone="info"
            message="Receipt attachment to payments is coming soon / إرفاق إيصال بالدفعة سيتوفر قريباً"
          />
          <AppButton label="Review payment / مراجعة الدفعة" onPress={review} />
          <AppButton label="Back / رجوع" variant="secondary" onPress={() => setStep('PICK_SUPPLIER')} />
        </View>
      )}

      {step === 'REVIEW' && supplier && (
        <View style={styles.section}>
          <Text style={styles.step}>3 of 3 · Review / مراجعة</Text>
          <View style={styles.summary}>
            <Text style={styles.summaryLabel}>Supplier / المورّد</Text>
            <Text style={styles.summaryValue}>{supplier.name}</Text>
            <Text style={styles.summaryLabel}>Amount / المبلغ</Text>
            <Text style={styles.amount}>{currency} {amount}</Text>
            <Text style={styles.summaryLabel}>Method / الطريقة</Text>
            <Text style={styles.summaryValue}>{selectedMethod.label} · {selectedMethod.arabic}</Text>
            {note.trim() ? <><Text style={styles.summaryLabel}>Note / ملاحظة</Text><Text style={styles.summaryValue}>{note.trim()}</Text></> : null}
          </View>
          <AppButton label="Record payment / تسجيل الدفعة" onPress={() => void submit()} loading={submitting} />
          <AppButton label="Edit details / تعديل التفاصيل" variant="secondary" onPress={() => setStep('DETAILS')} />
        </View>
      )}

      {step === 'DONE' && (
        <View style={styles.done}>
          <Text style={styles.title}>Payment recorded ✓</Text>
          <Text style={styles.subtitle}>تم تسجيل الدفعة</Text>
          <AppButton label="Record another / تسجيل دفعة أخرى" onPress={recordAnother} />
          <AppButton label="Done / تم" variant="secondary" onPress={onDone} />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 18, gap: 16, backgroundColor: '#f8fafc', flexGrow: 1 },
  header: { gap: 3 },
  title: { color: '#0f172a', fontSize: 24, fontWeight: '900' },
  subtitle: { color: '#475569', fontSize: 18, fontWeight: '700' },
  section: { gap: 12 },
  step: { color: '#047857', fontSize: 13, fontWeight: '800' },
  empty: { color: '#64748b', textAlign: 'center', paddingVertical: 24 },
  supplierRow: { padding: 13, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#fff' },
  pressed: { backgroundColor: '#f1f5f9' },
  rowTitle: { color: '#0f172a', fontSize: 16, fontWeight: '700' },
  rowMeta: { color: '#64748b', fontSize: 12, marginTop: 3 },
  supplierName: { color: '#0f172a', fontSize: 20, fontWeight: '800' },
  fieldLabel: { color: '#334155', fontSize: 14, fontWeight: '700' },
  segmentRow: { flexDirection: 'row', gap: 10 },
  segment: { flex: 1, padding: 13, borderRadius: 12, borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: '#fff', alignItems: 'center' },
  selected: { backgroundColor: '#047857', borderColor: '#047857' },
  choiceText: { color: '#0f172a', fontWeight: '800', textAlign: 'center' },
  selectedText: { color: '#fff' },
  methodGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  method: { width: '48%', minHeight: 70, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: '#fff', justifyContent: 'center' },
  methodArabic: { color: '#64748b', fontSize: 12, marginTop: 4, textAlign: 'center' },
  note: { minHeight: 90, paddingTop: 12, textAlignVertical: 'top' },
  summary: { padding: 16, gap: 5, borderRadius: 14, borderWidth: 1, borderColor: '#d1fae5', backgroundColor: '#fff' },
  summaryLabel: { color: '#64748b', fontSize: 12, fontWeight: '700', marginTop: 6 },
  summaryValue: { color: '#0f172a', fontSize: 16, fontWeight: '700' },
  amount: { color: '#047857', fontSize: 25, fontWeight: '900' },
  done: { flex: 1, minHeight: 400, alignItems: 'stretch', justifyContent: 'center', gap: 12 },
});
