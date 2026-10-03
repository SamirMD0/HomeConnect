import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { HcApiError, AuthedClient } from '../api/hc-client';
import { PurchaseCurrency, PurchaseProduct, searchPurchaseProducts } from '../api/supplier-purchases-api';
import { AppButton } from '../components/AppButton';
import { AppInput } from '../components/AppInput';
import { StatusBanner } from '../components/StatusBanner';
import { lineIssue, lineSubtotal, moneyText, PurchaseLineDraft } from './supplier-purchase-form';

interface PurchaseLineEditorProps {
  line: PurchaseLineDraft;
  index: number;
  currency: PurchaseCurrency;
  receiveStock: boolean;
  usedProductIds: ReadonlySet<string>;
  client: AuthedClient;
  onSessionInvalid: () => Promise<void>;
  onChange: (line: PurchaseLineDraft) => void;
  onRemove: () => void;
  canRemove: boolean;
}

export function PurchaseLineEditor({
  line, index, currency, receiveStock, usedProductIds, client,
  onSessionInvalid, onChange, onRemove, canRemove,
}: PurchaseLineEditorProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [searchRetry, setSearchRetry] = useState(0);
  const [products, setProducts] = useState<PurchaseProduct[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const issue = lineIssue(line, currency, receiveStock);
  const subtotal = lineSubtotal(line, currency);

  useEffect(() => {
    if (!pickerOpen) return;
    let active = true;
    setProducts(null);
    setSearchError(null);
    const timer = setTimeout(() => {
      void searchPurchaseProducts(client, search.trim()).then((rows) => {
        if (active) setProducts(rows);
      }).catch(async (error: unknown) => {
        if (!active) return;
        if (error instanceof HcApiError && error.kind === 'UNAUTHORIZED') await onSessionInvalid();
        else setSearchError(error instanceof HcApiError ? error.message : 'Could not search products / تعذّر البحث عن المنتجات');
      });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [client, onSessionInvalid, pickerOpen, search, searchRetry]);

  const update = (values: Partial<PurchaseLineDraft>) => onChange({ ...line, ...values });
  const select = (product: PurchaseProduct) => {
    update({ product, unitPrice: line.unitPrice || product.pricing?.costPrice || '' });
    setPickerOpen(false);
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Line {index + 1} / بند {index + 1}</Text>
      <View style={styles.choiceRow}>
        <Pressable style={[styles.choice, line.kind === 'EXISTING_PRODUCT' && styles.selected]} onPress={() => update({ kind: 'EXISTING_PRODUCT', description: '', amount: '' })}>
          <Text style={styles.choiceText}>Existing product / منتج موجود</Text>
        </Pressable>
        <Pressable style={[styles.choice, line.kind === 'MANUAL' && styles.selected]} onPress={() => update({ kind: 'MANUAL', product: null, unitPrice: '' })}>
          <Text style={styles.choiceText}>Description only / وصف فقط</Text>
        </Pressable>
      </View>

      {line.kind === 'EXISTING_PRODUCT' ? (
        <>
          <AppButton label={line.product ? `${line.product.name} · ${line.product.sku}` : 'Choose product / اختر منتجاً'} variant="secondary" onPress={() => setPickerOpen(true)} />
          {line.product ? <Text style={styles.hint}>Stock / المخزون: {line.product.stockQuantity}</Text> : null}
          <AppInput label="Quantity / الكمية" value={line.quantity} onChangeText={(quantity) => update({ quantity })} keyboardType="number-pad" />
          <AppInput label={`Unit cost (${currency}) / كلفة الوحدة`} value={line.unitPrice} onChangeText={(unitPrice) => update({ unitPrice })} keyboardType="decimal-pad" />
        </>
      ) : (
        <>
          <AppInput label="Description / الوصف" value={line.description} onChangeText={(description) => update({ description })} maxLength={500} />
          <AppInput label={`Amount (${currency}) / المبلغ`} value={line.amount} onChangeText={(amount) => update({ amount })} keyboardType="decimal-pad" />
        </>
      )}

      <Pressable style={styles.vatToggle} onPress={() => update({ priceIncludesVat: !line.priceIncludesVat })} accessibilityRole="checkbox" accessibilityState={{ checked: line.priceIncludesVat }}>
        <Text style={styles.toggleMark}>{line.priceIncludesVat ? '☑' : '□'}</Text>
        <Text style={styles.vatLabel}>Price includes VAT / السعر يشمل الضريبة</Text>
      </Pressable>
      <Text style={styles.subtotal}>Quoted subtotal / المجموع المقتبس: {subtotal === null ? '—' : `${currency} ${moneyText(subtotal, currency)}`}</Text>
      {issue ? <StatusBanner tone="warning" message={issue} /> : null}
      {canRemove ? <AppButton label="Remove line / حذف البند" variant="secondary" onPress={onRemove} /> : null}

      <Modal visible={pickerOpen} animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <View style={styles.picker}>
          <Text style={styles.title}>Choose product / اختر منتجاً</Text>
          <AppInput label="Search name, SKU or barcode / بحث" value={search} onChangeText={setSearch} autoCorrect={false} />
          {searchError ? <StatusBanner tone="danger" message={searchError} /> : null}
          {searchError ? <AppButton label="Retry / إعادة المحاولة" variant="secondary" onPress={() => setSearchRetry((value) => value + 1)} /> : null}
          <ScrollView contentContainerStyle={styles.results} keyboardShouldPersistTaps="handled">
            {!products && !searchError ? <ActivityIndicator color="#047857" /> : null}
            {products?.length === 0 ? <Text style={styles.hint}>No products found / لا توجد منتجات</Text> : null}
            {products?.map((product) => {
              const unavailable = usedProductIds.has(product.id) || (product.priceCurrency ?? 'USD') !== currency
                || (receiveStock && (!product.trackStock || product.notInInventory));
              return (
                <Pressable key={product.id} disabled={unavailable} style={[styles.productRow, unavailable && styles.disabled]} onPress={() => select(product)}>
                  <Text style={styles.productName}>{product.name} · {product.model}</Text>
                  <Text style={styles.hint}>{product.sku}{unavailable ? ' · Unavailable / غير متاح' : ''}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <AppButton label="Close / إغلاق" variant="secondary" onPress={() => setPickerOpen(false)} />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 14, gap: 10, backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0' },
  title: { color: '#0f172a', fontSize: 17, fontWeight: '800' },
  choiceRow: { flexDirection: 'row', gap: 8 },
  choice: { flex: 1, minHeight: 54, padding: 8, justifyContent: 'center', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10 },
  selected: { backgroundColor: '#d1fae5', borderColor: '#047857' },
  choiceText: { color: '#0f172a', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  hint: { color: '#64748b', fontSize: 12 },
  vatToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  toggleMark: { color: '#047857', fontSize: 22 },
  vatLabel: { color: '#334155', fontSize: 13 },
  subtotal: { color: '#0f172a', fontSize: 13, fontWeight: '700' },
  picker: { flex: 1, padding: 18, gap: 12, backgroundColor: '#f8fafc' },
  results: { gap: 8, paddingBottom: 12 },
  productRow: { padding: 13, backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0' },
  productName: { color: '#0f172a', fontSize: 14, fontWeight: '700' },
  disabled: { opacity: 0.45 },
});
