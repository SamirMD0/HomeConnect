import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, Linking, Text, View } from 'react-native';
import { formatBusinessDate } from '@shared/money-format';
import { getCustomer, getCustomerFinancial } from '../../api/customers-api';
import { useLookup } from '../useLookup';
import { Card, Field, PagedRows, ReadScreen, ReadState, readStyles } from '../ReadUI';
import { ListRow } from '../../components/ListRow';
import { AppButton } from '../../components/AppButton';
import { contactPhone, humanLabel } from '../filters';
export function CustomerDetailScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>(),
    { client, key, session } = useLookup(),
    router = useRouter();
  const customer = useQuery({
    queryKey: key('customer', { id }),
    queryFn: () => getCustomer(client, id),
  });
  const financial = useQuery({
    queryKey: key('customer-financial', { id }),
    queryFn: () => getCustomerFinancial(client, id),
  });
  const data = customer.data,
    totals = financial.data?.summary;
  const openContact = (url: string) => {
    void Linking.openURL(url).catch(() =>
      Alert.alert(
        'Could not open contact',
        'Use the saved phone number in your phone or messaging app.'
      )
    );
  };
  return (
    <>
      <Stack.Screen options={{ title: 'Customer details' }} />
      <ReadScreen
        refreshing={customer.isRefetching || financial.isRefetching}
        onRefresh={() => {
          void customer.refetch();
          void financial.refetch();
        }}
      >
        <ReadState query={customer} />
        {data && (
          <>
            <Text accessibilityRole="header" style={readStyles.title}>
              {data.name}
            </Text>
            {session.can('payments.create') && <AppButton label="Take payment" onPress={() => router.push({ pathname: '/(tabs)/sell/collect/[id]', params: { id } })} />}
            {session.user?.role === 'ADMIN' && <AppButton label="New prepaid item" variant="secondary" onPress={() => router.push({ pathname: '/(tabs)/sell/customer/[id]/prepaid-new', params: { id } })} />}
            <Card title="Contact">
              <Field
                label="Branch"
                value={
                  session.branch.branches.find((b) => b.id === data.branchId)?.name ??
                  session.branch.selected?.name
                }
              />
              <Field label="Phone" value={data.phone} />
              <Field label="Address" value={data.address} />
              <Field label="Status" value={data.isActive ? 'Active' : 'Archived'} />
              {data.phone && (
                <View style={{ gap: 8 }}>
                  <AppButton
                    label="Call customer"
                    variant="secondary"
                    onPress={() => openContact(`tel:+${contactPhone(data.phone)}`)}
                  />
                  <AppButton
                    label="WhatsApp"
                    variant="secondary"
                    onPress={() => openContact(`https://wa.me/${contactPhone(data.phone)}`)}
                  />
                </View>
              )}
            </Card>
          </>
        )}
        <ReadState query={financial} />
        {totals && (
          <>
            <Card title="Account balance">
              <Field label="Balance due" value={totals.totalOutstanding} money />
              <Field label="Payments received" value={totals.totalPaid} money incoming />
              {totals.totalObligated !== undefined && (
                <Field label="Total invoiced" value={totals.totalObligated} money />
              )}
              <Field label="Single debts" value={totals.singleDebtOutstanding} money />
              <Field label="Installment plans" value={totals.installmentPlanOutstanding} money />
              {totals.overdueAmount !== undefined && (
                <Field label="Overdue" value={totals.overdueAmount} money />
              )}
              {totals.totalPrepaidAdminDebt !== undefined && (
                <Field
                  label="Deposits held"
                  value={totals.totalPrepaidAdminDebt.replace(/^-/, '')}
                  money
                />
              )}
              <Field
                label="Last payment"
                value={formatBusinessDate(totals.lastPaymentDate ?? null)}
              />
              <Field label="Next due" value={formatBusinessDate(totals.nextDueDate)} />
              <Field
                label="Next due amount"
                value={totals.nextDueDate ? totals.nextDueAmount : null}
                money
              />
            </Card>
            <ListRow
              title="Statement of account"
              icon="document-text-outline"
              onPress={() =>
                router.push({ pathname: '/(tabs)/sell/customer/[id]/statement', params: { id } })
              }
            />
            <PagedRows
              title="Debts"
              rows={financial.data?.debts ?? []}
              rowKey={(row) => row.id}
              render={(row) => (
                <Card title={row.description}>
                  <Field label="Outstanding" value={row.remainingBalance} money />
                  <Field label="Paid" value={row.totalPaid} money incoming />
                  <Field label="Due" value={formatBusinessDate(row.dueDate)} />
                  <Field label="Status" value={humanLabel(row.calculatedStatus)} />
                </Card>
              )}
            />
            <PagedRows
              title="Installment plans"
              rows={financial.data?.installmentPlans ?? []}
              rowKey={(row) => row.id}
              render={(row) => (
                <Card title={row.description}>
                  <Field label="Outstanding" value={row.remainingBalance} money />
                  <Field label="Paid" value={row.totalPaid} money incoming />
                  <Field label="Next due" value={formatBusinessDate(row.nextDueDate)} />
                  <Field label="Status" value={humanLabel(row.calculatedStatus)} />
                </Card>
              )}
            />
          </>
        )}
      </ReadScreen>
    </>
  );
}
