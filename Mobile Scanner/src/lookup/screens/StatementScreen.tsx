import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { formatBusinessDate, formatMoney } from '@shared/money-format';
import { getCustomerStatement } from '../../api/customers-api';
import { getSupplierStatement } from '../../api/supplier-lookup-api';
import { useLookup } from '../useLookup';
import { Card, Field, ReadScreen, ReadState, readStyles } from '../ReadUI';
import { Text } from 'react-native';
import { PageTitle } from '../../ui/ScreenHeader';
import { HeroCard } from '../../ui/Stats';
import { DataTable } from '../../ui/DataTable';
import { EmptyState } from '../../components/EmptyState';
import { RangeFilter } from '../FilterControls';
import { humanLabel, monthRange } from '../filters';
/** Balances and all entry amounts come from the desktop document endpoint. */
export function StatementScreen({ party }: { party: 'customer' | 'supplier' }) {
  const { id = '' } = useLocalSearchParams<{ id: string }>(),
    { client, key } = useLookup();
  const [range, setRange] = useState(monthRange);
  const statement = useQuery({
    queryKey: key(`${party}-statement`, { id, ...range }),
    queryFn: () =>
      party === 'customer'
        ? getCustomerStatement(client, id, range)
        : getSupplierStatement(client, id, range),
  });
  const data = statement.data;
  return (
    <>
      <Stack.Screen options={{ title: 'Statement of account' }} />
      <ReadScreen refreshing={statement.isRefetching} onRefresh={() => void statement.refetch()}>
        <PageTitle title="Statement of account" subtitle="Amounts in USD unless shown otherwise" />
        <RangeFilter value={range} onChange={setRange} />
        <ReadState query={statement} />
        {data && (
          <>
            <HeroCard
              label="Closing balance"
              value={formatMoney(data.closingBalance)}
              caption={`Opening ${formatMoney(data.openingBalance)} · as of ${formatBusinessDate(data.businessDate)}`}
            />
            <Text accessibilityRole="header" style={readStyles.section}>
              Movements
            </Text>
            {data.entries.length ? (
              <DataTable
                caption="Statement movements"
                rows={data.entries}
                rowKey={(entry) => entry.id}
                alert={(entry) => /VOID|REMOVED|CANCEL/i.test(entry.status)}
                columns={[
                  {
                    key: 'date',
                    label: 'Date',
                    width: 92,
                    render: (entry) => formatBusinessDate(entry.date),
                  },
                  {
                    key: 'what',
                    label: 'Description',
                    width: 168,
                    render: (entry) =>
                      `${entry.description}${entry.reference ? ` · ${entry.reference}` : ''}\n${humanLabel(entry.type)}`,
                  },
                  {
                    key: 'amount',
                    label: 'Amount',
                    width: 104,
                    align: 'right',
                    render: (entry) => formatMoney(entry.originalAmount, entry.currency),
                  },
                  {
                    key: 'effect',
                    label: 'Effect',
                    width: 96,
                    align: 'right',
                    render: (entry) => formatMoney(entry.balanceEffect),
                  },
                  {
                    key: 'balance',
                    label: 'Balance',
                    width: 104,
                    align: 'right',
                    render: (entry) => formatMoney(entry.runningBalance),
                  },
                ]}
              />
            ) : (
              <EmptyState
                title="No movements"
                message="Nothing in this period."
                icon="calendar-outline"
              />
            )}
            {data.aging && (
              <Card title="Aging">
                <Field label="As of" value={formatBusinessDate(data.aging.asOf)} />
                {data.aging.buckets.map((bucket) => (
                  <Field key={bucket.key} label={bucket.label} value={bucket.amount} money />
                ))}
                <Field label="Total" value={data.aging.total} money />
              </Card>
            )}
          </>
        )}
      </ReadScreen>
    </>
  );
}
