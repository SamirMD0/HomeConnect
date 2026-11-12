import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Text } from 'react-native';
import { getSupplier } from '../../api/supplier-lookup-api';
import { useLookup } from '../useLookup';
import { Card, Field, ReadScreen, ReadState, readStyles } from '../ReadUI';
import { ListRow } from '../../components/ListRow';
export function SupplierDetailScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>(),
    { client, key, session } = useLookup(),
    router = useRouter();
  const supplier = useQuery({
    queryKey: key('supplier', { id }),
    queryFn: () => getSupplier(client, id),
    enabled: session.can('suppliers.read'),
  });
  const data = supplier.data;
  return (
    <>
      <Stack.Screen options={{ title: 'Supplier details' }} />
      <ReadScreen refreshing={supplier.isRefetching} onRefresh={() => void supplier.refetch()}>
        <ReadState query={supplier} />
        {data && (
          <>
            <Text accessibilityRole="header" style={readStyles.title}>
              {data.name}
            </Text>
            <Card title="Account">
              <Field
                label={data.balance.startsWith('-') ? 'Credit in our favour' : 'Balance payable'}
                value={data.balance.replace(/^-/, '')}
                money
              />
              {data.summary && (
                <>
                  <Field label="Total billed" value={data.summary.totalOwed} money />
                  <Field label="Payments made" value={data.summary.totalPaid} money />
                  <Field label="Credits received" value={data.summary.totalCredit} money />
                </>
              )}
              <Field
                label="Branch"
                value={
                  session.branch.branches.find((b) => b.id === data.branchId)?.name ??
                  session.branch.selected?.name
                }
              />
            </Card>
            <Card title="Contact">
              <Field label="Company" value={data.companyName} />
              <Field label="Phone" value={data.phone} />
              <Field label="Email" value={data.email} />
              {data.notes && <Text style={readStyles.subtitle}>{data.notes}</Text>}
            </Card>
            <ListRow
              title="Statement of account"
              subtitle="Server-computed opening, running and closing balances"
              onPress={() =>
                router.push({ pathname: '/(tabs)/suppliers/detail/[id]/statement', params: { id } })
              }
            />
            <ListRow
              title="Purchases"
              subtitle="Receipts and posted amounts"
              onPress={() =>
                router.push({ pathname: '/(tabs)/suppliers/detail/[id]/purchases', params: { id } })
              }
            />
            <ListRow
              title="Bills"
              subtitle="View supplier bill photos"
              onPress={() =>
                router.push({ pathname: '/(tabs)/suppliers/detail/[id]/bills', params: { id } })
              }
            />
          </>
        )}
      </ReadScreen>
    </>
  );
}
