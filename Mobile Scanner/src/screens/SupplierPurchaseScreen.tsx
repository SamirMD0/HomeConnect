import { theme } from '../theme';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { HcApiError } from '../api/hc-client';
import { clientFrom } from '../api/products-api';
import {
  BackendTooOldError,
  checkSupplierReceipt,
  CreateSupplierPurchaseInput,
  PurchaseCurrency,
  RecordedSupplierPurchase,
  recordSupplierPurchase,
} from '../api/supplier-purchases-api';
import { listSuppliers, SupplierSummary } from '../api/suppliers-api';
import { AppButton } from '../components/AppButton';
import { AppInput } from '../components/AppInput';
import { StatusBanner } from '../components/StatusBanner';
import { ConnectionSettings } from '../types/scanner.types';
import type { InvoiceFromBill } from '../navigation/FeatureScreen';
import { BillPreview } from '../suppliers/BillPreview';
import { linkAfterPurchase } from '../suppliers/bills-inbox';
import { PurchaseLineEditor } from './PurchaseLineEditor';
import {
  buildDescription,
  issueForInvoice,
  lineSubtotal,
  moneyMinorUnits,
  moneyText,
  newKey,
  newPurchaseLine,
  PurchaseLineDraft,
  toApiLine,
  today,
} from './supplier-purchase-form';
import { FormScreen } from '../ui/FormScreen';
import { PageTitle } from '../ui/ScreenHeader';
import { IconTile } from '../ui/Stats';

interface SupplierPurchaseScreenProps {
  connection: ConnectionSettings;
  token: string;
  onDone: () => void;
  onSessionInvalid: () => Promise<void>;
  /** "Create purchase from bill": pin the photo, preselect its supplier, link it after saving. */
  fromBill?: InvoiceFromBill;
}

type Step = 'SUPPLIER' | 'DETAILS' | 'REVIEW' | 'DONE';
type Banner = { tone: 'danger' | 'warning'; message: string };

export function SupplierPurchaseScreen({
  connection,
  token,
  onDone,
  onSessionInvalid,
  fromBill,
}: SupplierPurchaseScreenProps) {
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
  const [billResult, setBillResult] = useState<{ linked: boolean; message: string } | null>(null);
  const idempotencyKey = useRef(newKey());

  useEffect(() => {
    let active = true;
    void listSuppliers(client)
      .then((rows) => {
        if (!active) return;
        setSuppliers(rows);
        const billSupplier = fromBill && rows.find((row) => row.id === fromBill.supplierId);
        if (billSupplier) {
          setSupplier((current) => current ?? billSupplier);
          setStep((current) => (current === 'SUPPLIER' ? 'DETAILS' : current));
        }
      })
      .catch(async (error: unknown) => {
        if (!active) return;
        if (error instanceof HcApiError && error.kind === 'UNAUTHORIZED') await onSessionInvalid();
        else setBanner({ tone: 'danger', message: 'Could not load suppliers' });
      });
    return () => {
      active = false;
    };
  }, [client, onSessionInvalid, supplierRetry, fromBill]);

  const filteredSuppliers = useMemo(() => {
    const query = supplierFilter.trim().toLocaleLowerCase();
    return (suppliers ?? []).filter(
      (item) => item.name.toLocaleLowerCase().includes(query) || item.phone?.includes(query)
    );
  }, [supplierFilter, suppliers]);
  const quotedSubtotal = lines.reduce((sum, line) => sum + (lineSubtotal(line, currency) ?? 0), 0);
  const generatedDescription = buildDescription(lines, receiptNumber);
  const effectiveDescription = description.trim() || generatedDescription;

  const updateLine = (updated: PurchaseLineDraft) =>
    setLines((current) => current.map((line) => (line.key === updated.key ? updated : line)));
  const removeLine = (key: string) =>
    setLines((current) => current.filter((line) => line.key !== key));
  const chooseCurrency = (next: PurchaseCurrency) => {
    if (next === currency) return;
    setCurrency(next);
    setBilledTotal('');
    setLines((current) =>
      current.map((line) => ({
        ...line,
        unitPrice: '',
        amount: '',
        product:
          line.product && (line.product.priceCurrency ?? 'USD') === next ? line.product : null,
      }))
    );
    setBanner({
      tone: 'warning',
      message: 'Re-enter prices and invoice total in the new currency',
    });
  };

  const review = async () => {
    const issue = issueForInvoice(
      lines,
      currency,
      receiveStock,
      transactionDate,
      dueDate,
      billedTotal
    );
    if (issue) {
      setBanner({ tone: 'warning', message: issue });
      return;
    }
    if (effectiveDescription.length < 3) {
      setBanner({ tone: 'warning', message: 'Enter a purchase description' });
      return;
    }
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
      else if (error instanceof BackendTooOldError) {
        // Hard-stop before Review: an older shop PC cannot tell us whether
        // this invoice number is already recorded, and we must not post a
        // duplicate on their behalf.
        setBanner({
          tone: 'danger',
          message:
            'Shop PC is older than this app. Ask the admin to update HomeConnect on the PC, then try again',
        });
      } else
        setBanner({
          tone: 'danger',
          message: error instanceof HcApiError ? error.message : 'Could not check invoice number',
        });
    } finally {
      setReviewing(false);
    }
  };

  const submit = async () => {
    if (!supplier || submitting || (duplicateReceipt && !duplicateConfirmed)) return;
    const issue = issueForInvoice(
      lines,
      currency,
      receiveStock,
      transactionDate,
      dueDate,
      billedTotal
    );
    if (issue) {
      setBanner({ tone: 'warning', message: issue });
      setStep('DETAILS');
      return;
    }
    const body: CreateSupplierPurchaseInput = {
      supplierId: supplier.id,
      idempotencyKey: idempotencyKey.current,
      receiptNumber: receiptNumber.trim() || undefined,
      transactionDate,
      dueDate: dueDate || undefined,
      currency,
      description: effectiveDescription,
      reference: reference.trim() || undefined,
      notes: notes.trim() || undefined,
      receiveStock,
      amountOverride: moneyText(moneyMinorUnits(billedTotal, currency)!, currency),
      amountOverrideReason: 'Supplier invoice total confirmed on mobile',
      lines: lines.map((line) => toApiLine(line, currency)),
    };
    setSubmitting(true);
    setBanner(null);
    try {
      const purchase = await recordSupplierPurchase(client, body);
      setCreated(purchase);
      if (fromBill)
        setBillResult(
          purchase.supplierId === fromBill.supplierId
            ? await linkAfterPurchase(
                client,
                { id: fromBill.billId, branchId: fromBill.billBranchId },
                purchase
              )
            : {
                linked: false,
                message:
                  'This purchase is for a different supplier than the bill, so the bill stays in the bills inbox.',
              }
        );
      setStep('DONE');
    } catch (error) {
      if (error instanceof HcApiError && error.kind === 'UNAUTHORIZED') await onSessionInvalid();
      else
        setBanner({
          tone: 'danger',
          message: error instanceof HcApiError ? error.message : 'Could not record invoice',
        });
    } finally {
      setSubmitting(false);
    }
  };

  const recordAnother = () => {
    idempotencyKey.current = newKey();
    setReceiptNumber('');
    setTransactionDate(today());
    setDueDate('');
    setCurrency('USD');
    setReceiveStock(true);
    setDescription('');
    setReference('');
    setNotes('');
    setBilledTotal('');
    setLines([newPurchaseLine(newKey())]);
    setBanner(null);
    setCreated(null);
    setBillResult(null);
    setDuplicateReceipt(false);
    setDuplicateConfirmed(false);
    setStep('DETAILS');
  };

  return (
    <FormScreen>
      {fromBill && step !== 'DONE' ? (
        <View style={{ gap: 6 }}>
          <Text style={styles.label}>Bill photo</Text>
          <BillPreview bill={{ id: fromBill.billId, branchId: fromBill.billBranchId }} compact />
        </View>
      ) : null}
      <PageTitle title="Supplier purchase" subtitle={supplier?.name} />
      {banner ? <StatusBanner tone={banner.tone} message={banner.message} /> : null}

      {step === 'SUPPLIER' && (
        <View style={styles.section}>
          <Text style={styles.step}>1 of 3 · Choose supplier</Text>
          <AppInput
            label="Search suppliers"
            value={supplierFilter}
            onChangeText={setSupplierFilter}
            placeholder="Name or phone"
          />
          {!suppliers && !banner ? <ActivityIndicator color={theme.colors.brand} /> : null}
          {!suppliers && banner ? (
            <AppButton
              label="Retry"
              onPress={() => {
                setBanner(null);
                setSupplierRetry((value) => value + 1);
              }}
            />
          ) : null}
          {suppliers?.length === 0 ? <Text style={styles.muted}>No suppliers found</Text> : null}
          {filteredSuppliers.map((item) => (
            <Pressable
              key={item.id}
              style={styles.supplierRow}
              onPress={() => {
                setSupplier(item);
                setBanner(null);
                setStep('DETAILS');
              }}
            >
              <Text style={styles.supplierName}>{item.name}</Text>
              {item.phone ? <Text style={styles.muted}>{item.phone}</Text> : null}
            </Pressable>
          ))}
          <AppButton label="Close" variant="secondary" onPress={onDone} />
        </View>
      )}

      {step === 'DETAILS' && supplier && (
        <View style={styles.section}>
          <Text style={styles.step}>2 of 3 · Invoice details</Text>
          <Text style={styles.supplierName}>{supplier.name}</Text>
          <AppInput
            label="Receipt / invoice no."
            value={receiptNumber}
            onChangeText={setReceiptNumber}
            maxLength={200}
          />
          <AppInput
            label="Purchase date (YYYY-MM-DD)"
            value={transactionDate}
            onChangeText={setTransactionDate}
            keyboardType="numbers-and-punctuation"
            maxLength={10}
          />
          <AppInput
            label="Due date (optional)"
            value={dueDate}
            onChangeText={setDueDate}
            keyboardType="numbers-and-punctuation"
            maxLength={10}
          />
          <Text style={styles.label}>Currency</Text>
          <View style={styles.choiceRow}>
            {(['USD', 'LBP'] as PurchaseCurrency[]).map((value) => (
              <Pressable
                key={value}
                style={[styles.choice, currency === value && styles.selected]}
                onPress={() => chooseCurrency(value)}
              >
                <Text style={styles.choiceText}>{value}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable
            style={styles.toggle}
            onPress={() => setReceiveStock((value) => !value)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: receiveStock }}
          >
            <Text style={styles.mark}>{receiveStock ? '☑' : '□'}</Text>
            <View style={styles.flex}>
              <Text style={styles.label}>Receive stock now</Text>
              <Text style={styles.muted}>Applies to product lines only</Text>
            </View>
          </Pressable>
          <Text style={styles.label}>Lines</Text>
          {lines.map((line, index) => (
            <PurchaseLineEditor
              key={line.key}
              line={line}
              index={index}
              currency={currency}
              receiveStock={receiveStock}
              usedProductIds={
                new Set(
                  lines
                    .filter((other) => other.key !== line.key)
                    .map((other) => other.product?.id)
                    .filter((id): id is string => Boolean(id))
                )
              }
              client={client}
              onSessionInvalid={onSessionInvalid}
              onChange={updateLine}
              onRemove={() => removeLine(line.key)}
              canRemove={lines.length > 1}
            />
          ))}
          <AppButton
            label="Add line"
            variant="secondary"
            disabled={lines.length >= 100}
            onPress={() => setLines((current) => [...current, newPurchaseLine(newKey())])}
          />
          <Text style={styles.muted}>
            Entered line amounts (VAT may change the line sum): {currency}{' '}
            {moneyText(quotedSubtotal, currency)}
          </Text>
          <AppInput
            label="Total on supplier invoice"
            value={billedTotal}
            onChangeText={setBilledTotal}
            keyboardType="decimal-pad"
          />
          <AppInput
            label="Description (optional)"
            value={description}
            onChangeText={setDescription}
            multiline
            maxLength={500}
            hint={`Suggested: ${generatedDescription || '—'}`}
          />
          <AppInput
            label="Reference (optional)"
            value={reference}
            onChangeText={setReference}
            maxLength={200}
          />
          <AppInput
            label="Notes (optional)"
            value={notes}
            onChangeText={setNotes}
            multiline
            maxLength={2000}
          />
          <AppButton label="Review invoice" onPress={() => void review()} loading={reviewing} />
          <AppButton
            label="Change supplier"
            variant="secondary"
            onPress={() => {
              setSupplier(null);
              setStep('SUPPLIER');
            }}
          />
        </View>
      )}

      {step === 'REVIEW' && supplier && (
        <View style={styles.section}>
          <Text style={styles.step}>3 of 3 · Review</Text>
          <View style={styles.summary}>
            <Text style={styles.supplierName}>{supplier.name}</Text>
            <Text style={styles.muted}>
              Invoice: {receiptNumber.trim() || '—'} · {transactionDate}
            </Text>
            <Text style={styles.muted}>Due: {dueDate || 'No due date'}</Text>
            <Text style={styles.muted}>
              Stock: {receiveStock ? 'Receive now' : 'Do not receive'}
            </Text>
            {lines.map((line, index) => (
              <View key={line.key} style={styles.reviewLine}>
                <Text style={styles.label}>
                  {index + 1}.{' '}
                  {line.kind === 'MANUAL'
                    ? line.description
                    : `${line.product?.name} × ${line.quantity}`}
                </Text>
                <Text style={styles.muted}>
                  {currency} {moneyText(lineSubtotal(line, currency) ?? 0, currency)} ·{' '}
                  {line.priceIncludesVat ? 'VAT included' : 'VAT added'}
                </Text>
              </View>
            ))}
            <Text style={styles.total}>
              Posted total: {currency} {billedTotal}
            </Text>
            <Text style={styles.muted}>No payment is recorded here</Text>
          </View>
          {duplicateReceipt ? (
            <StatusBanner
              tone="warning"
              message="This invoice number already exists for this supplier. Check before recording"
            />
          ) : null}
          {duplicateReceipt ? (
            <Pressable
              style={styles.toggle}
              onPress={() => setDuplicateConfirmed((value) => !value)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: duplicateConfirmed }}
            >
              <Text style={styles.mark}>{duplicateConfirmed ? '☑' : '□'}</Text>
              <Text style={styles.label}>I checked the existing invoice</Text>
            </Pressable>
          ) : null}
          <AppButton
            label="Record invoice"
            onPress={() => void submit()}
            loading={submitting}
            disabled={duplicateReceipt && !duplicateConfirmed}
          />
          <AppButton
            label="Edit details"
            variant="secondary"
            onPress={() => {
              setBanner(null);
              setStep('DETAILS');
            }}
          />
        </View>
      )}

      {step === 'DONE' && created && (
        <View style={styles.done}>
          <IconTile icon="checkmark-circle" tone="success" size={64} />
          <Text style={styles.title}>Purchase recorded</Text>
          <Text style={styles.total}>
            {created.currency} {created.amount}
          </Text>
          <Text style={styles.muted}>Use Supplier payment to record money paid</Text>
          {billResult ? (
            <StatusBanner
              tone={billResult.linked ? 'info' : 'warning'}
              message={billResult.message}
            />
          ) : created.supplierReceivingId ? (
            <Text style={styles.muted}>
              A bill photo can be attached from Supplier bill or the bills inbox
            </Text>
          ) : null}
          {!fromBill && <AppButton label="Record another" onPress={recordAnother} />}
          <AppButton label="Done" variant="secondary" onPress={onDone} />
        </View>
      )}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  title: { ...theme.text.headline, color: theme.colors.text },
  section: { gap: 12 },
  step: { color: theme.colors.brand, fontSize: 13, fontWeight: '800' },
  supplierRow: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  supplierName: { color: theme.colors.text, fontSize: 18, fontWeight: '800' },
  muted: { color: theme.colors.muted, fontSize: 12, lineHeight: 18 },
  label: { color: theme.colors.muted, fontSize: 14, fontWeight: '700' },
  choiceRow: { flexDirection: 'row', gap: 9 },
  choice: {
    flex: 1,
    padding: 14,
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  selected: { backgroundColor: theme.colors.brandSoft, borderColor: theme.colors.brand },
  choiceText: { color: theme.colors.text, fontWeight: '800' },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 8,
    backgroundColor: theme.colors.surface,
    borderRadius: 10,
  },
  mark: { color: theme.colors.brand, fontSize: 22 },
  flex: { flex: 1, gap: 2 },
  summary: {
    padding: 16,
    gap: 10,
    borderRadius: 14,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.brandSoft,
  },
  reviewLine: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: theme.colors.border },
  total: { color: theme.colors.brand, fontSize: 19, fontWeight: '900' },
  done: { flex: 1, minHeight: 400, justifyContent: 'center', gap: 14 },
});
