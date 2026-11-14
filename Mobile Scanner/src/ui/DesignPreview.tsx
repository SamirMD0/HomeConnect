import { useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme';
import {
  ActionBar,
  ActionBarMain,
  AppButton,
  Badge,
  DataTable,
  FormScreen,
  HeroCard,
  PageTitle,
  QuickGrid,
  Segmented,
  StatRow,
  TextField,
  TrendChip,
} from './index';

/**
 * Admin-only preview of the Phase C components with sample figures, for
 * checking a new APK on a real phone. Every figure here is sample data.
 */
export function DesignPreview() {
  const [period, setPeriod] = useState<'today' | 'yesterday' | 'week'>('today');
  const rows = [
    { id: '1', name: 'TR-0001', user: 'Sample', cash: '54,870.17', sale: '613,254.00', late: false },
    { id: '2', name: 'TR-0002', user: 'Sample', cash: '1,200.00', sale: '9,410.50', late: true },
    { id: '3', name: 'TR-0003', user: 'Sample', cash: '0.00', sale: '780.00', late: false },
  ];
  const noop = () => undefined;
  return (
    <FormScreen
      footer={
        <ActionBar>
          <AppButton label="Reset" icon="refresh" variant="danger" solid iconOnly onPress={noop} />
          <ActionBarMain>
            <AppButton label="Save & print" icon="print-outline" variant="success" onPress={noop} />
          </ActionBarMain>
          <AppButton label="Save" icon="save-outline" iconOnly onPress={noop} />
        </ActionBar>
      }
    >
      <PageTitle title="Design preview" subtitle="Sample figures only" />
      <HeroCard label="Total owed" value="$125,689.00" caption="12 of 40 customers" trend={<TrendChip value={15.3} inverted />} />
      <Section title="Rows">
        <StatRow icon="cash-outline" tone="success" title="Collected" detail="Today" value="$95,499" chip={<TrendChip value={15.3} />} />
        <StatRow icon="business-outline" tone="danger" title="Owed to suppliers" detail="Today" value="$12,040" chip={<TrendChip value={-4.2} inverted />} />
      </Section>
      <Section title="Quick actions">
        <QuickGrid
          actions={[
            { label: 'New order', icon: 'cart-outline', onPress: noop },
            { label: 'Receive', icon: 'cube-outline', onPress: noop },
            { label: 'Bill photo', icon: 'camera-outline', onPress: noop, badge: 3 },
            { label: 'Payment', icon: 'wallet-outline', onPress: noop, tone: 'success' },
          ]}
        />
      </Section>
      <Segmented label="Period" value={period} onChange={setPeriod} options={[{ value: 'today', label: 'Today' }, { value: 'yesterday', label: 'Yesterday' }, { value: 'week', label: 'Week' }]} />
      <Section title="Badges">
        <View style={styles.wrap}>
          <Badge label="Current" tone="brand" />
          <Badge label="Paid" tone="success" />
          <Badge label="Late 45 days" tone="warning" />
          <Badge label="Critical" tone="danger" />
          <Badge label="No activity" />
        </View>
      </Section>
      <Section title="Fields">
        <TextField label="PC address" required icon="desktop-outline" placeholder="192.168.1.20" keyboardType="numeric" />
        <TextField label="Password" required icon="lock-closed-outline" secureTextEntry placeholder="Password" />
        <TextField label="Amount" error="Enter a positive amount" defaultValue="-5" keyboardType="decimal-pad" />
      </Section>
      <Section title="Buttons">
        <AppButton label="Primary" onPress={noop} />
        <AppButton label="Tonal" variant="tonal" onPress={noop} />
        <AppButton label="Outlined" variant="secondary" onPress={noop} />
        <AppButton label="Delete" variant="danger" onPress={noop} />
      </Section>
      <Section title="Table">
        <DataTable
          caption="Sample cash counters"
          rowKey={(row) => row.id}
          rows={rows}
          alert={(row) => row.late}
          columns={[
            { key: 'name', label: 'Counter', width: 84, render: (row) => row.name },
            { key: 'user', label: 'User', width: 84, render: (row) => row.user },
            { key: 'cash', label: 'Cash in hand', width: 104, align: 'right', render: (row) => row.cash },
            { key: 'sale', label: 'Total sale', width: 112, align: 'right', render: (row) => row.sale },
          ]}
        />
      </Section>
    </FormScreen>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>
        {title}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: theme.spacing.sm, marginTop: theme.spacing.sm },
  sectionTitle: { ...theme.text.titleSmall, color: theme.colors.text },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
});
