import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { AppButton } from '../../components/AppButton';
import { Text, View } from 'react-native';
import { formatDateTime } from '@shared/money-format';
import { getProduct, getInventory, listMovements } from '../../api/catalog-api';
import { queryKeys } from '../../query/keys';
import { useLookup, useLookupPages } from '../useLookup';
import { LookupList } from '../LookupList';
import { Card, Field, ReadState, readStyles } from '../ReadUI';
import { humanLabel } from '../filters';
export function ProductDetailScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>(),
    { client, key, scope } = useLookup(),
    router = useRouter();
  const product = useQuery({
    queryKey: queryKeys.product(scope, id),
    queryFn: () => getProduct(client, id),
    enabled: Boolean(id),
  });
  const inventory = useQuery({
    queryKey: key('product-inventory', { id }),
    queryFn: () => getInventory(client, id),
    enabled: Boolean(id),
  });
  const movements = useLookupPages(
    key('product-movements', { id }),
    (page) => listMovements(client, id, page),
    Boolean(id)
  );
  const data = product.data,
    stock = inventory.data;
  return (
    <>
      <Stack.Screen options={{ title: 'Product details' }} />
      <LookupList
        title={data?.name ?? 'Product details'}
        subtitle={data ? `${data.sku} · ${data.model}` : undefined}
        query={{
          ...movements,
          refetch: async () => {
            await Promise.all([product.refetch(), inventory.refetch(), movements.refetch()]);
          },
        }}
        itemKey={(item) => item.id}
        header={
          <View style={{ gap: 16 }}>
            <ReadState query={product} />
            {data && (
              <>
                <Card title="Prices">
                  <Field label="Currency" value={data.priceCurrency ?? 'USD'} />
                  <Field
                    label="Cash price (including VAT)"
                    value={
                      data.pricing?.cashPriceIncVat ?? data.pricing?.cashPrice ?? data.netPrice
                    }
                    money
                    currency={data.priceCurrency}
                  />
                  {data.pricing?.cashPriceExVat !== undefined && (
                    <Field
                      label="Cash price (excluding VAT)"
                      value={data.pricing.cashPriceExVat}
                      money
                      currency={data.priceCurrency}
                    />
                  )}
                  {data.pricing?.vatAmount !== undefined && (
                    <Field
                      label="VAT"
                      value={data.pricing.vatAmount}
                      money
                      currency={data.priceCurrency}
                    />
                  )}
                  {data.pricing?.installmentPrice !== undefined && (
                    <Field
                      label="Installment price"
                      value={data.pricing.installmentPrice}
                      money
                      currency={data.priceCurrency}
                    />
                  )}
                  {data.pricing?.monthlyPayment !== undefined && (
                    <Field
                      label="Monthly payment"
                      value={data.pricing.monthlyPayment}
                      money
                      currency={data.priceCurrency}
                    />
                  )}
                </Card>
                <Card title="Product">
                  <Field label="Brand" value={data.brand} />
                  <Field label="Category" value={data.categoryPath} />
                  <Field label="Barcode" value={data.barcode} />
                  <Field label="Status" value={data.isActive ? 'Active' : 'Archived'} />
                  {data.notes && <Text style={readStyles.subtitle}>{data.notes}</Text>}
                </Card>
              </>
            )}
            <ReadState query={inventory} />
            {stock && (
              <Card title="Shared stock · all branches">
                <Field label="Quantity" value={stock.product.stockQuantity} />
                <Field label="Status" value={humanLabel(stock.product.stockStatus)} />
                <Field label="Reorder level" value={stock.product.lowStockThreshold} />
                {stock.product.trackStock && (
                  <AppButton
                    label="Adjust stock"
                    variant="secondary"
                    onPress={() =>
                      router.push({ pathname: '/(tabs)/stock/adjust/[id]', params: { id } })
                    }
                  />
                )}
              </Card>
            )}
            <Text accessibilityRole="header" style={readStyles.section}>
              Stock movements · all branches
            </Text>
          </View>
        }
        empty="No stock movements recorded."
        renderItem={(item) => (
          <Card>
            <Field label={humanLabel(item.movementType)} value={formatDateTime(item.createdAt)} />
            <Field label="Quantity change" value={item.quantityChange} />
            <Field label="Before" value={item.quantityBefore} />
            <Field label="After" value={item.quantityAfter} />
            <Text style={readStyles.subtitle}>{item.reason}</Text>
          </Card>
        )}
      />
    </>
  );
}
