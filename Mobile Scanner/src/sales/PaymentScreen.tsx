import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Redirect, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, Text, View } from 'react-native';
import { AppButton } from '../components/AppButton';
import { AppInput } from '../components/AppInput';
import { StatusBanner } from '../components/StatusBanner';
import { Card, Field, PagedRows, ReadState, readStyles } from '../lookup/ReadUI';
import { SelectFilter } from '../lookup/FilterControls';
import { getCustomerFinancial } from '../api/customers-api';
import { getPaymentTargets, recordPayment } from '../api/sales-write-api';
import { useSalesDraft } from './useSalesDraft';
import { buildPaymentPayload } from './payloads';
import { FormPage, DraftNotice } from './FormUI';
import type { PaymentForm, PaymentPayload } from './contracts';
export function PaymentScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>(),
    router = useRouter();
  const draft = useSalesDraft<PaymentForm, PaymentPayload>('payment', id),
    form = draft.record?.form;
  const [choosing, setChoosing] = useState(false);
  const permitted = draft.session.can('payments.create'),
    locked = draft.record?.phase === 'submitted' || draft.mutation.isPending;
  const targets = useQuery({
    queryKey: draft.key('payment-targets', { id }),
    queryFn: () => getPaymentTargets(draft.client, id),
    enabled: permitted && Boolean(form) && !locked,
  });
  const saved = draft.record?.result;
  const balance = useQuery({
    queryKey: draft.key('customer-financial', { id }),
    queryFn: () => getCustomerFinancial(draft.client, id),
    enabled: permitted && saved?.kind === 'payment',
  });
  if (!permitted) return <Redirect href="/(tabs)/sell" />;
  const change = <K extends keyof PaymentForm>(key: K, value: PaymentForm[K]) => {
    if (form) draft.edit({ ...form, [key]: value });
  };
  const submit = () =>
    draft.mutation.mutate({
      build: buildPaymentPayload,
      send: async (payload, original) => {
        const result = await recordPayment(draft.client, original, payload);
        const paymentId =
          result.payments.find((payment) => payment.idempotencyKey === payload.idempotencyKey)
            ?.id ?? null;
        return { kind: 'payment', customerId: original.customerId, paymentId };
      },
    });
  const data = targets.data;
  const obligations = [
    ...(data?.debts ?? [])
      .filter((debt) => !['PAID', 'CANCELLED'].includes(debt.calculatedStatus))
      .map((debt) => ({ ...debt, targetType: 'DEBT' as const })),
    ...(data?.installmentPlans ?? [])
      .filter((plan) => !['COMPLETED', 'CANCELLED'].includes(plan.calculatedStatus))
      .map((plan) => ({ ...plan, targetType: 'INSTALLMENT_PLAN' as const })),
  ];
  return (
    <>
      <Stack.Screen options={{ title: 'Take payment' }} />
      <FormPage title={saved ? 'Payment saved' : 'Take payment'}>
        {!draft.record && (
          <Text style={readStyles.subtitle}>{draft.error || 'Loading saved form…'}</Text>
        )}
        {saved?.kind === 'payment' && (
          <>
            <StatusBanner tone="success" message="The PC recorded this payment." />
            <ReadState query={balance} />
            {balance.data && (
              <Card title="Updated account">
                <Field
                  label="New customer balance from PC"
                  value={balance.data.summary.totalOutstanding}
                  money
                />
              </Card>
            )}
            {saved.paymentId ? (
              <AppButton
                label="View and share receipt"
                onPress={() =>
                  router.push({
                    pathname: '/(tabs)/sell/receipt/[id]',
                    params: { id: saved.paymentId! },
                  })
                }
              />
            ) : (
              <StatusBanner
                tone="warning"
                message="The payment was saved, but the response did not identify its receipt. Find it on the PC; do not pay again."
              />
            )}
            <AppButton
              label="Take another payment"
              variant="secondary"
              onPress={() =>
                void draft.discard().catch((failure: Error) => draft.setError(failure.message))
              }
            />
            <AppButton
              label="Back to customer"
              variant="secondary"
              onPress={() =>
                router.push({ pathname: '/(tabs)/sell/customer/[id]', params: { id } })
              }
            />
          </>
        )}
        {form && (
          <>
            <DraftNotice
              locked={locked}
              error={draft.error}
              onDiscard={() =>
                Alert.alert(
                  'Discard saved form?',
                  'This removes the unsaved payment from this phone.',
                  [
                    { text: 'Keep form', style: 'cancel' },
                    {
                      text: 'Discard',
                      style: 'destructive',
                      onPress: () =>
                        void draft
                          .discard()
                          .catch((failure: Error) => draft.setError(failure.message)),
                    },
                  ]
                )
              }
            />
            <View
              pointerEvents={locked ? 'none' : 'auto'}
              style={{ gap: 16, opacity: locked ? 0.65 : 1 }}
            >
              <Card title={data?.customer.name ?? (form.customerName || 'Customer payment')}>
                <Field label="Currency" value="USD" />
                <Text style={readStyles.subtitle}>
                  This receivables flow records USD payments, as on the desktop.
                </Text>
                {data && (
                  <Field
                    label="Current account balance"
                    value={data.summary.totalOutstanding}
                    money
                  />
                )}
                <ReadState query={targets} />
              </Card>
              {(!form.targetId || choosing) && (
                <PagedRows
                  title="Choose an unpaid obligation"
                  rows={obligations}
                  rowKey={(target) => `${target.targetType}-${target.id}`}
                  render={(target) => (
                    <Card title={target.description}>
                      <Field label="Remaining" value={target.remainingBalance} money />
                      <AppButton
                        label={`Pay ${target.description}`}
                        disabled={locked}
                        onPress={() => {
                          draft.edit({
                            ...form,
                            targetId: target.id,
                            targetType: target.targetType,
                            targetDescription: target.description,
                            customerName: data?.customer.name ?? form.customerName,
                          });
                          setChoosing(false);
                        }}
                      />
                    </Card>
                  )}
                />
              )}
              {form.targetId && (
                <Card title="Allocation">
                  <Field label="Selected obligation" value={form.targetDescription} />
                  <Field
                    label="Type"
                    value={form.targetType === 'DEBT' ? 'Debt' : 'Installment plan'}
                  />
                  <Text style={readStyles.subtitle}>
                    {form.targetType === 'DEBT'
                      ? 'This payment is allocated to the selected debt.'
                      : 'The PC applies this payment to the oldest unpaid installments first.'}
                  </Text>
                  <AppButton
                    label="Change allocation"
                    variant="secondary"
                    disabled={locked}
                    onPress={() => setChoosing(true)}
                  />
                </Card>
              )}
              <AppInput
                label="Payment amount (USD)"
                value={form.amount}
                keyboardType="decimal-pad"
                editable={!locked}
                onChangeText={(value) => change('amount', value)}
              />
              <AppInput
                label="Payment date"
                value={form.paymentDate}
                placeholder="YYYY-MM-DD"
                editable={!locked}
                onChangeText={(value) => change('paymentDate', value)}
              />
              <SelectFilter
                label="Payment method"
                value={form.paymentMethod}
                onChange={(value) => change('paymentMethod', value as PaymentForm['paymentMethod'])}
                options={(
                  [
                    ['CASH', 'Cash'],
                    ['CARD', 'Card'],
                    ['BANK_TRANSFER', 'Bank transfer'],
                    ['CHECK', 'Check'],
                    ['OTHER', 'Other'],
                  ] as const
                ).map(([value, label]) => ({ value, label }))}
              />
              <AppInput
                label="Payment reference"
                value={form.reference}
                maxLength={100}
                editable={!locked}
                onChangeText={(value) => change('reference', value)}
              />
              <AppInput
                label="Payment notes"
                value={form.notes}
                maxLength={1000}
                editable={!locked}
                multiline
                onChangeText={(value) => change('notes', value)}
              />
            </View>
            <AppButton
              label={locked ? 'Retry original payment' : 'Record payment'}
              loading={draft.mutation.isPending}
              disabled={!form.targetId}
              onPress={submit}
            />
          </>
        )}
      </FormPage>
    </>
  );
}
