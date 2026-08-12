import { StyleSheet, Text, View } from 'react-native';
import { ScanResult } from '../types/scanner.types';
import { StatusBanner } from './StatusBanner';

interface ProductResultProps {
  result: ScanResult;
}

function ResultRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text selectable style={styles.rowValue}>{value}</Text>
    </View>
  );
}

export function ProductResult({ result }: ProductResultProps) {
  if (result.status === 'INVALID_CODE') {
    return <StatusBanner tone="warning" message="This barcode or SKU is not valid / الرمز غير صالح" />;
  }

  if (result.status === 'NOT_FOUND' || !result.product) {
    return <StatusBanner tone="warning" message={`No product found for ${result.normalizedCode ?? 'this code'} / لم يتم العثور على المنتج`} />;
  }

  const product = result.product;
  return (
    <View style={styles.card}>
      <View style={styles.headingRow}>
        <View style={styles.headingText}>
          <Text style={styles.name}>{product.name}</Text>
          <Text style={styles.match}>Matched by {result.matchedBy === 'BARCODE' ? 'barcode' : 'SKU'} / تمت المطابقة</Text>
        </View>
        <View style={[styles.badge, !product.isActive && styles.archivedBadge]}>
          <Text style={[styles.badgeText, !product.isActive && styles.archivedText]}>
            {product.isActive ? 'Active / نشط' : 'Archived / مؤرشف'}
          </Text>
        </View>
      </View>
      <ResultRow label="Model / الموديل" value={product.model} />
      <ResultRow label="SKU / رمز المنتج" value={product.sku} />
      <ResultRow label="Barcode / الباركود" value={product.barcode ?? 'Not set / غير محدد'} />
      <ResultRow label="Brand / العلامة" value={product.brand ?? 'Not set / غير محدد'} />
      <ResultRow label="Product ID / معرّف المنتج" value={product.id} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#a7f3d0', borderRadius: 16, padding: 16, gap: 12 },
  headingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  headingText: { flex: 1, gap: 4 },
  name: { color: '#0f172a', fontSize: 22, fontWeight: '800' },
  match: { color: '#64748b', fontSize: 12 },
  badge: { backgroundColor: '#d1fae5', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  archivedBadge: { backgroundColor: '#f1f5f9' },
  badgeText: { color: '#047857', fontSize: 11, fontWeight: '800' },
  archivedText: { color: '#475569' },
  row: { borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 10, gap: 3 },
  rowLabel: { color: '#64748b', fontSize: 12, fontWeight: '700' },
  rowValue: { color: '#0f172a', fontSize: 15, fontWeight: '600' },
});
