import { useEffect, useRef, useState } from 'react';
import { Redirect, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, Text, View, useWindowDimensions } from 'react-native';
import type { ProductRead } from '@shared/lookup-contracts';
import { AppButton } from '../components/AppButton';
import { AppInput } from '../components/AppInput';
import { StatusBanner } from '../components/StatusBanner';
import { Sheet } from '../components/Sheet';
import { Card, Field, readStyles } from '../lookup/ReadUI';
import { SelectFilter } from '../lookup/FilterControls';
import { CustomersScreen } from '../lookup/screens/CustomersScreen';
import { getProduct } from '../api/catalog-api';
import { createCustomer, createOrder } from '../api/sales-write-api';
import { queryKeys } from '../query/keys';
import { useQueryClient } from '@tanstack/react-query';
import { ProductPicker } from './ProductPicker';
import { FormPage, DraftNotice } from './FormUI';
import { useSalesDraft } from './useSalesDraft';
import { buildCustomerPayload, buildOrderPayload } from './payloads';
import type { OrderForm, OrderPayload } from './contracts';

export function OrderScreen() {
  const draft = useSalesDraft<OrderForm, OrderPayload>('order'),
    router = useRouter(),
    queryClient = useQueryClient();
  const { productId, scanKey } = useLocalSearchParams<{ productId?: string; scanKey?: string }>();
  const [picker, setPicker] = useState<'customer' | 'product' | 'create' | null>(null),
    [creating, setCreating] = useState(false);
  const [adding, setAdding] = useState(false),
    scanInFlight = useRef('');
  const { height } = useWindowDimensions();
  const form = draft.record?.form,
    locked = draft.record?.phase === 'submitted' || draft.mutation.isPending;
  const change = <K extends keyof OrderForm>(key: K, value: OrderForm[K]) => {
    if (form) draft.edit({ ...form, [key]: value });
  };
  const addProduct = async (product: ProductRead, eventKey?: string) => {
    const current = draft.store?.current.form;
    if (!current || draft.store?.current.phase !== 'editing')
      throw new Error('Resolve the current order before adding products.');
    if (!product.isActive) throw new Error('Archived products cannot be ordered.');
    const currency = product.priceCurrency ?? 'USD';
    if (current.items.length && current.currency !== currency)
      throw new Error(
        'Choose a product in the order currency. Prices are not converted on the phone.'
      );
    if (current.items.length >= 50) throw new Error('An order can contain at most 50 lines.');
    const line = {
      productId: product.id,
      name: product.name,
      sku: product.sku,
      quantity: '1',
      unitPrice: product.pricing?.pricingAvailable
        ? (product.pricing.cashPrice ?? '0.00')
        : (product.netPrice ?? product.price ?? '0.00'),
      discountAmount: '0.00',
    };
    await draft.store.edit({
      ...current,
      currency,
      items: [...current.items, line],
      lastScanKey: eventKey ?? current.lastScanKey,
    });
    setPicker(null);
  };
  useEffect(() => {
    if (
      !productId ||
      !scanKey ||
      !draft.store ||
      draft.record?.phase !== 'editing' ||
      draft.record.form?.lastScanKey === scanKey ||
      scanInFlight.current === scanKey
    )
      return;
    scanInFlight.current = scanKey;
    setAdding(true);
    void getProduct(draft.client, productId)
      .then((product) => addProduct(product, scanKey))
      .then(() => router.setParams({ productId: '', scanKey: '' }))
      .catch((failure: Error) => draft.setError(failure.message))
      .finally(() => {
        scanInFlight.current = '';
        setAdding(false);
      });
    // The durable event marker prevents replay after a restart; callbacks read the current store.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, scanKey, draft.store]);
  if (!draft.session.can('orders.create')) return <Redirect href="/(tabs)/sell" />;
  const discard = () =>
    Alert.alert('Discard saved form?', 'This removes this phone’s unsaved order.', [
      { text: 'Keep form', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          void draft.discard().catch((error: Error) => draft.setError(error.message));
        },
      },
    ]);
  const submit = (asDraft: boolean) =>
    draft.mutation.mutate({
      build: (value, key) => buildOrderPayload(value, key, asDraft),
      send: async (payload) => ({ kind: 'order', order: await createOrder(draft.client, payload) }),
    });
  const result = draft.record?.result;
  return (
    <>
      <Stack.Screen options={{ title: 'New order' }} />
      <FormPage title={result ? 'Order saved' : 'New order'}>
        {!draft.record && (
          <Text style={readStyles.subtitle}>{draft.error || 'Loading saved form…'}</Text>
        )}
        {result?.kind === 'order' && (
          <>
            <Card title={result.order.orderNumber}>
              <Field label="Status" value={result.order.fulfillmentStatus} />
              <Field
                label="Subtotal (excluding VAT)"
                value={result.order.subtotalExVat}
                money
                currency={result.order.currency}
              />
              <Field
                label="VAT"
                value={result.order.vatAmount}
                money
                currency={result.order.currency}
              />
              <Field
                label="Total from PC"
                value={result.order.totalAmount}
                money
                currency={result.order.currency}
              />
              <Field
                label="Paid"
                value={result.order.paidAmount}
                money
                currency={result.order.currency}
              />
              <Field
                label="Remaining"
                value={result.order.remainingAmount}
                money
                currency={result.order.currency}
              />
            </Card>
            <AppButton
              label="View saved order"
              onPress={() =>
                router.push({
                  pathname: '/(tabs)/sell/order/[id]',
                  params: { id: result.order.id },
                })
              }
            />
            <AppButton
              label="Start another order"
              variant="secondary"
              onPress={() =>
                void draft.discard().catch((err: Error) => draft.setError(err.message))
              }
            />
          </>
        )}
        {form && (
          <>
            <DraftNotice locked={locked} error={draft.error} onDiscard={discard} />
            <View
              pointerEvents={locked || adding || creating ? 'none' : 'auto'}
              accessibilityElementsHidden={false}
              style={{ gap: 16, opacity: locked ? 0.65 : 1 }}
            >
              <Card title="Customer">
                <Text style={readStyles.subtitle}>
                  {form.customerName || 'Choose an existing customer or create one.'}
                </Text>
                <AppButton
                  disabled={locked}
                  label="Choose customer"
                  variant="secondary"
                  onPress={() => setPicker('customer')}
                />
                {draft.session.can('customers.create') && (
                  <AppButton
                    disabled={locked}
                    label="Create customer"
                    variant="secondary"
                    onPress={() => setPicker('create')}
                  />
                )}
              </Card>
              <SelectFilter
                label="Order currency"
                value={form.currency}
                onChange={(value) => change('currency', value as OrderForm['currency'])}
                options={[
                  { value: 'USD', label: 'USD' },
                  { value: 'LBP', label: 'LBP' },
                ]}
              />
              <SelectFilter
                label="Sales channel"
                value={form.salesChannel}
                onChange={(value) => change('salesChannel', value as OrderForm['salesChannel'])}
                options={[
                  { value: 'SHOP_DIRECT', label: 'Shop direct' },
                  { value: 'SHOP_DELIVERY', label: 'Shop delivery' },
                  { value: 'PHONE_ORDER', label: 'Phone order' },
                ]}
              />
              <AppInput
                label="Order date"
                value={form.orderDate}
                onChangeText={(value) => change('orderDate', value)}
                placeholder="YYYY-MM-DD"
                editable={!locked}
              />
              <Card title="Products">
                {form.items.map((line, index) => (
                  <Card key={index} title={line.name}>
                    <Field label="SKU" value={line.sku} />
                    <AppInput
                      label={`Quantity · line ${index + 1}`}
                      value={line.quantity}
                      keyboardType="number-pad"
                      editable={!locked}
                      onChangeText={(value) =>
                        change(
                          'items',
                          form.items.map((item, i) =>
                            i === index ? { ...item, quantity: value } : item
                          )
                        )
                      }
                    />
                    <AppInput
                      label={`Unit price · line ${index + 1}`}
                      value={line.unitPrice}
                      keyboardType="decimal-pad"
                      editable={!locked}
                      onChangeText={(value) =>
                        change(
                          'items',
                          form.items.map((item, i) =>
                            i === index ? { ...item, unitPrice: value } : item
                          )
                        )
                      }
                    />
                    <AppInput
                      label={`Discount amount · line ${index + 1}`}
                      value={line.discountAmount}
                      keyboardType="decimal-pad"
                      editable={!locked}
                      onChangeText={(value) =>
                        change(
                          'items',
                          form.items.map((item, i) =>
                            i === index ? { ...item, discountAmount: value } : item
                          )
                        )
                      }
                    />
                    <AppButton
                      label={`Remove line ${index + 1}`}
                      variant="secondary"
                      disabled={locked}
                      onPress={() =>
                        change(
                          'items',
                          form.items.filter((_, i) => i !== index)
                        )
                      }
                    />
                  </Card>
                ))}
                <AppButton
                  label="Search products"
                  variant="secondary"
                  disabled={locked || adding}
                  onPress={() => setPicker('product')}
                />
                <AppButton
                  label="Scan a product for this order"
                  disabled={locked || adding}
                  onPress={() => router.push('/scan')}
                />
              </Card>
              <Card title="Payment">
                <AppInput
                  label="Amount received"
                  value={form.paidAmount}
                  keyboardType="decimal-pad"
                  editable={!locked}
                  onChangeText={(value) => change('paidAmount', value)}
                />
                <AppInput
                  label="Debt due date"
                  value={form.debtDueDate}
                  placeholder="YYYY-MM-DD"
                  editable={!locked}
                  onChangeText={(value) => change('debtDueDate', value)}
                />
              </Card>
              {form.salesChannel !== 'SHOP_DIRECT' && (
                <Card title="Delivery">
                  <AppInput
                    label="Delivery date"
                    value={form.deliveryDate}
                    placeholder="YYYY-MM-DD"
                    onChangeText={(value) => change('deliveryDate', value)}
                  />
                  <AppInput
                    label="Delivery fee"
                    value={form.deliveryFee}
                    keyboardType="decimal-pad"
                    onChangeText={(value) => change('deliveryFee', value)}
                  />
                  <SelectFilter
                    label="Delivery VAT"
                    value={form.deliveryTaxTreatment}
                    onChange={(value) =>
                      change('deliveryTaxTreatment', value as OrderForm['deliveryTaxTreatment'])
                    }
                    options={['STANDARD', 'ZERO_RATED', 'EXEMPT'].map((value) => ({
                      value,
                      label: value.replace('_', ' '),
                    }))}
                  />
                  <AppInput
                    label="Delivery address"
                    value={form.deliveryAddress}
                    onChangeText={(value) => change('deliveryAddress', value)}
                    multiline
                  />
                  <AppInput
                    label="Delivery notes"
                    value={form.deliveryNotes}
                    onChangeText={(value) => change('deliveryNotes', value)}
                    multiline
                  />
                </Card>
              )}
            </View>
            {locked ? (
              <AppButton
                label="Retry original submission"
                loading={draft.mutation.isPending}
                onPress={() => submit(false)}
              />
            ) : (
              <>
                <AppButton
                  label="Save draft on PC"
                  variant="secondary"
                  loading={draft.mutation.isPending}
                  disabled={adding || creating}
                  onPress={() => submit(true)}
                />
                <AppButton
                  label="Confirm order"
                  loading={draft.mutation.isPending}
                  disabled={adding || creating}
                  onPress={() => submit(false)}
                />
              </>
            )}
          </>
        )}
        <Sheet
          title={
            picker === 'product' ? 'Products' : picker === 'create' ? 'New customer' : 'Customers'
          }
          visible={Boolean(picker)}
          onClose={() => {
            if (!creating) setPicker(null);
          }}
          scrollable={picker === 'create'}
        >
          {draft.error && (
            <View style={{ padding: 16 }}>
              <StatusBanner tone="danger" message={draft.error} />
            </View>
          )}
          {picker === 'product' && (
            <View style={{ height: Math.max(160, Math.min(500, height * 0.85 - 140)) }}>
              <ProductPicker
                onSelect={(product) => {
                  void addProduct(product).catch((failure: Error) =>
                    draft.setError(failure.message)
                  );
                }}
              />
            </View>
          )}
          {picker === 'customer' && (
            <View style={{ height: Math.max(160, Math.min(500, height * 0.85 - 140)) }}>
              <CustomersScreen
                onSelect={(customerId, customerName) => {
                  if (form) draft.edit({ ...form, customerId, customerName });
                  setPicker(null);
                }}
              />
            </View>
          )}
          {picker === 'create' && form && (
            <View style={{ padding: 16, gap: 12 }}>
              {(['name', 'phone', 'address', 'notes'] as const).map((field) => (
                <AppInput
                  key={field}
                  label={`Customer ${field}`}
                  value={form.newCustomer[field]}
                  editable={!creating}
                  keyboardType={field === 'phone' ? 'phone-pad' : 'default'}
                  onChangeText={(value) =>
                    change('newCustomer', { ...form.newCustomer, [field]: value })
                  }
                />
              ))}
              <AppButton
                label="Save customer"
                loading={creating}
                onPress={() => {
                  let payload;
                  try {
                    payload = buildCustomerPayload(form.newCustomer);
                  } catch (failure) {
                    draft.setError((failure as Error).message);
                    return;
                  }
                  setCreating(true);
                  void createCustomer(draft.client, payload)
                    .then(async (customer) => {
                      const current = draft.store?.current.form;
                      if (current)
                        await draft.store?.edit({
                          ...current,
                          customerId: customer.id,
                          customerName: customer.name,
                          newCustomer: { name: '', phone: '', address: '', notes: '' },
                        });
                      await queryClient.invalidateQueries({
                        queryKey: queryKeys.scope(draft.scope),
                      });
                      setPicker(null);
                    })
                    .catch((failure: Error) => {
                      draft.setError(
                        `${failure.message} Search customers before creating again if the response was interrupted.`
                      );
                      setPicker('customer');
                    })
                    .finally(() => setCreating(false));
                }}
              />
            </View>
          )}
        </Sheet>
      </FormPage>
    </>
  );
}
