import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useRouter } from 'expo-router';
import { Alert, Text, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatBusinessDate, formatDateTime, formatMoney } from '@shared/money-format';
import type { Currency } from '@shared/lookup-contracts';
import { listPurchases } from '../api/supplier-lookup-api';
import { replaceBillPage, uploadReceipt } from '../api/receipts-api';
import { AppButton } from '../components/AppButton';
import { EmptyState } from '../components/EmptyState';
import { ListRow } from '../components/ListRow';
import { Sheet } from '../components/Sheet';
import { StatusBanner } from '../components/StatusBanner';
import { useLookup } from '../lookup/useLookup';
import { ReadScreen, ReadState, readStyles } from '../lookup/ReadUI';
import { queryKeys } from '../query/keys';
import { prepareReceiptPhoto } from '../services/receipt-photo';
import { BillPreview } from './BillPreview';
import { QuickGrid, type QuickAction } from '../ui/Stats';
import { enqueueCloudAction } from '../offline/outbox-runtime';
import {
  billPages,
  canDeleteBill,
  deleteBill,
  linkBillToEntry,
  linkBillToPurchase,
  listRecentPayments,
  listUnlinkedBills,
  type InboxBill,
} from './bills-inbox';

type Mode = 'menu' | 'purchase' | 'payment';
type Message = { tone: 'success' | 'danger'; text: string };

/** One new photo from the camera, prepared like every other bill page. */
async function takePhoto(): Promise<string | null> {
  const access = await ImagePicker.requestCameraPermissionsAsync();
  if (!access.granted) throw new Error('Allow camera access to photograph the bill.');
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
  if (result.canceled || !result.assets[0]) return null;
  return prepareReceiptPhoto(result.assets[0]);
}

/**
 * Bills inbox: bill photos not yet linked. Link each to a purchase or a
 * payment, create the purchase from it, add or replace pages, or delete it.
 */
export function BillsInboxScreen() {
  const { client, key, scope, session } = useLookup(),
    router = useRouter();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<InboxBill | null>(null),
    [mode, setMode] = useState<Mode>('menu'),
    [pageIndex, setPageIndex] = useState(0),
    [saving, setSaving] = useState(''),
    [message, setMessage] = useState<Message | null>(null),
    [sheetError, setSheetError] = useState<string | null>(null);

  const bills = useQuery({ queryKey: key('bills-inbox'), queryFn: () => listUnlinkedBills(client) });
  const purchases = useQuery({
    queryKey: key('bill-link-purchases', { supplierId: selected?.supplierId }),
    queryFn: async () => (await listPurchases(client, selected!.supplierId, 1)).items,
    enabled: Boolean(selected && mode === 'purchase'),
  });
  const payments = useQuery({
    queryKey: key('bill-link-payments', { supplierId: selected?.supplierId }),
    queryFn: () => listRecentPayments(client, selected!.supplierId),
    enabled: Boolean(selected && mode === 'payment'),
  });

  const pages = selected ? billPages(selected) : [];
  const page = pages[Math.min(pageIndex, Math.max(pages.length - 1, 0))];

  const close = () => {
    setSelected(null);
    setMode('menu');
    setPageIndex(0);
    setSheetError(null);
  };
  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.scope(scope) });
  const cloud = session.mode === 'cloud';
  /** Over the cloud every bill action is queued for the shop PC, in the bill's branch. */
  const queue = async (
    bill: InboxBill,
    type: 'supplier_bill.link' | 'supplier_bill.delete' | 'supplier_bill.replace' | 'supplier_bill.upload',
    payload: Record<string, unknown>,
    summary: string,
    photo?: string
  ) =>
    enqueueCloudAction({
      type,
      branchId: bill.branchId,
      submissionKey: (await import('expo-crypto')).randomUUID(),
      payload,
      summary: `${summary} · ${bill.supplierName}`,
      ...(photo ? { photo: { uri: photo, mime: 'image/jpeg' } } : {}),
    });
  const sent = 'Sent to the shop PC. Open Waiting for the result.';

  /** Run one sheet action; on success close the sheet and show `done`. */
  const act = async (id: string, work: () => Promise<unknown>, done: string) => {
    if (saving) return;
    setSaving(id);
    setSheetError(null);
    try {
      await work();
      setMessage({ tone: 'success', text: done });
      close();
      await refresh();
    } catch (error) {
      setSheetError(error instanceof Error ? error.message : 'That did not work. Try again.');
    } finally {
      setSaving('');
    }
  };

  const addPage = (bill: InboxBill) =>
    act(
      'add-page',
      async () => {
        const uri = await takePhoto();
        if (!uri) throw new Error('No photo taken.');
        if (cloud) {
          await queue(bill, 'supplier_bill.upload',
            { supplierId: bill.supplierId, billGroupId: bill.billGroupId ?? bill.id }, 'Bill page', uri);
          return;
        }
        await uploadReceipt(client, {
          supplierPurchaseId: null,
          supplierId: bill.supplierId,
          localUri: uri,
          mime: 'image/jpeg',
          billGroupId: bill.billGroupId ?? bill.id,
        });
      },
      cloud ? sent : 'Page added to the bill.'
    );

  const replacePage = () =>
    page &&
    act(
      'replace',
      async () => {
        const uri = await takePhoto();
        if (!uri) throw new Error('No photo taken.');
        if (cloud && selected) {
          await queue(selected, 'supplier_bill.replace', { billId: page.id }, 'Retaken bill page', uri);
          return;
        }
        await replaceBillPage(client, page, uri);
      },
      cloud ? sent : 'Page replaced. The old photo is kept on the PC.'
    );

  const remove = (whole: boolean) => () =>
    cloud && selected
      ? queue(selected, 'supplier_bill.delete', { billId: page!.id, wholeBill: whole }, whole ? 'Delete bill' : 'Delete bill page')
      : deleteBill(client, page!, whole);
  const confirmDelete = () => {
    if (!selected || !page) return;
    const many = pages.length > 1;
    Alert.alert(
      many ? 'Delete which?' : 'Delete this bill?',
      'The PC keeps a record of who deleted it.',
      [
        { text: 'Cancel', style: 'cancel' },
        ...(many
          ? [
              {
                text: `Page ${pageIndex + 1} only`,
                onPress: () => void act('delete', remove(false), cloud ? sent : 'Page deleted.'),
              },
            ]
          : []),
        {
          text: many ? 'Whole bill' : 'Delete',
          style: 'destructive' as const,
          onPress: () => void act('delete', remove(true), cloud ? sent : 'Bill deleted.'),
        },
      ]
    );
  };

  /** One bill, four icons: purchase, link, page, delete (decided 2026-11-23). */
  const billActions = (bill: InboxBill): QuickAction[] => [
    ...(session.can('supplierInvoices.write')
      ? [{
          label: 'Purchase',
          icon: 'document-text-outline' as const,
          onPress: () => {
            close();
            router.push({
              pathname: '/(tabs)/suppliers/invoice',
              params: { billId: bill.id, billBranchId: bill.branchId, supplierId: bill.supplierId },
            });
          },
        }]
      : []),
    {
      label: 'Link',
      icon: 'link-outline',
      onPress: () =>
        Alert.alert('Link this bill to', undefined, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'A payment', onPress: () => setMode('payment') },
          { text: 'A purchase', onPress: () => setMode('purchase') },
        ]),
    },
    {
      label: 'Page',
      icon: 'camera-outline',
      onPress: () =>
        Alert.alert('Bill pages', 'Photograph a new page, or retake the page shown.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Retake this page', onPress: () => void replacePage() },
          { text: 'Add a page', onPress: () => void addPage(bill) },
        ]),
    },
    ...(canDeleteBill(bill, session.user)
      ? [{ label: 'Delete', icon: 'trash-outline' as const, tone: 'danger' as const, onPress: confirmDelete }]
      : []),
  ];

  return (
    <>
      <Stack.Screen options={{ title: 'Bills inbox' }} />
      <ReadScreen refreshing={bills.isRefetching} onRefresh={() => void bills.refetch()}>
        <Text accessibilityRole="header" style={readStyles.title}>
          Bills inbox
        </Text>
        {message ? <StatusBanner tone={message.tone} message={message.text} /> : null}
        <ReadState query={bills} />
        {bills.data && bills.data.length === 0 ? (
          <EmptyState title="All bills are linked" message="New bills saved without a purchase or payment appear here." />
        ) : null}
        {bills.data?.map((bill) => {
          const count = billPages(bill).length;
          return (
            <ListRow
              key={bill.id}
              title={bill.supplierName}
              subtitle={`${formatDateTime(bill.capturedAt)}${count > 1 ? ` · ${count} pages` : ''}${bill.note ? ` · ${bill.note}` : ''}`}
              onPress={() => {
                setMessage(null);
                setSelected(bill);
              }}
            />
          );
        })}
      </ReadScreen>

      <Sheet title={selected ? `Bill · ${selected.supplierName}` : 'Bill'} visible={Boolean(selected)} onClose={close}>
        {selected && page ? (
          <View style={{ padding: 16, gap: 12 }}>
            <BillPreview key={page.id} bill={page} compact />
            {pages.length > 1 ? (
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <AppButton label="Previous" variant="secondary" disabled={pageIndex === 0} onPress={() => setPageIndex((index) => index - 1)} />
                </View>
                <Text style={readStyles.subtitle}>
                  Page {pageIndex + 1} of {pages.length}
                </Text>
                <View style={{ flex: 1 }}>
                  <AppButton label="Next" variant="secondary" disabled={pageIndex >= pages.length - 1} onPress={() => setPageIndex((index) => index + 1)} />
                </View>
              </View>
            ) : null}
            {selected.note ? <Text style={readStyles.subtitle}>{selected.note}</Text> : null}
            {sheetError ? <StatusBanner tone="danger" message={sheetError} /> : null}

            {mode === 'menu' ? (
              <>
                <QuickGrid actions={billActions(selected)} />
                {saving ? <Text style={readStyles.subtitle}>Working…</Text> : null}
              </>
            ) : mode === 'purchase' ? (
              <>
                <Text style={readStyles.section}>Recent purchases</Text>
                <ReadState query={purchases} />
                {purchases.data && purchases.data.filter((row) => row.status !== 'REMOVED').length === 0 ? (
                  <Text style={readStyles.subtitle}>No purchases yet.</Text>
                ) : null}
                {purchases.data
                  ?.filter((purchase) => purchase.status !== 'REMOVED')
                  .map((purchase) => (
                    <ListRow
                      key={purchase.id}
                      title={purchase.receiptNumber ? `Invoice ${purchase.receiptNumber}` : purchase.description}
                      subtitle={`${formatBusinessDate(purchase.transactionDate)} · ${formatMoney(purchase.amount, purchase.currency)}${saving === purchase.id ? ' · Linking…' : ''}`}
                      onPress={
                        saving
                          ? undefined
                          : () =>
                              void act(
                                purchase.id,
                                () => cloud
                                  ? queue(selected, 'supplier_bill.link', { billId: selected.id, transactionId: purchase.id }, 'Link bill to purchase')
                                  : linkBillToPurchase(client, selected, purchase),
                                cloud ? sent : `Bill from ${selected.supplierName} linked to the purchase.`
                              )
                      }
                    />
                  ))}
                <AppButton label="Back" variant="secondary" onPress={() => setMode('menu')} />
              </>
            ) : (
              <>
                <Text style={readStyles.section}>Recent payments</Text>
                <ReadState query={payments} />
                {payments.data && payments.data.length === 0 ? (
                  <Text style={readStyles.subtitle}>No payments yet.</Text>
                ) : null}
                {payments.data?.map((payment) => (
                  <ListRow
                    key={payment.id}
                    title={formatMoney(payment.amount, payment.currency as Currency | undefined)}
                    subtitle={`${formatBusinessDate(payment.transactionDate)} · ${payment.description}${saving === payment.id ? ' · Linking…' : ''}`}
                    onPress={
                      saving
                        ? undefined
                        : () =>
                            void act(
                              payment.id,
                              () => cloud
                                ? queue(selected, 'supplier_bill.link', { billId: selected.id, transactionId: payment.id }, 'Link bill to payment')
                                : linkBillToEntry(client, selected, payment.id),
                              cloud ? sent : `Bill from ${selected.supplierName} linked to the payment.`
                            )
                    }
                  />
                ))}
                <AppButton label="Back" variant="secondary" onPress={() => setMode('menu')} />
              </>
            )}
          </View>
        ) : null}
      </Sheet>
    </>
  );
}
