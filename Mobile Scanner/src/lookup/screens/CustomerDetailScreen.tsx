import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, Linking } from 'react-native';
import { formatBusinessDate, formatMoney } from '@shared/money-format';
import { getCustomer, getCustomerFinancial } from '../../api/customers-api';
import { useLookup } from '../useLookup';
import { Card, Field, PagedRows, ReadScreen, ReadState } from '../ReadUI';
import { PageTitle } from '../../ui/ScreenHeader';
import { HeroCard, QuickGrid, type QuickAction } from '../../ui/Stats';
import { Badge } from '../../ui/Badge';
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
            <PageTitle title={data.name} subtitle={data.phone || undefined} />
            {!data.isActive && <Badge tone="neutral" label="Archived" />}
            {totals && (
              <HeroCard
                label="Balance due"
                value={formatMoney(totals.totalOutstanding)}
                caption={
                  totals.overdueAmount && Number(totals.overdueAmount) > 0
                    ? `${formatMoney(totals.overdueAmount)} overdue`
                    : `Next due ${formatBusinessDate(totals.nextDueDate)}`
                }
              />
            )}
            <QuickGrid
              actions={[
                ...(session.can('payments.create')
                  ? [
                      {
                        label: 'Take payment',
                        icon: 'wallet-outline',
                        tone: 'success',
                        onPress: () =>
                          router.push({ pathname: '/(tabs)/sell/collect/[id]', params: { id } }),
                      } as QuickAction,
                    ]
                  : []),
                {
                  label: 'Statement',
                  icon: 'document-text-outline',
                  onPress: () =>
                    router.push({
                      pathname: '/(tabs)/sell/customer/[id]/statement',
                      params: { id },
                    }),
                },
                ...(data.phone
                  ? ([
                      {
                        label: 'Call',
                        icon: 'call-outline',
                        onPress: () => openContact(`tel:+${contactPhone(data.phone)}`),
                      },
                      {
                        label: 'WhatsApp',
                        icon: 'logo-whatsapp',
                        tone: 'success',
                        onPress: () => openContact(`https://wa.me/${contactPhone(data.phone)}`),
                      },
                    ] as QuickAction[])
                  : []),
                ...(session.user?.role === 'ADMIN'
                  ? [
                      {
                        label: 'Prepaid item',
                        icon: 'time-outline',
                        onPress: () =>
                          router.push({
                            pathname: '/(tabs)/sell/customer/[id]/prepaid-new',
                            params: { id },
                          }),
                      } as QuickAction,
                    ]
                  : []),
              ]}
            />
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
