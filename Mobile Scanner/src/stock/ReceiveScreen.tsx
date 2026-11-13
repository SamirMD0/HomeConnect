import { useState } from 'react';
import { Stack } from 'expo-router';
import { Text } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { listSuppliers } from '../api/suppliers-api';
import { HcApiError } from '../api/hc-client';
import { AppButton } from '../components/AppButton';
import { AppInput } from '../components/AppInput';
import { ListRow } from '../components/ListRow';
import { StatusBanner } from '../components/StatusBanner';
import { useLookup } from '../lookup/useLookup';
import { Card, readStyles } from '../lookup/ReadUI';
import { localDate } from '../lookup/filters';
import { queryKeys } from '../query/keys';
import { DraftNotice, FormPage } from '../sales/FormUI';
import { ProductPicker } from '../sales/ProductPicker';
import { ScanPanel } from './ScanPanel';
import { QuantityStepper } from './QuantityStepper';
import { createReceiving, productForCode, receivingDuplicateCheck } from './stock-api';
import { useStockDraft, type ReceiveStore } from './stock-drafts';
import {
  addReceiveScan,
  buildReceivingPayload,
  englishMessage,
  removeReceiveLine,
  setReceiveQuantity,
  type ReceiveForm,
} from './stock-logic';

type Banner = { tone: 'success' | 'warning' | 'danger'; message: string } | null;

/**
 * Receive goods into shared stock, as the desktop New receiving page does:
 * optional supplier and reference, a date, and scanned products. The form and
 * its idempotency key are saved on the phone, so a retry after a lost response
 * returns the same receiving instead of adding the stock twice.
 */
export function ReceiveScreen() {
  const { client, key, scope } = useLookup();
  const queryClient = useQueryClient();
  const draft = useStockDraft<ReceiveStore>(scope, 'receive');
  const [banner, setBanner] = useState<Banner>(null),
    [mode, setMode] = useState<'form' | 'products' | 'suppliers'>('form'),
    [supplierSearch, setSupplierSearch] = useState(''),
    [submitting, setSubmitting] = useState(false);
  const store = draft.store,
    record = store?.current,
    form = record?.form ?? null;

  const suppliers = useQuery({
    queryKey: key('receive-suppliers'),
    queryFn: () => listSuppliers(client),
    enabled: mode === 'suppliers',
  });
  const reference = form?.referenceNumber.trim() ?? '';
  const duplicate = useQuery({
    queryKey: key('receiving-duplicate', { supplierId: form?.supplierId, reference }),
    queryFn: () => receivingDuplicateCheck(client, form!.supplierId, reference),
    enabled: Boolean(form?.supplierId && reference),
  });

  const update = async (change: (current: ReceiveForm) => ReceiveForm) => {
    const latest = store?.current.form;
    if (!store || !latest) return;
    try {
      await store.edit(change(latest));
    } catch (error) {
      setBanner({ tone: 'danger', message: error instanceof Error ? error.message : 'Could not update.' });
    }
  };

  const addProduct = (product: Parameters<typeof addReceiveScan>[1]) =>
    update((current) => addReceiveScan(current, product)).then(() =>
      setBanner({ tone: 'success', message: `Added ${product.name}.` })
    );

  const onCode = async (code: string) => {
    try {
      await addProduct(await productForCode(client, code));
    } catch (error) {
      setBanner({ tone: 'danger', message: englishMessage(error instanceof Error ? error.message : 'Lookup failed.') });
    }
  };

  const submit = async () => {
    if (!store) return;
    setSubmitting(true);
    setBanner(null);
    try {
      await store.submit(
        (current, idempotencyKey) => buildReceivingPayload(current, idempotencyKey, localDate()),
        (payload) => createReceiving(client, payload)
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.scope(scope) });
    } catch (error) {
      const message = englishMessage(error instanceof Error ? error.message : 'Could not save.');
      setBanner({ tone: 'danger', message });
      // A validation answer is a definite "not saved": unlock the form to fix it.
      if (error instanceof HcApiError && [400, 404, 422].includes(error.status ?? 0))
        await store.editRejected().catch(() => undefined);
    } finally {
      setSubmitting(false);
    }
  };

  if (!store || !record)
    return (
      <>
        <Stack.Screen options={{ title: 'Receive goods' }} />
        {draft.error ? <StatusBanner tone="danger" message={draft.error} /> : null}
      </>
    );

  if (record.phase === 'saved' && record.result)
    return (
      <>
        <Stack.Screen options={{ title: 'Receive goods' }} />
        <FormPage title="Goods received">
          <StatusBanner
            tone="success"
            message={`Saved on the PC${record.result.referenceNumber ? ` · Ref ${record.result.referenceNumber}` : ''}. Shared stock has been increased.`}
          />
          <AppButton label="Receive more goods" onPress={() => void draft.restart()} />
        </FormPage>
      </>
    );

  if (mode === 'products')
    return (
      <>
        <Stack.Screen options={{ title: 'Add products' }} />
        <AppButton label="Back to receiving" variant="secondary" onPress={() => setMode('form')} />
        <ProductPicker
          onSelect={(product) => {
            setMode('form');
            void addProduct(product).catch(() => undefined);
          }}
        />
      </>
    );

  if (mode === 'suppliers') {
    const term = supplierSearch.trim().toLocaleLowerCase();
    const rows = (suppliers.data ?? []).filter((s) => !term || s.name.toLocaleLowerCase().includes(term));
    return (
      <>
        <Stack.Screen options={{ title: 'Choose supplier' }} />
        <FormPage title="Supplier">
          <AppInput label="Search suppliers" value={supplierSearch} onChangeText={setSupplierSearch} />
          {suppliers.isError ? <StatusBanner tone="danger" message="Could not load suppliers." /> : null}
          <ListRow
            title="No supplier"
            onPress={() => {
              void update((f) => ({ ...f, supplierId: '', supplierName: '' }));
              setMode('form');
            }}
          />
          {rows.slice(0, 50).map((supplier) => (
            <ListRow
              key={supplier.id}
              title={supplier.name}
              subtitle={supplier.phone ?? undefined}
              onPress={() => {
                void update((f) => ({ ...f, supplierId: supplier.id, supplierName: supplier.name }));
                setMode('form');
              }}
            />
          ))}
        </FormPage>
      </>
    );
  }

  const locked = record.phase === 'submitted';
  const current = form;
  return (
    <>
      <Stack.Screen options={{ title: 'Receive goods' }} />
      <FormPage title="Receive goods">
        <DraftNotice locked={locked} error="" onDiscard={() => void draft.restart()} />
        {banner ? <StatusBanner tone={banner.tone} message={banner.message} /> : null}
        {locked ? (
          <AppButton label="Retry saving" loading={submitting} onPress={() => void submit()} />
        ) : current ? (
          <>
            <ListRow
              title={current.supplierName || 'No supplier'}
              subtitle="Supplier"
              icon="business-outline"
              onPress={() => setMode('suppliers')}
            />
            <AppInput
              label="Reference number (optional)"
              value={current.referenceNumber}
              maxLength={200}
              onChangeText={(referenceNumber) => void update((f) => ({ ...f, referenceNumber }))}
            />
            {duplicate.data?.duplicate ? (
              <StatusBanner
                tone="warning"
                message="A receiving with this supplier and reference may already exist. You can still save after checking it on the PC."
              />
            ) : null}
            <AppInput
              label="Received on (YYYY-MM-DD)"
              value={current.receivedOn}
              maxLength={10}
              onChangeText={(receivedOn) => void update((f) => ({ ...f, receivedOn }))}
            />
            <AppInput
              label="Note (optional)"
              value={current.note}
              maxLength={2000}
              onChangeText={(note) => void update((f) => ({ ...f, note }))}
            />
            <ScanPanel onCode={onCode} disabled={submitting} />
            <AppButton label="Search products" variant="secondary" onPress={() => setMode('products')} />
            <Text accessibilityRole="header" style={readStyles.section}>
              Products ({current.lines.length})
            </Text>
            {current.lines.map((line) => (
              <Card key={line.productId} title={line.name}>
                <Text style={readStyles.subtitle}>
                  {line.sku}
                </Text>
                <QuantityStepper
                  value={line.quantity}
                  min={1}
                  label={`Quantity received for ${line.name}`}
                  onChange={(quantity) => void update((f) => setReceiveQuantity(f, line.productId, quantity))}
                />
                <AppButton
                  label="Remove"
                  variant="secondary"
                  onPress={() => void update((f) => removeReceiveLine(f, line.productId))}
                />
              </Card>
            ))}
            <AppButton
              label="Save receiving"
              loading={submitting}
              disabled={!current.lines.length}
              onPress={() => void submit()}
            />
          </>
        ) : null}
      </FormPage>
    </>
  );
}
