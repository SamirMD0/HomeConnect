import { useState } from 'react';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
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
import { Badge, type Tone } from '../ui/Badge';
import { HeroCard, StatRow } from '../ui/Stats';

/** Badge tone by how late a customer is, matching the PC standing chips. */
const tierTone: Record<ReceivableTier, Tone> = {
  CRITICAL: 'danger',
  SEVERE: 'danger',
  LATE: 'warning',
  WATCH: 'warning',
  CURRENT: 'brand',
  NO_ACTIVITY: 'neutral',
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
  return <Badge tone={tierTone[tier]} label={receivableTierLabels[tier]} />;
}

function Totals({ summary }: { summary: ReceivablesSummary }) {
  return (
    <View style={styles.totals}>
      <HeroCard
        label="Total owed"
        value={formatMoney(summary.totalOutstanding)}
        caption={`${summary.customersWithBalance} of ${summary.customerCount} customers`}
      />
      <StatRow
        icon="alert-circle-outline"
        tone="danger"
        title="Overdue"
        detail={`${summary.customersOverdue} customers`}
        value={formatMoney(summary.totalOverdue)}
      />
      <StatRow
        icon="warning-outline"
        tone="warning"
        title="At risk"
        detail="Severe or critical"
        value={`${summary.atRiskCount} customers`}
      />
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
      empty={
        standing === 'all' && !term ? 'No customer owes money.' : 'Try another search or filter.'
      }
      header={
        <>
          {summary ? <Totals summary={summary} /> : null}
          <SearchBar
            label="Search customers"
            placeholder="Name or phone"
            value={search}
            onChangeText={setSearch}
          />
          <View style={styles.filters}>
            <View style={styles.filter}>
              <SelectFilter
                label="Standing"
                value={standing}
                options={standingOptions}
                onChange={(value) => setStanding(value as Standing)}
              />
            </View>
            <View style={styles.filter}>
              <SelectFilter
                label="Sort"
                value={sortBy}
                options={sortOptions}
                onChange={(value) => setSortBy(value as ReceivableSort)}
              />
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
          onPress={() =>
            router.push({
              pathname: '/(tabs)/sell/customer/[id]',
              params: { id: item.customer.id },
            })
          }
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  totals: { gap: theme.spacing.sm },
  filters: { flexDirection: 'row', gap: theme.spacing.sm },
  filter: { flex: 1 },
  trailing: { alignItems: 'flex-end', gap: 4 },
});
