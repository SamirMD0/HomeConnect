import { useState } from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatBusinessDate } from '@shared/money-format';
import { AppButton } from '../components/AppButton';
import { AppInput } from '../components/AppInput';
import { StatusBanner } from '../components/StatusBanner';
import { useLookup } from '../lookup/useLookup';
import { Card, Field, ReadState, readStyles } from '../lookup/ReadUI';
import { humanLabel, localDate } from '../lookup/filters';
import { queryKeys } from '../query/keys';
import { FormPage } from '../sales/FormUI';
import {
  buildConvertPayload,
  buildDeliverPayload,
  convertPrepaid,
  deliverPrepaid,
  getPrepaid,
  statusLabels,
} from './prepaid';

type Action = 'none' | 'deliver' | 'convert';

/** One prepaid item with its payments. Administrators can deliver or convert it. */
export function PrepaidDetailScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const { client, key, scope, session } = useLookup();
  const queryClient = useQueryClient();
  const item = useQuery({ queryKey: key('prepaid-item', { id }), queryFn: () => getPrepaid(client, id), enabled: Boolean(id) });
  const [action, setAction] = useState<Action>('none'),
    [saving, setSaving] = useState(false),
    [banner, setBanner] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null),
    [dueDate, setDueDate] = useState(''),
    [notes, setNotes] = useState(''),
    [mode, setMode] = useState<'DEBT' | 'INSTALLMENT'>('DEBT'),
    [count, setCount] = useState('6'),
    [frequency, setFrequency] = useState<'MONTHLY' | 'WEEKLY'>('MONTHLY');

  const data = item.data;
  const admin = session.user?.role === 'ADMIN';

  const run = async (send: () => Promise<unknown>, done: string) => {
    setSaving(true);
    setBanner(null);
    try {
      await send();
      setBanner({ tone: 'success', text: done });
      setAction('none');
      await queryClient.invalidateQueries({ queryKey: queryKeys.scope(scope) });
    } catch (error) {
      // A repeat after a lost reply is refused by the PC (item no longer pending),
      // so a retry can never deliver twice; the refreshed status shows the outcome.
      setBanner({ tone: 'danger', text: error instanceof Error ? error.message : 'Could not save.' });
      void item.refetch();
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Prepaid item' }} />
      <FormPage title={data?.itemName ?? 'Prepaid item'}>
        <ReadState query={item} />
        {banner ? <StatusBanner tone={banner.tone} message={banner.text} /> : null}
        {data && (
          <>
            <Card title={data.customer.name}>
              <Field label="Status" value={statusLabels[data.status]} />
              <Field label="Full price" value={data.fullAmount} money />
              <Field label="Paid" value={data.amountPaid} money />
              <Field label="Still to collect" value={data.remainingToCollect} money />
              {data.deliveredAt && <Field label="Delivered" value={formatBusinessDate(data.deliveredAt.slice(0, 10))} />}
              {data.notes ? <Text style={readStyles.subtitle}>{data.notes}</Text> : null}
              {data.deliveryNotes ? <Text style={readStyles.subtitle}>Delivery: {data.deliveryNotes}</Text> : null}
            </Card>
            <Card title={`Payments (${data.payments.length})`}>
              {data.payments.map((payment) => (
                <Field
                  key={payment.id}
                  label={`${formatBusinessDate(payment.paymentDate.slice(0, 10))} · ${humanLabel(payment.paymentMethod)}${payment.isVoided ? ' · voided' : ''}`}
                  value={payment.amount}
                  money
                />
              ))}
            </Card>

            {admin && data.status === 'PENDING' && action === 'none' && (
              <View style={{ gap: 8 }}>
                <AppButton label="Mark as delivered" onPress={() => setAction('deliver')} />
                {!data.isFullyPaid && (
                  <AppButton
                    label="Deliver and convert the remainder"
                    variant="secondary"
                    onPress={() => setAction('convert')}
                  />
                )}
              </View>
            )}

            {action === 'deliver' && (
              <Card title="Mark as delivered">
                {!data.isFullyPaid && (
                  <AppInput
                    label="Due date for the unpaid remainder (YYYY-MM-DD)"
                    value={dueDate}
                    onChangeText={setDueDate}
                    placeholder={localDate()}
                  />
                )}
                <AppInput label="Delivery notes (optional)" value={notes} onChangeText={setNotes} maxLength={1000} />
                <AppButton
                  label="Confirm delivery"
                  loading={saving}
                  onPress={() => {
                    try {
                      const payload = buildDeliverPayload(data, { remainderDueDate: dueDate, deliveryNotes: notes });
                      void run(() => deliverPrepaid(client, data, payload), 'Marked as delivered.');
                    } catch (error) {
                      setBanner({ tone: 'danger', text: (error as Error).message });
                    }
                  }}
                />
                <AppButton label="Cancel" variant="secondary" onPress={() => setAction('none')} />
              </Card>
            )}

            {action === 'convert' && (
              <Card title="Deliver and convert the remainder">
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <AppButton label="Debt" variant={mode === 'DEBT' ? 'primary' : 'secondary'} onPress={() => setMode('DEBT')} />
                  <AppButton
                    label="Installments"
                    variant={mode === 'INSTALLMENT' ? 'primary' : 'secondary'}
                    onPress={() => setMode('INSTALLMENT')}
                  />
                </View>
                <AppInput
                  label={mode === 'DEBT' ? 'Due date (YYYY-MM-DD)' : 'First installment date (YYYY-MM-DD)'}
                  value={dueDate}
                  onChangeText={setDueDate}
                  placeholder={localDate()}
                />
                {mode === 'INSTALLMENT' && (
                  <>
                    <AppInput label="Number of installments" value={count} onChangeText={setCount} keyboardType="number-pad" />
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <AppButton
                        label="Monthly"
                        variant={frequency === 'MONTHLY' ? 'primary' : 'secondary'}
                        onPress={() => setFrequency('MONTHLY')}
                      />
                      <AppButton
                        label="Weekly"
                        variant={frequency === 'WEEKLY' ? 'primary' : 'secondary'}
                        onPress={() => setFrequency('WEEKLY')}
                      />
                    </View>
                  </>
                )}
                <AppButton
                  label="Confirm"
                  loading={saving}
                  onPress={() => {
                    try {
                      const payload = buildConvertPayload(data, { mode, date: dueDate, installmentCount: count, frequency });
                      void run(() => convertPrepaid(client, data, payload), 'Delivered, and the remainder was converted.');
                    } catch (error) {
                      setBanner({ tone: 'danger', text: (error as Error).message });
                    }
                  }}
                />
                <AppButton label="Cancel" variant="secondary" onPress={() => setAction('none')} />
              </Card>
            )}
            {data.status === 'DELIVERED' && (
              <Text style={readStyles.subtitle}>Reverting a delivery is done on the shop PC.</Text>
            )}
          </>
        )}
      </FormPage>
    </>
  );
}
