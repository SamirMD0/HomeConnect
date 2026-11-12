import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Text } from 'react-native';
import { formatBusinessDate } from '@shared/money-format';
import { getCustomerStatement } from '../../api/customers-api';
import { getSupplierStatement } from '../../api/supplier-lookup-api';
import { useLookup } from '../useLookup';
import { Card, Field, PagedRows, ReadScreen, ReadState, readStyles } from '../ReadUI';
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
        <Text accessibilityRole="header" style={readStyles.title}>
          Statement of account
        </Text>
        <RangeFilter value={range} onChange={setRange} />
        <ReadState query={statement} />
        {data && (
          <>
            <Card title="USD balances">
              <Field label="Opening" value={data.openingBalance} money />
              <Field label="Closing" value={data.closingBalance} money />
              <Field label="As of" value={formatBusinessDate(data.businessDate)} />
            </Card>
            <PagedRows
              title="Movements"
              rows={data.entries}
              rowKey={(entry) => entry.id}
              render={(entry) => (
                <Card title={entry.description}>
                  <Field label="Date" value={formatBusinessDate(entry.date)} />
                  <Field label="Type" value={humanLabel(entry.type)} />
                  <Field
                    label="Amount"
                    value={entry.originalAmount}
                    money
                    currency={entry.currency}
                  />
                  <Field label="Balance effect (USD)" value={entry.balanceEffect} money />
                  <Field label="Running balance (USD)" value={entry.runningBalance} money />
                  <Field label="Status" value={humanLabel(entry.status)} />
                  {entry.reference && <Field label="Reference" value={entry.reference} />}
                </Card>
              )}
            />
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
