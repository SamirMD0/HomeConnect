import { theme } from '../theme';
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
    return <StatusBanner tone="warning" message="This barcode or SKU is not valid" />;
  }

  if (result.status === 'NOT_FOUND' || !result.product) {
    return <StatusBanner tone="warning" message={`No product found for ${result.normalizedCode ?? 'this code'}`} />;
  }

  const product = result.product;
  return (
    <View style={styles.card}>
      <View style={styles.headingRow}>
        <View style={styles.headingText}>
          <Text style={styles.name}>{product.name}</Text>
          <Text style={styles.match}>Matched by {result.matchedBy === 'BARCODE' ? 'barcode' : 'SKU'}</Text>
        </View>
        <View style={[styles.badge, !product.isActive && styles.archivedBadge]}>
          <Text style={[styles.badgeText, !product.isActive && styles.archivedText]}>
            {product.isActive ? 'Active' : 'Archived'}
          </Text>
        </View>
      </View>
      <ResultRow label="Model" value={product.model} />
      <ResultRow label="SKU" value={product.sku} />
      <ResultRow label="Barcode" value={product.barcode ?? 'Not set'} />
      <ResultRow label="Brand" value={product.brand ?? 'Not set'} />
      <ResultRow label="Product ID" value={product.id} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.successBorder, borderRadius: 16, padding: 16, gap: 12 },
  headingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  headingText: { flex: 1, gap: 4 },
  name: { color: theme.colors.text, fontSize: 22, fontWeight: '800' },
  match: { color: theme.colors.muted, fontSize: 12 },
  badge: { backgroundColor: theme.colors.successSoft, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  archivedBadge: { backgroundColor: theme.colors.neutralSoft },
  badgeText: { color: theme.colors.success, fontSize: 11, fontWeight: '800' },
  archivedText: { color: theme.colors.muted },
  row: { borderTopWidth: 1, borderTopColor: theme.colors.neutralSoft, paddingTop: 10, gap: 3 },
  rowLabel: { color: theme.colors.muted, fontSize: 12, fontWeight: '700' },
  rowValue: { color: theme.colors.text, fontSize: 15, fontWeight: '600' },
});
