import { Stack, useLocalSearchParams } from 'expo-router';
import { formatBusinessDate } from '@shared/money-format';
import { listPurchases } from '../../api/supplier-lookup-api';
import { useLookup, useLookupPages } from '../useLookup';
import { LookupList } from '../LookupList';
import { Card, Field } from '../ReadUI';
export function PurchasesScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>(),
    { client, key } = useLookup();
  const purchases = useLookupPages(key('supplier-purchases', { id }), (page) =>
    listPurchases(client, id, page)
  );
  return (
    <>
      <Stack.Screen options={{ title: 'Supplier purchases' }} />
      <LookupList
        title="Purchases"
        query={purchases}
        itemKey={(item) => item.id}
        renderItem={(item) => (
          <Card title={item.receiptNumber ?? item.description}>
            <Field label="Date" value={formatBusinessDate(item.transactionDate)} />
            <Field label="Amount" value={item.amount} money currency={item.currency} />
            <Field label="Due" value={formatBusinessDate(item.dueDate ?? null)} />
            <Field label="Status" value={item.status} />
          </Card>
        )}
      />
    </>
  );
}
