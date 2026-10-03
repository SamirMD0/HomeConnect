import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { HcApiError } from '../api/hc-client';
import { clientFrom } from '../api/products-api';
import { fetchSupplierLedger, SupplierLedgerEntry, SupplierLedgerResult } from '../api/supplier-ledger-api';
import { listSuppliers, SupplierSummary } from '../api/suppliers-api';
import { AppButton } from '../components/AppButton';
import { AppInput } from '../components/AppInput';
import { StatusBanner } from '../components/StatusBanner';
import { ConnectionSettings } from '../types/scanner.types';

interface SupplierStatementScreenProps {
  connection: ConnectionSettings;
  token: string;
  onDone: () => void;
  onSessionInvalid: () => Promise<void>;
}

type Banner = { tone: 'danger' | 'warning'; message: string; retry?: boolean };
type DateField = 'from' | 'to';

const today = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const validDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

const money = (value: number) => `${value < 0 ? '−' : ''}USD ${Math.abs(value).toFixed(2)}`;
const typeLabels: Record<SupplierLedgerEntry['type'], string> = {
  PU: 'Purchase / شراء',
  PV: 'Payment / دفعة',
  ADJ: 'Adjustment / تسوية',
  OPENING: 'Opening / افتتاحي',
  OTHER: 'Other / أخرى',
};

function TransactionCard({ entry }: { entry: SupplierLedgerEntry }) {
  const day = new Date(`${entry.date}T00:00:00.000Z`);
  const weekday = day.toLocaleDateString('en', { weekday: 'short', timeZone: 'UTC' });
  const value = entry.debit > 0 ? entry.debit : entry.credit;
  const isDebit = entry.debit > 0;
  return (
    <View style={styles.transaction}>
      <View style={styles.dateColumn}>
        <Text style={styles.shortDate}>{entry.date.slice(8, 10)}/{entry.date.slice(5, 7)}</Text>
        <Text style={styles.weekday}>{weekday}</Text>
      </View>
      <View style={styles.transactionBody}>
        <View style={styles.transactionTop}>
          <Text style={[styles.typePill, styles[entry.type]]}>{typeLabels[entry.type]}</Text>
          {entry.reference ? <Text style={styles.reference} numberOfLines={1}>{entry.reference}</Text> : null}
        </View>
        <Text style={styles.description} numberOfLines={2}>{entry.description}</Text>
        <Text style={[styles.movement, isDebit ? styles.owedMore : styles.owedLess]}>
          {isDebit ? '+' : '−'}{money(value)}
        </Text>
        <Text style={styles.running}>Balance / الرصيد: {money(entry.balance)}</Text>
      </View>
    </View>
  );
}

export function SupplierStatementScreen({
  connection,
  token,
  onDone,
  onSessionInvalid,
}: SupplierStatementScreenProps) {
  const client = useMemo(() => clientFrom(connection, token), [connection, token]);
  const currentDate = useMemo(today, []);
  const [suppliers, setSuppliers] = useState<SupplierSummary[] | null>(null);
  const [supplierRetry, setSupplierRetry] = useState(0);
  const [filter, setFilter] = useState('');
  const [supplier, setSupplier] = useState<SupplierSummary | null>(null);
  const [from, setFrom] = useState(`${currentDate.slice(0, 4)}-01-01`);
  const [to, setTo] = useState(currentDate);
  const [dateField, setDateField] = useState<DateField | null>(null);
  const [dateDraft, setDateDraft] = useState('');
  const [dateError, setDateError] = useState<string | null>(null);
  const [result, setResult] = useState<SupplierLedgerResult | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const requestId = useRef(0);
  const loadingMoreRef = useRef(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const rows = await listSuppliers(client);
        if (active) setSuppliers(rows);
      } catch (error) {
        if (!active) return;
        if (error instanceof HcApiError && error.kind === 'UNAUTHORIZED') await onSessionInvalid();
        else setBanner({ tone: 'danger', message: 'Could not load suppliers / تعذّر تحميل المورّدين', retry: true });
      }
    })();
    return () => { active = false; };
  }, [client, onSessionInvalid, supplierRetry]);

  const filteredSuppliers = useMemo(() => {
    const query = filter.trim().toLocaleLowerCase();
    return (suppliers ?? []).filter((row) =>
      row.name.toLocaleLowerCase().includes(query) || row.phone?.includes(query));
  }, [filter, suppliers]);

  const loadFirst = useCallback(async (refresh = false) => {
    if (!supplier) return;
    const currentRequest = ++requestId.current;
    loadingMoreRef.current = false;
    setLoadingMore(false);
    if (refresh) setRefreshing(true);
    else { setLoading(true); setResult(null); }
    setBanner(null);
    try {
      const next = await fetchSupplierLedger(client, { supplierId: supplier.id, from, to, page: 1 });
      if (currentRequest === requestId.current) setResult(next);
    } catch (error) {
      if (currentRequest !== requestId.current) return;
      if (error instanceof HcApiError && error.kind === 'UNAUTHORIZED') await onSessionInvalid();
      else setBanner({
        tone: 'danger',
        message: error instanceof HcApiError ? error.message : 'Could not load statement / تعذّر تحميل كشف الحساب',
        retry: error instanceof HcApiError && error.kind === 'NETWORK',
      });
    } finally {
      if (currentRequest === requestId.current) { setLoading(false); setRefreshing(false); }
    }
  }, [client, from, onSessionInvalid, supplier, to]);

  useEffect(() => {
    if (supplier) void loadFirst();
    return () => { requestId.current += 1; };
  }, [loadFirst, supplier]);

  const loadMore = async () => {
    if (!supplier || !result || loading || refreshing || loadingMoreRef.current || result.page >= result.totalPages) return;
    const currentRequest = requestId.current;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const next = await fetchSupplierLedger(client, {
        supplierId: supplier.id, from, to, page: result.page + 1,
        balanceBeforePage: result.entries.at(-1)?.balance ?? result.openingBalance,
      });
      if (currentRequest === requestId.current) {
        setResult({ ...next, entries: [...result.entries, ...next.entries] });
      }
    } catch (error) {
      if (currentRequest !== requestId.current) return;
      if (error instanceof HcApiError && error.kind === 'UNAUTHORIZED') await onSessionInvalid();
      else setBanner({
        tone: 'danger',
        message: error instanceof HcApiError ? error.message : 'Could not load more transactions / تعذّر تحميل المزيد',
        retry: error instanceof HcApiError && error.kind === 'NETWORK',
      });
    } finally {
      if (currentRequest === requestId.current) { loadingMoreRef.current = false; setLoadingMore(false); }
    }
  };

  const openDate = (field: DateField) => {
    setDateField(field);
    setDateDraft(field === 'from' ? from : to);
    setDateError(null);
  };

  const saveDate = () => {
    if (!validDate(dateDraft) || (dateField === 'from' && dateDraft > to) || (dateField === 'to' && dateDraft < from)) {
      setDateError('Enter a valid YYYY-MM-DD date within the range / أدخل تاريخاً صحيحاً ضمن المدة');
      return;
    }
    if (dateField === 'from') setFrom(dateDraft);
    if (dateField === 'to') setTo(dateDraft);
    setDateField(null);
  };

  const changeSupplier = () => {
    requestId.current += 1;
    loadingMoreRef.current = false;
    setSupplier(null);
    setResult(null);
    setBanner(null);
    setLoading(false);
    setRefreshing(false);
    setLoadingMore(false);
  };

  const change = result ? result.closingBalance - result.openingBalance : 0;
  const header = (
    <View style={styles.headerCard}>
      <Text style={styles.supplierName}>{supplier?.name}</Text>
      {supplier?.phone ? <Text style={styles.supplierPhone}>{supplier.phone}</Text> : null}
      <Text style={styles.caption}>Statement of Account / كشف حساب المورّد</Text>
      <View style={styles.dateRow}>
        <Pressable style={styles.dateChip} onPress={() => openDate('from')} accessibilityRole="button">
          <Text style={styles.dateLabel}>From / من</Text><Text style={styles.dateValue}>{from}</Text>
        </Pressable>
        <Pressable style={styles.dateChip} onPress={() => openDate('to')} accessibilityRole="button">
          <Text style={styles.dateLabel}>To / إلى</Text><Text style={styles.dateValue}>{to}</Text>
        </Pressable>
      </View>
      <View style={styles.stats}>
        <View style={styles.stat}><Text style={styles.statLabel}>Opening / افتتاحي</Text><Text style={styles.statValue}>{result ? money(result.openingBalance) : '—'}</Text></View>
        <View style={styles.stat}><Text style={styles.statLabel}>Change / التغيّر</Text><Text style={[styles.statValue, change > 0 ? styles.owedMore : styles.owedLess]}>{result ? `${change >= 0 ? '+' : '−'}${money(change)}` : '—'}</Text></View>
        <View style={styles.stat}><Text style={styles.statLabel}>Closing / نهائي</Text><Text style={styles.statValue}>{result ? money(result.closingBalance) : '—'}</Text></View>
      </View>
      <Text style={styles.usdNote}>Balances shown in USD / الأرصدة معروضة بالدولار</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      {!supplier ? (
        <ScrollView contentContainerStyle={styles.picker} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Supplier statement / كشف حساب المورّد</Text>
          <Text style={styles.caption}>Choose supplier / اختر المورّد</Text>
          {banner && <StatusBanner tone={banner.tone} message={banner.message} />}
          {banner?.retry ? <AppButton label="Retry / إعادة المحاولة" onPress={() => setSupplierRetry((value) => value + 1)} /> : null}
          <AppInput label="Search suppliers / بحث عن مورّد" value={filter} onChangeText={setFilter} placeholder="Name or phone" />
          {!suppliers ? <ActivityIndicator color="#047857" /> : filteredSuppliers.length === 0 ? (
            <Text style={styles.empty}>No suppliers found / لم يتم العثور على مورّدين</Text>
          ) : filteredSuppliers.map((row) => (
            <Pressable key={row.id} onPress={() => { setSupplier(row); setBanner(null); }} style={styles.supplierRow}>
              <Text style={styles.rowName}>{row.name}</Text>
              {row.phone ? <Text style={styles.supplierPhone}>{row.phone}</Text> : null}
            </Pressable>
          ))}
          <AppButton label="Close / إغلاق" variant="secondary" onPress={onDone} />
        </ScrollView>
      ) : (
        <>
          {banner ? <View style={styles.banner}><StatusBanner tone={banner.tone} message={banner.message} />
            {banner.retry ? <AppButton label="Retry / إعادة المحاولة" onPress={() => void loadFirst(true)} /> : null}
          </View> : null}
          <FlatList
            data={result?.entries ?? []}
            keyExtractor={(entry) => entry.id}
            renderItem={({ item }) => <TransactionCard entry={item} />}
            ListHeaderComponent={header}
            ListEmptyComponent={loading ? <ActivityIndicator style={styles.loader} color="#047857" /> :
              result ? <Text style={styles.empty}>No transactions in this range / لا توجد حركات</Text> : null}
            ListFooterComponent={loadingMore ? <ActivityIndicator style={styles.loader} color="#047857" /> : null}
            onRefresh={() => void loadFirst(true)}
            refreshing={refreshing}
            onEndReached={() => void loadMore()}
            onEndReachedThreshold={0.3}
            contentContainerStyle={styles.list}
          />
          <View style={styles.footer}>
            <AppButton label="Change supplier / تغيير المورّد" variant="secondary" onPress={changeSupplier} />
            <AppButton label="Close / إغلاق" variant="secondary" onPress={onDone} />
          </View>
        </>
      )}
      <Modal visible={dateField !== null} transparent animationType="fade" onRequestClose={() => setDateField(null)}>
        <View style={styles.dateBackdrop}>
          <View style={styles.dateDialog}>
            <Text style={styles.dialogTitle}>{dateField === 'from' ? 'From / من' : 'To / إلى'}</Text>
            <AppInput label="Date / التاريخ" value={dateDraft} onChangeText={setDateDraft} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" maxLength={10} />
            {dateError ? <StatusBanner tone="danger" message={dateError} /> : null}
            <AppButton label="Save / حفظ" onPress={saveDate} />
            <AppButton label="Cancel / إلغاء" variant="secondary" onPress={() => setDateField(null)} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  picker: { padding: 18, gap: 12 },
  title: { color: '#0f172a', fontSize: 23, fontWeight: '900' },
  caption: { color: '#64748b', fontSize: 13 },
  empty: { color: '#64748b', textAlign: 'center', padding: 24 },
  supplierRow: { padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#fff' },
  rowName: { color: '#0f172a', fontSize: 16, fontWeight: '700' },
  supplierPhone: { color: '#64748b', fontSize: 12, marginTop: 3 },
  list: { padding: 14, gap: 10 },
  banner: { padding: 14, gap: 8 },
  loader: { margin: 24 },
  headerCard: { padding: 18, gap: 10, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#d1fae5' },
  supplierName: { color: '#0f172a', fontSize: 22, fontWeight: '900' },
  dateRow: { flexDirection: 'row', gap: 9 },
  dateChip: { flex: 1, padding: 10, borderRadius: 10, backgroundColor: '#f1f5f9' },
  dateLabel: { color: '#64748b', fontSize: 11, fontWeight: '700' },
  dateValue: { color: '#0f172a', fontSize: 13, fontWeight: '800', marginTop: 3 },
  stats: { flexDirection: 'row', gap: 6 },
  stat: { flex: 1, padding: 8, borderRadius: 10, backgroundColor: '#f8fafc', minWidth: 0 },
  statLabel: { color: '#64748b', fontSize: 10, fontWeight: '700' },
  statValue: { color: '#0f172a', fontSize: 12, fontWeight: '800', marginTop: 5 },
  usdNote: { color: '#64748b', fontSize: 11 },
  transaction: { flexDirection: 'row', gap: 12, padding: 14, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0' },
  dateColumn: { width: 52, alignItems: 'center' },
  shortDate: { color: '#0f172a', fontSize: 16, fontWeight: '900' },
  weekday: { color: '#64748b', fontSize: 11, marginTop: 4 },
  transactionBody: { flex: 1, gap: 7 },
  transactionTop: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  typePill: { overflow: 'hidden', borderRadius: 7, paddingHorizontal: 7, paddingVertical: 4, fontSize: 11, fontWeight: '800' },
  PU: { color: '#334155', backgroundColor: '#e2e8f0' },
  PV: { color: '#047857', backgroundColor: '#d1fae5' },
  ADJ: { color: '#92400e', backgroundColor: '#fef3c7' },
  OPENING: { color: '#075985', backgroundColor: '#e0f2fe' },
  OTHER: { color: '#52525b', backgroundColor: '#f4f4f5' },
  reference: { flex: 1, color: '#64748b', fontSize: 11, textAlign: 'right' },
  description: { color: '#0f172a', fontSize: 14, lineHeight: 19 },
  movement: { fontSize: 15, fontWeight: '800', textAlign: 'right' },
  owedMore: { color: '#be123c' },
  owedLess: { color: '#047857' },
  running: { color: '#64748b', fontSize: 11, textAlign: 'right' },
  footer: { padding: 12, gap: 8, borderTopWidth: 1, borderTopColor: '#e2e8f0', backgroundColor: '#fff' },
  dateBackdrop: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#0f172a99' },
  dateDialog: { padding: 18, gap: 12, borderRadius: 14, backgroundColor: '#fff' },
  dialogTitle: { color: '#0f172a', fontSize: 19, fontWeight: '800' },
});
