import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Text, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { formatMoney, formatBusinessDate } from '@shared/money-format';
import { getDashboard, type DashboardFilters } from '../api/dashboard-api';
import { useLookup } from './useLookup';
import { Card, ReadState, readStyles } from './ReadUI';
import { SelectFilter, RangeFilter } from './FilterControls';
import { monthRange } from './filters';
import { AppButton } from '../components/AppButton';
import {
  DASHBOARD_HIDE_KEY,
  dashboardDisplayValue,
  readDashboardPrivacy,
} from './dashboard-privacy';
const labels: Record<string, string> = {
  collectedToday: 'Collected today',
  customersPaidToday: 'Customers paid today',
  newDebtsToday: 'New debts today',
  outstandingDebt: 'Outstanding debt',
  owedToSuppliers: 'Owed to suppliers',
  openServiceJobs: 'Open service jobs',
  readyForPickup: 'Ready for pickup',
  activeProducts: 'Active products · all branches',
};
export function DashboardPanel({ refreshRevision }: { refreshRevision: number }) {
  const { client, key } = useLookup();
  const [hidden, setHidden] = useState(true),
    [range, setRange] = useState(monthRange),
    [period, setPeriod] = useState<DashboardFilters['range']>('month');
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
  const toggle = () => {
    setHidden((value) => {
      const next = !value;
      void SecureStore.setItemAsync(DASHBOARD_HIDE_KEY, next ? '1' : '0').catch(() => undefined);
      return next;
    });
  };
  return (
    <View style={{ gap: 12 }}>
      <Text accessibilityRole="header" style={readStyles.section}>
        Dashboard
      </Text>
      <AppButton
        label={hidden ? 'Show dashboard numbers' : 'Hide dashboard numbers'}
        variant="secondary"
        onPress={toggle}
      />
      <SelectFilter
        label="Dashboard period"
        value={period}
        onChange={(value) => setPeriod(value as typeof period)}
        options={[
          { value: 'today', label: 'Today' },
          { value: 'week', label: 'This week' },
          { value: 'month', label: 'This month' },
          { value: 'quarter', label: 'This quarter' },
          { value: 'year', label: 'This year' },
          { value: 'custom', label: 'Custom dates' },
        ]}
      />
      {period === 'custom' && <RangeFilter value={range} onChange={setRange} />}
      <ReadState query={dashboard} />
      {dashboard.data && (
        <>
          <Text style={readStyles.subtitle}>
            {formatBusinessDate(dashboard.data.meta.range.from)} –{' '}
            {formatBusinessDate(dashboard.data.meta.range.to)}
          </Text>
          {dashboard.data.data.kpis.map((item) => (
            <Card key={item.key}>
              <Text style={readStyles.subtitle}>{labels[item.key] ?? item.key}</Text>
              <Text
                testID={`kpi-${item.key}`}
                style={{ ...readStyles.title, fontVariant: ['tabular-nums'] }}
                accessibilityLabel={`${labels[item.key] ?? item.key}: ${hidden ? 'hidden' : item.valueKind === 'money' ? formatMoney(String(item.value)) : item.value}`}
              >
                {dashboardDisplayValue(
                  hidden,
                  item.valueKind === 'money' ? formatMoney(String(item.value)) : String(item.value)
                )}
              </Text>
            </Card>
          ))}
        </>
      )}
    </View>
  );
}
