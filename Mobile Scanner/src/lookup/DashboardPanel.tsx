import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { formatMoney, formatBusinessDate } from '@shared/money-format';
import { getDashboard, type DashboardFilters } from '../api/dashboard-api';
import { useLookup } from './useLookup';
import { ReadState } from './ReadUI';
import { RangeFilter, SelectFilter } from './FilterControls';
import { monthRange } from './filters';
import { ReceivablesCard } from '../customers/ReceivablesCard';
import { Segmented } from '../ui/Segmented';
import { StatRow } from '../ui/Stats';
import type { Tone } from '../ui/Badge';
import { theme } from '../theme';
import {
  DASHBOARD_HIDE_KEY,
  dashboardDisplayValue,
  readDashboardPrivacy,
} from './dashboard-privacy';

const kpis: Record<
  string,
  { label: string; icon: keyof typeof Ionicons.glyphMap; tone: Tone; route?: string }
> = {
  collectedToday: { label: 'Collected', icon: 'cash-outline', tone: 'success' },
  customersPaidToday: { label: 'Customers who paid', icon: 'people-outline', tone: 'success' },
  newDebtsToday: { label: 'New debts', icon: 'receipt-outline', tone: 'warning' },
  outstandingDebt: {
    label: 'Outstanding debt',
    icon: 'wallet-outline',
    tone: 'danger',
    route: '/(tabs)/sell/receivables',
  },
  owedToSuppliers: {
    label: 'Owed to suppliers',
    icon: 'business-outline',
    tone: 'brand',
    route: '/(tabs)/suppliers',
  },
  openServiceJobs: { label: 'Open service jobs', icon: 'construct-outline', tone: 'brand' },
  readyForPickup: { label: 'Ready for pickup', icon: 'bag-check-outline', tone: 'success' },
  activeProducts: {
    label: 'Active products',
    icon: 'cube-outline',
    tone: 'neutral',
    route: '/(tabs)/stock',
  },
};
type Quick = 'today' | 'week' | 'month';
const more = [
  { value: 'quarter', label: 'This quarter' },
  { value: 'year', label: 'This year' },
  { value: 'custom', label: 'Custom dates' },
];

/**
 * Owner's numbers: receivables first (blue hero), then the dashboard figures
 * for the chosen period. The eye button hides every amount, and the choice
 * is remembered on this phone.
 */
export function DashboardPanel({ refreshRevision }: { refreshRevision: number }) {
  const { client, key } = useLookup();
  const router = useRouter();
  const [hidden, setHidden] = useState(true),
    [range, setRange] = useState(monthRange),
    [period, setPeriod] = useState<DashboardFilters['range']>('today');
  useEffect(() => {
    let active = true;
    void readDashboardPrivacy(SecureStore).then((value) => {
      if (active) setHidden(value);
    });
    return () => {
      active = false;
    };
  }, []);
  const filters: DashboardFilters = {
    range: period,
    ...(period === 'custom' ? range : {}),
    includeArchived: false,
  };
  const dashboard = useQuery({
    queryKey: key('dashboard', filters),
    queryFn: () => getDashboard(client, filters),
  });
  const { refetch } = dashboard;
  useEffect(() => {
    if (refreshRevision > 0) void refetch();
  }, [refreshRevision, refetch]);
  const toggle = () =>
    setHidden((value) => {
      const next = !value;
      void SecureStore.setItemAsync(DASHBOARD_HIDE_KEY, next ? '1' : '0').catch(() => undefined);
      return next;
    });
  const quick: Quick | null =
    period === 'today' || period === 'week' || period === 'month' ? period : null;
  return (
    <View style={styles.panel}>
      <ReceivablesCard hidden={hidden} onPress={() => router.push('/(tabs)/sell/receivables')} />
      <View style={styles.head}>
        <Text accessibilityRole="header" style={styles.section}>
          Your numbers
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={hidden ? 'Show amounts' : 'Hide amounts'}
          onPress={toggle}
          hitSlop={4}
          style={({ pressed }) => [styles.eye, pressed && styles.pressed]}
        >
          <Ionicons
            name={hidden ? 'eye-off-outline' : 'eye-outline'}
            size={22}
            color={theme.colors.brandStrong}
            accessible={false}
          />
        </Pressable>
      </View>
      <Segmented<Quick>
        label="Period"
        value={quick ?? 'today'}
        onChange={setPeriod}
        options={[
          { value: 'today', label: 'Today' },
          { value: 'week', label: 'Week' },
          { value: 'month', label: 'Month' },
        ]}
      />
      <SelectFilter
        label="Period"
        emptyLabel="Quarter, year or custom dates"
        value={quick ? '' : period}
        options={more}
        onChange={(value) => setPeriod(value as DashboardFilters['range'])}
      />
      {period === 'custom' && <RangeFilter value={range} onChange={setRange} />}
      <ReadState query={dashboard} />
      {dashboard.data && (
        <>
          <Text style={styles.range}>
            {formatBusinessDate(dashboard.data.meta.range.from)} –{' '}
            {formatBusinessDate(dashboard.data.meta.range.to)}
          </Text>
          {dashboard.data.data.kpis.map((item) => {
            const meta = kpis[item.key] ?? {
              label: item.key,
              icon: 'stats-chart-outline' as const,
              tone: 'neutral' as Tone,
            };
            const formatted =
              item.valueKind === 'money' ? formatMoney(String(item.value)) : String(item.value);
            return (
              <View key={item.key} testID={`kpi-${item.key}`}>
                <StatRow
                  icon={meta.icon}
                  tone={meta.tone}
                  title={meta.label}
                  detail={item.key === 'activeProducts' ? 'All branches' : undefined}
                  value={dashboardDisplayValue(hidden, formatted)}
                  onPress={meta.route ? () => router.push(meta.route as never) : undefined}
                />
              </View>
            );
          })}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: theme.spacing.md },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: theme.spacing.sm,
  },
  section: { ...theme.text.title, color: theme.colors.text },
  eye: {
    width: theme.touch,
    height: theme.touch,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.pill,
  },
  pressed: { backgroundColor: theme.colors.brandSoft },
  range: { ...theme.text.caption, color: theme.colors.muted },
});
