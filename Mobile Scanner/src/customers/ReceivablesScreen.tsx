import { useState } from 'react';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { formatMoney } from '@shared/money-format';
import {
  getReceivablesPage,
  overdueTiers,
  receivableTierLabels,
  receivableTierOrder,
  type ReceivableItem,
  type ReceivablesPage,
  type ReceivableSort,
  type ReceivablesSummary,
  type ReceivableTier,
} from '../api/receivables-api';
import { ListRow } from '../components/ListRow';
import { MoneyText } from '../components/MoneyText';
import { SearchBar } from '../components/SearchBar';
import { LookupList } from '../lookup/LookupList';
import { SelectFilter, useDebouncedSearch } from '../lookup/FilterControls';
import { useLookup, useLookupPages } from '../lookup/useLookup';
import { theme } from '../theme';

/** Badge colours by how late a customer is, matching the PC standing chips. */
const tierTone: Record<ReceivableTier, { fg: string; bg: string }> = {
  CRITICAL: { fg: theme.colors.danger, bg: theme.colors.dangerSoft },
  SEVERE: { fg: theme.colors.danger, bg: theme.colors.dangerSoft },
  LATE: { fg: theme.colors.warning, bg: theme.colors.warningSoft },
  WATCH: { fg: theme.colors.warning, bg: theme.colors.warningSoft },
  CURRENT: { fg: theme.colors.brandStrong, bg: theme.colors.brandSoft },
  NO_ACTIVITY: { fg: theme.colors.muted, bg: theme.colors.neutralSoft },
};

type Standing = 'all' | 'overdue' | ReceivableTier;
const standingOptions = [
  { value: 'all', label: 'All' },
  { value: 'overdue', label: 'Overdue' },
  ...receivableTierOrder.map((tier) => ({ value: tier, label: receivableTierLabels[tier] })),
];
const sortOptions: { value: ReceivableSort; label: string }[] = [
  { value: 'outstanding', label: 'Amount owed' },
  { value: 'overdue', label: 'Days overdue' },
  { value: 'name', label: 'Name' },
];
const tiersFor = (standing: Standing): ReceivableTier[] =>
  standing === 'all' ? [] : standing === 'overdue' ? overdueTiers : [standing];

export function TierBadge({ tier }: { tier: ReceivableTier }) {
  const tone = tierTone[tier];
  return (
    <View style={[styles.badge, { backgroundColor: tone.bg }]}>
      <Text style={[styles.badgeText, { color: tone.fg }]}>{receivableTierLabels[tier]}</Text>
    </View>
  );
}

function Totals({ summary }: { summary: ReceivablesSummary }) {
  return (
    <View style={styles.totals}>
      <View style={[styles.total, styles.totalWide]}>
        <Text style={[styles.totalLabel, styles.onBrand]}>Total owed</Text>
        <Text style={[styles.totalValue, styles.onBrand]}>{formatMoney(summary.totalOutstanding)}</Text>
        <Text style={[styles.totalCaption, styles.onBrand]}>
          {summary.customersWithBalance} of {summary.customerCount} customers
        </Text>
      </View>
      <View style={styles.total}>
        <Text style={styles.totalLabel}>Overdue</Text>
        <Text style={[styles.totalValue, styles.small, { color: theme.colors.danger }]}>
          {formatMoney(summary.totalOverdue)}
        </Text>
        <Text style={styles.totalCaption}>{summary.customersOverdue} customers</Text>
      </View>
      <View style={styles.total}>
        <Text style={styles.totalLabel}>At risk</Text>
        <Text style={[styles.totalValue, styles.small]}>{summary.atRiskCount}</Text>
        <Text style={styles.totalCaption}>customers</Text>
      </View>
    </View>
  );
}

/**
 * Receivables: who owes money, worst first. Same data and standings as the PC
 * Receivables page, for the branch chosen in the header.
 */
export function ReceivablesScreen() {
  const { client, key, session } = useLookup(),
    router = useRouter();
  const [search, setSearch] = useState(''),
    term = useDebouncedSearch(search),
    [standing, setStanding] = useState<Standing>('all'),
    [sortBy, setSortBy] = useState<ReceivableSort>('outstanding');
  const filters = { search: term, tiers: tiersFor(standing), sortBy };
  const receivables = useLookupPages(
    key('receivables', filters),
    (page) => getReceivablesPage(client, filters, page),
    session.can('sell')
  );
  // Every page carries the totals; the first one is enough.
  const summary = (receivables.data?.pages[0] as ReceivablesPage | undefined)?.summary;
  return (
    <LookupList<ReceivableItem>
      title="Receivables"
      query={receivables}
      itemKey={(item) => `${item.branchId}:${item.customer.id}`}
      empty={standing === 'all' && !term ? 'No customer owes money.' : 'Try another search or filter.'}
      header={
        <>
          {summary ? <Totals summary={summary} /> : null}
          <SearchBar label="Search customers" placeholder="Name or phone" value={search} onChangeText={setSearch} />
          <View style={styles.filters}>
            <View style={styles.filter}>
              <SelectFilter label="Standing" value={standing} options={standingOptions} onChange={(value) => setStanding(value as Standing)} />
            </View>
            <View style={styles.filter}>
              <SelectFilter label="Sort" value={sortBy} options={sortOptions} onChange={(value) => setSortBy(value as ReceivableSort)} />
            </View>
          </View>
        </>
      }
      renderItem={(item) => (
        <ListRow
          title={item.customer.name}
          subtitle={`${item.tierReason}${item.customer.phone ? `\n${item.customer.phone}` : ''}`}
          trailing={
            <View style={styles.trailing}>
              <MoneyText value={item.outstanding} />
              <TierBadge tier={item.tier} />
            </View>
          }
          onPress={() => router.push({ pathname: '/(tabs)/sell/customer/[id]', params: { id: item.customer.id } })}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  totals: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  total: {
    flexGrow: 1,
    flexBasis: '40%',
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 2,
  },
  totalWide: { flexBasis: '100%', backgroundColor: theme.colors.brand, borderColor: theme.colors.brand },
  totalLabel: { fontSize: theme.type.caption, fontWeight: '700', color: theme.colors.muted },
  totalValue: { fontSize: theme.type.heading, fontWeight: '800', color: theme.colors.text, fontVariant: ['tabular-nums'] },
  onBrand: { color: theme.colors.white },
  small: { fontSize: theme.type.title },
  totalCaption: { fontSize: theme.type.caption, color: theme.colors.subtle },
  filters: { flexDirection: 'row', gap: theme.spacing.sm },
  filter: { flex: 1 },
  trailing: { alignItems: 'flex-end', gap: 4 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: theme.radius.pill },
  badgeText: { fontSize: theme.type.caption, fontWeight: '700' },
});
