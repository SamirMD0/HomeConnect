import { useRef, useState } from 'react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Text } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatMoney } from '@shared/money-format';
import { HcApiError } from '../api/hc-client';
import { getCustomer } from '../api/customers-api';
import { AppButton } from '../components/AppButton';
import { AppInput } from '../components/AppInput';
import { EmptyState } from '../components/EmptyState';
import { ListRow } from '../components/ListRow';
import { StatusBanner } from '../components/StatusBanner';
import { useLookup } from '../lookup/useLookup';
import { readStyles } from '../lookup/ReadUI';
import { queryKeys } from '../query/keys';
import { FormPage } from '../sales/FormUI';
import { buildCreatePayload, createPrepaid, listPrepaid } from './prepaid';

/**
 * Record a prepaid item for a customer (admin only on the PC). This PC route
 * has no idempotency key, so a reply lost to Wi-Fi leaves the outcome unknown:
 * the form then shows the customer's pending items and requires a check before
 * it can be sent again, instead of silently creating a second item.
 */
export function PrepaidCreateScreen() {
  const { id: customerId = '' } = useLocalSearchParams<{ id: string }>(),
    router = useRouter();
  const { client, key, scope, session } = useLookup();
  const queryClient = useQueryClient();
  const customer = useQuery({ queryKey: key('customer', { id: customerId }), queryFn: () => getCustomer(client, customerId) });
  const [form, setForm] = useState({ itemName: '', fullAmount: '', paymentAmount: '', notes: '' }),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(''),
    [uncertain, setUncertain] = useState(false),
    [saved, setSaved] = useState<string | null>(null);
  const inFlight = useRef(false);
  const pending = useQuery({
    queryKey: key('prepaid', { customerId, check: true }),
    queryFn: async () => (await listPrepaid(client, { status: 'PENDING', customerId })).items,
    enabled: uncertain,
  });

  if (session.user?.role !== 'ADMIN')
    return <EmptyState title="Administrators only" message="Recording a prepaid item is an administrator action on the PC." />;

  const submit = async () => {
    if (inFlight.current) return;
    setError('');
    let payload;
    try {
      payload = buildCreatePayload(form);
    } catch (failure) {
      setError((failure as Error).message);
      return;
    }
    inFlight.current = true;
    setSaving(true);
    try {
      await createPrepaid(client, customerId, payload);
      setSaved(payload.itemName);
      await queryClient.invalidateQueries({ queryKey: queryKeys.scope(scope) });
    } catch (failure) {
      const known = failure instanceof HcApiError && failure.status !== null && failure.status >= 400 && failure.status < 500;
      setError(failure instanceof Error ? failure.message : 'Could not save.');
      if (!known) setUncertain(true);
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };

  if (saved)
    return (
      <FormPage title="Prepaid item saved">
        <StatusBanner tone="success" message={`${saved} was recorded for ${customer.data?.name ?? 'the customer'}.`} />
        <AppButton label="Done" onPress={() => router.back()} />
      </FormPage>
    );

  const set = (field: keyof typeof form) => (value: string) => setForm((current) => ({ ...current, [field]: value }));
  return (
    <>
      <Stack.Screen options={{ title: 'New prepaid item' }} />
      <FormPage title="New prepaid item">
        <Text style={readStyles.subtitle}>{customer.data?.name ?? ''}</Text>
        {error ? <StatusBanner tone="danger" message={error} /> : null}
        {uncertain ? (
          <>
            <StatusBanner
              tone="warning"
              message="The PC did not confirm. The item may already be saved. Check this customer's items below before sending again."
            />
            {pending.data?.map((row) => (
              <ListRow
                key={row.id}
                title={row.itemName}
                subtitle={`Paid ${formatMoney(row.amountPaid)} of ${formatMoney(row.fullAmount)} · ${new Date(row.createdAt).toLocaleString('en-GB')}`}
              />
            ))}
            {pending.data && pending.data.length === 0 ? <Text style={readStyles.subtitle}>No pending items for this customer.</Text> : null}
            <AppButton label="It is not there: send again" variant="secondary" onPress={() => setUncertain(false)} />
            <AppButton label="It is there: finish" onPress={() => setSaved(form.itemName.trim())} />
          </>
        ) : (
          <>
            <AppInput label="Item" value={form.itemName} onChangeText={set('itemName')} maxLength={200} />
            <AppInput label="Full price (USD)" value={form.fullAmount} onChangeText={set('fullAmount')} keyboardType="decimal-pad" />
            <AppInput label="Paid now (USD)" value={form.paymentAmount} onChangeText={set('paymentAmount')} keyboardType="decimal-pad" />
            <AppInput label="Notes (optional)" value={form.notes} onChangeText={set('notes')} maxLength={1000} />
            <AppButton label="Save prepaid item" loading={saving} onPress={() => void submit()} />
          </>
        )}
      </FormPage>
    </>
  );
}
