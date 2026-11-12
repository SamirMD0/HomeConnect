import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Text } from 'react-native';
import { getPaymentReceipt, getReceiptBusiness } from '../api/sales-write-api';
import { useLookup } from '../lookup/useLookup';
import { Card, Field, PagedRows, ReadScreen, ReadState, readStyles } from '../lookup/ReadUI';
import { AppButton } from '../components/AppButton';
import { StatusBanner } from '../components/StatusBanner';
import { formatBusinessDate } from '@shared/money-format';
import { exportPaymentReceipt } from './receipt-export';
export function ReceiptScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>(),
    { client, key } = useLookup();
  const receipt = useQuery({
    queryKey: key('payment-receipt', { id }),
    queryFn: () => getPaymentReceipt(client, id),
  });
  const business = useQuery({
    queryKey: key('receipt-business'),
    queryFn: () => getReceiptBusiness(client),
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const share = async () => {
    if (busy || !receipt.data || !business.data) return;
    setBusy(true);
    setError('');
    try {
      if (!(await Sharing.isAvailableAsync()))
        throw new Error('File sharing is unavailable on this device.');
      // Re-fetch before export so a subsequently voided payment is marked VOID.
      const [fresh, shop] = await Promise.all([receipt.refetch(), business.refetch()]);
      if (fresh.error || shop.error || !fresh.data || !shop.data)
        throw new Error('Connect to the shop PC to refresh this receipt before sharing.');
      await exportPaymentReceipt(fresh.data, shop.data, {
        isAvailableAsync: Sharing.isAvailableAsync,
        printToFileAsync: Print.printToFileAsync,
        shareAsync: Sharing.shareAsync,
      });
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      // Keep the file in Expo's cache so the receiving app can finish opening it.
      setBusy(false);
    }
  };
  const data = receipt.data;
  return (
    <>
      <Stack.Screen options={{ title: 'Payment receipt' }} />
      <ReadScreen
        refreshing={receipt.isRefetching || business.isRefetching}
        onRefresh={() => {
          void receipt.refetch();
          void business.refetch();
        }}
      >
        <Text style={readStyles.title} accessibilityRole="header">
          Payment receipt
        </Text>
        <ReadState query={receipt} />
        <ReadState query={business} />
        {error && <StatusBanner tone="danger" message={error} />}
        {data && (
          <>
            {data.voidedAt && (
              <StatusBanner tone="danger" message="VOID — this payment has been voided." />
            )}
            <Card title={business.data?.shopName ?? 'Home Connect'}>
              <Field label="Receipt no." value={data.id} />
              <Field label="Customer" value={data.customer?.name ?? 'Walk-in customer'} />
              <Field label="Date" value={formatBusinessDate(data.paymentDate)} />
              <Field
                label="Amount received"
                value={data.totalAmount}
                money
                currency={data.currency}
              />
              <Field label="Method" value={data.paymentMethod.replace(/_/g, ' ')} />
              <Field label="Received by" value={data.receivedBy.name} />
            </Card>
            <PagedRows
              title="Allocation"
              rows={data.allocations}
              rowKey={(row) => row.id}
              render={(row) => (
                <Card title={row.description}>
                  <Field
                    label="Allocated"
                    value={row.paymentAmount}
                    money
                    currency={row.paymentCurrency}
                  />
                </Card>
              )}
            />
            <PagedRows
              title="Remaining balance after payment"
              rows={data.remainingBalances}
              rowKey={(row) => row.obligationId}
              render={(row) => (
                <Field label={row.description} value={row.amount} money currency={row.currency} />
              )}
            />
            <AppButton
              label="Share receipt PDF"
              loading={busy}
              disabled={!business.data}
              onPress={() => void share()}
            />
          </>
        )}
      </ReadScreen>
    </>
  );
}
