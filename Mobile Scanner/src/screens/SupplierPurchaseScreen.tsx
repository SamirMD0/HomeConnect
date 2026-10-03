import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { HcApiError } from '../api/hc-client';
import { clientFrom } from '../api/products-api';
import {
  checkSupplierReceipt, CreateSupplierPurchaseInput, PurchaseCurrency,
  RecordedSupplierPurchase, recordSupplierPurchase,
} from '../api/supplier-purchases-api';
import { listSuppliers, SupplierSummary } from '../api/suppliers-api';
import { AppButton } from '../components/AppButton';
import { AppInput } from '../components/AppInput';
import { StatusBanner } from '../components/StatusBanner';
import { ConnectionSettings } from '../types/scanner.types';
import { PurchaseLineEditor } from './PurchaseLineEditor';
import { buildDescription, issueForInvoice, lineSubtotal, moneyMinorUnits, moneyText, newKey, newPurchaseLine, PurchaseLineDraft, toApiLine, today } from './supplier-purchase-form';

interface SupplierPurchaseScreenProps {
  connection: ConnectionSettings;
  token: string;
  onDone: () => void;
  onSessionInvalid: () => Promise<void>;
}

type Step = 'SUPPLIER' | 'DETAILS' | 'REVIEW' | 'DONE';
type Banner = { tone: 'danger' | 'warning'; message: string };

export function SupplierPurchaseScreen({ connection, token, onDone, onSessionInvalid }: SupplierPurchaseScreenProps) {
  const client = useMemo(() => clientFrom(connection, token), [connection, token]);
  const [step, setStep] = useState<Step>('SUPPLIER');
  const [suppliers, setSuppliers] = useState<SupplierSummary[] | null>(null);
  const [supplierRetry, setSupplierRetry] = useState(0);
  const [supplierFilter, setSupplierFilter] = useState('');
  const [supplier, setSupplier] = useState<SupplierSummary | null>(null);
  const [receiptNumber, setReceiptNumber] = useState('');
  const [transactionDate, setTransactionDate] = useState(today);
  const [dueDate, setDueDate] = useState('');
  const [currency, setCurrency] = useState<PurchaseCurrency>('USD');
  const [receiveStock, setReceiveStock] = useState(true);
  const [description, setDescription] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [billedTotal, setBilledTotal] = useState('');
  const [lines, setLines] = useState<PurchaseLineDraft[]>(() => [newPurchaseLine(newKey())]);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [duplicateReceipt, setDuplicateReceipt] = useState(false);
  const [duplicateConfirmed, setDuplicateConfirmed] = useState(false);
  const [created, setCreated] = useState<RecordedSupplierPurchase | null>(null);
  const idempotencyKey = useRef(newKey());

  useEffect(() => {
    let active = true;
    void listSuppliers(client).then((rows) => {
      if (active) setSuppliers(rows);
    }).catch(async (error: unknown) => {
      if (!active) return;
      if (error instanceof HcApiError && error.kind === 'UNAUTHORIZED') await onSessionInvalid();
      else setBanner({ tone: 'danger', message: 'Could not load suppliers / تعذّر تحميل المورّدين' });
    });
    return () => { active = false; };
  }, [client, onSessionInvalid, supplierRetry]);

  const filteredSuppliers = useMemo(() => {
    const query = supplierFilter.trim().toLocaleLowerCase();
    return (suppliers ?? []).filter((item) => item.name.toLocaleLowerCase().includes(query) || item.phone?.includes(query));
  }, [supplierFilter, suppliers]);
  const quotedSubtotal = lines.reduce((sum, line) => sum + (lineSubtotal(line, currency) ?? 0), 0);
  const generatedDescription = buildDescription(lines, receiptNumber);
  const effectiveDescription = description.trim() || generatedDescription;

  const updateLine = (updated: PurchaseLineDraft) => setLines((current) => current.map((line) => line.key === updated.key ? updated : line));
  const removeLine = (key: string) => setLines((current) => current.filter((line) => line.key !== key));
  const chooseCurrency = (next: PurchaseCurrency) => {
    if (next === currency) return;
    setCurrency(next);
    setBilledTotal('');
    setLines((current) => current.map((line) => ({
      ...line, unitPrice: '', amount: '',
      product: line.product && (line.product.priceCurrency ?? 'USD') === next ? line.product : null,
    })));
    setBanner({ tone: 'warning', message: 'Re-enter prices and invoice total in the new currency / أعد إدخال الأسعار والإجمالي بالعملة الجديدة' });
  };

  const review = async () => {
    const issue = issueForInvoice(lines, currency, receiveStock, transactionDate, dueDate, billedTotal);
    if (issue) { setBanner({ tone: 'warning', message: issue }); return; }
    if (effectiveDescription.length < 3) { setBanner({ tone: 'warning', message: 'Enter a purchase description / أدخل وصف الفاتورة' }); return; }
    if (!supplier) return;
    setReviewing(true);
    setBanner(null);
    setDuplicateConfirmed(false);
    try {
      const check = receiptNumber.trim()
        ? await checkSupplierReceipt(client, supplier.id, receiptNumber.trim())
        : { duplicate: false };
      setDuplicateReceipt(check.duplicate);
      setStep('REVIEW');
    } catch (error) {
      if (error instanceof HcApiError && error.kind === 'UNAUTHORIZED') await onSessionInvalid();
      else setBanner({ tone: 'danger', message: error instanceof HcApiError ? error.message : 'Could not check invoice number / تعذّر التحقق من رقم الفاتورة' });
    } finally { setReviewing(false); }
  };

  const submit = async () => {
    if (!supplier || submitting || (duplicateReceipt && !duplicateConfirmed)) return;
    const issue = issueForInvoice(lines, currency, receiveStock, transactionDate, dueDate, billedTotal);
    if (issue) { setBanner({ tone: 'warning', message: issue }); setStep('DETAILS'); return; }
    const body: CreateSupplierPurchaseInput = {
      supplierId: supplier.id,
      idempotencyKey: idempotencyKey.current,
      receiptNumber: receiptNumber.trim() || undefined,
      transactionDate, dueDate: dueDate || undefined, currency,
      description: effectiveDescription,
      reference: reference.trim() || undefined,
      notes: notes.trim() || undefined,
      receiveStock,
      amountOverride: moneyText(moneyMinorUnits(billedTotal, currency)!, currency),
      amountOverrideReason: 'Supplier invoice total confirmed on mobile / إجمالي فاتورة المورد مؤكد من الهاتف',
      lines: lines.map((line) => toApiLine(line, currency)),
    };
    setSubmitting(true);
    setBanner(null);
    try {
      const purchase = await recordSupplierPurchase(client, body);
      setCreated(purchase);
      setStep('DONE');
    } catch (error) {
      if (error instanceof HcApiError && error.kind === 'UNAUTHORIZED') await onSessionInvalid();
      else setBanner({ tone: 'danger', message: error instanceof HcApiError ? error.message : 'Could not record invoice / تعذّر تسجيل الفاتورة' });
    } finally { setSubmitting(false); }
  };

  const recordAnother = () => {
    idempotencyKey.current = newKey();
    setReceiptNumber(''); setTransactionDate(today()); setDueDate(''); setCurrency('USD');
    setReceiveStock(true); setDescription(''); setReference(''); setNotes(''); setBilledTotal('');
    setLines([newPurchaseLine(newKey())]); setBanner(null); setCreated(null);
    setDuplicateReceipt(false); setDuplicateConfirmed(false); setStep('DETAILS');
  };

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Supplier purchase invoice / فاتورة شراء من مورّد</Text>
      {banner ? <StatusBanner tone={banner.tone} message={banner.message} /> : null}

      {step === 'SUPPLIER' && (
        <View style={styles.section}>
          <Text style={styles.step}>1 of 3 · Choose supplier / اختر المورّد</Text>
          <AppInput label="Search suppliers / بحث عن مورّد" value={supplierFilter} onChangeText={setSupplierFilter} placeholder="Name or phone" />
          {!suppliers && !banner ? <ActivityIndicator color="#047857" /> : null}
          {!suppliers && banner ? <AppButton label="Retry / إعادة المحاولة" onPress={() => { setBanner(null); setSupplierRetry((value) => value + 1); }} /> : null}
          {suppliers?.length === 0 ? <Text style={styles.muted}>No suppliers found / لا يوجد مورّدون</Text> : null}
          {filteredSuppliers.map((item) => (
            <Pressable key={item.id} style={styles.supplierRow} onPress={() => { setSupplier(item); setBanner(null); setStep('DETAILS'); }}>
              <Text style={styles.supplierName}>{item.name}</Text>
              {item.phone ? <Text style={styles.muted}>{item.phone}</Text> : null}
            </Pressable>
          ))}
          <AppButton label="Close / إغلاق" variant="secondary" onPress={onDone} />
        </View>
      )}

      {step === 'DETAILS' && supplier && (
        <View style={styles.section}>
          <Text style={styles.step}>2 of 3 · Invoice details / تفاصيل الفاتورة</Text>
          <Text style={styles.supplierName}>{supplier.name}</Text>
          <AppInput label="Receipt / invoice no. / رقم الفاتورة" value={receiptNumber} onChangeText={setReceiptNumber} maxLength={200} />
          <AppInput label="Purchase date (YYYY-MM-DD) / تاريخ الشراء" value={transactionDate} onChangeText={setTransactionDate} keyboardType="numbers-and-punctuation" maxLength={10} />
          <AppInput label="Due date (optional) / تاريخ الاستحقاق" value={dueDate} onChangeText={setDueDate} keyboardType="numbers-and-punctuation" maxLength={10} hint="Leave blank for no due date / اتركه فارغاً بلا استحقاق" />
          <Text style={styles.label}>Currency / العملة</Text>
          <View style={styles.choiceRow}>
            {(['USD', 'LBP'] as PurchaseCurrency[]).map((value) => (
              <Pressable key={value} style={[styles.choice, currency === value && styles.selected]} onPress={() => chooseCurrency(value)}>
                <Text style={styles.choiceText}>{value}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable style={styles.toggle} onPress={() => setReceiveStock((value) => !value)} accessibilityRole="checkbox" accessibilityState={{ checked: receiveStock }}>
            <Text style={styles.mark}>{receiveStock ? '☑' : '□'}</Text>
            <View style={styles.flex}><Text style={styles.label}>Receive stock now / استلام المخزون الآن</Text>
              <Text style={styles.muted}>Applies to product lines only / ينطبق على بنود المنتجات فقط</Text></View>
          </Pressable>
          <Text style={styles.label}>Lines / البنود</Text>
          {lines.map((line, index) => (
            <PurchaseLineEditor key={line.key} line={line} index={index} currency={currency} receiveStock={receiveStock}
              usedProductIds={new Set(lines.filter((other) => other.key !== line.key).map((other) => other.product?.id).filter((id): id is string => Boolean(id)))}
              client={client} onSessionInvalid={onSessionInvalid} onChange={updateLine}
              onRemove={() => removeLine(line.key)} canRemove={lines.length > 1} />
          ))}
          <AppButton label="Add line / إضافة بند" variant="secondary" disabled={lines.length >= 100} onPress={() => setLines((current) => [...current, newPurchaseLine(newKey())])} />
          <Text style={styles.muted}>Entered line amounts (VAT may change the line sum) / مبالغ البنود المدخلة وقد تغيّرها الضريبة: {currency} {moneyText(quotedSubtotal, currency)}</Text>
          <AppInput label="Total on supplier invoice / إجمالي فاتورة المورّد" value={billedTotal} onChangeText={setBilledTotal} keyboardType="decimal-pad" hint="This is the amount posted to the supplier account / هذا المبلغ الذي يُسجّل على حساب المورّد" />
          <AppInput label="Description (optional) / الوصف" value={description} onChangeText={setDescription} multiline maxLength={500} hint={`Suggested / مقترح: ${generatedDescription || '—'}`} />
          <AppInput label="Reference (optional) / المرجع" value={reference} onChangeText={setReference} maxLength={200} />
          <AppInput label="Notes (optional) / ملاحظات" value={notes} onChangeText={setNotes} multiline maxLength={2000} />
          <AppButton label="Review invoice / مراجعة الفاتورة" onPress={() => void review()} loading={reviewing} />
          <AppButton label="Change supplier / تغيير المورّد" variant="secondary" onPress={() => { setSupplier(null); setStep('SUPPLIER'); }} />
        </View>
      )}

      {step === 'REVIEW' && supplier && (
        <View style={styles.section}>
          <Text style={styles.step}>3 of 3 · Review / مراجعة</Text>
          <View style={styles.summary}>
            <Text style={styles.supplierName}>{supplier.name}</Text>
            <Text style={styles.muted}>Invoice / الفاتورة: {receiptNumber.trim() || '—'} · {transactionDate}</Text>
            <Text style={styles.muted}>Due / الاستحقاق: {dueDate || 'No due date / بلا تاريخ'}</Text>
            <Text style={styles.muted}>Stock / المخزون: {receiveStock ? 'Receive now / استلام الآن' : 'Do not receive / دون استلام'}</Text>
            {lines.map((line, index) => <View key={line.key} style={styles.reviewLine}>
              <Text style={styles.label}>{index + 1}. {line.kind === 'MANUAL' ? line.description : `${line.product?.name} × ${line.quantity}`}</Text>
              <Text style={styles.muted}>{currency} {moneyText(lineSubtotal(line, currency) ?? 0, currency)} · {line.priceIncludesVat ? 'VAT included / شامل الضريبة' : 'VAT added / تضاف الضريبة'}</Text>
            </View>)}
            <Text style={styles.total}>Posted total / الإجمالي المسجّل: {currency} {billedTotal}</Text>
            <Text style={styles.muted}>No payment is recorded here / لا تُسجَّل دفعة هنا</Text>
          </View>
          {duplicateReceipt ? <StatusBanner tone="warning" message="This invoice number already exists for this supplier. Check before recording / رقم الفاتورة موجود لهذا المورّد" /> : null}
          {duplicateReceipt ? <Pressable style={styles.toggle} onPress={() => setDuplicateConfirmed((value) => !value)} accessibilityRole="checkbox" accessibilityState={{ checked: duplicateConfirmed }}>
            <Text style={styles.mark}>{duplicateConfirmed ? '☑' : '□'}</Text><Text style={styles.label}>I checked the existing invoice / تحققت من الفاتورة الموجودة</Text>
          </Pressable> : null}
          <AppButton label="Record invoice / تسجيل الفاتورة" onPress={() => void submit()} loading={submitting} disabled={duplicateReceipt && !duplicateConfirmed} />
          <AppButton label="Edit details / تعديل التفاصيل" variant="secondary" onPress={() => { setBanner(null); setStep('DETAILS'); }} />
        </View>
      )}

      {step === 'DONE' && created && (
        <View style={styles.done}>
          <Text style={styles.title}>Invoice recorded ✓ / تم تسجيل الفاتورة</Text>
          <Text style={styles.total}>{created.currency} {created.amount}</Text>
          <Text style={styles.muted}>Use Supplier payment to record money paid / استخدم دفعة المورّد لتسجيل المبلغ المدفوع</Text>
          {created.supplierReceivingId ? <Text style={styles.muted}>A receipt photo can be attached from Scanner / يمكن إرفاق صورة الإيصال من شاشة المسح</Text> : null}
          <AppButton label="Record another / تسجيل فاتورة أخرى" onPress={recordAnother} />
          <AppButton label="Done / تم" variant="secondary" onPress={onDone} />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 18, gap: 14, flexGrow: 1, backgroundColor: '#f8fafc' },
  title: { color: '#0f172a', fontSize: 23, fontWeight: '900' },
  section: { gap: 12 },
  step: { color: '#047857', fontSize: 13, fontWeight: '800' },
  supplierRow: { padding: 14, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0' },
  supplierName: { color: '#0f172a', fontSize: 18, fontWeight: '800' },
  muted: { color: '#64748b', fontSize: 12, lineHeight: 18 },
  label: { color: '#334155', fontSize: 14, fontWeight: '700' },
  choiceRow: { flexDirection: 'row', gap: 9 },
  choice: { flex: 1, padding: 14, alignItems: 'center', borderRadius: 10, borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: '#fff' },
  selected: { backgroundColor: '#d1fae5', borderColor: '#047857' },
  choiceText: { color: '#0f172a', fontWeight: '800' },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, backgroundColor: '#fff', borderRadius: 10 },
  mark: { color: '#047857', fontSize: 22 },
  flex: { flex: 1, gap: 2 },
  summary: { padding: 16, gap: 10, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: '#d1fae5' },
  reviewLine: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#e2e8f0' },
  total: { color: '#047857', fontSize: 19, fontWeight: '900' },
  done: { flex: 1, minHeight: 400, justifyContent: 'center', gap: 14 },
});
