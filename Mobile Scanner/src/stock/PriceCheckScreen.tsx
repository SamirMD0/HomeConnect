import { useState } from 'react';
import { Stack, useRouter } from 'expo-router';
import { Text } from 'react-native';
import type { ProductRead } from '@shared/lookup-contracts';
import { AppButton } from '../components/AppButton';
import { StatusBanner } from '../components/StatusBanner';
import { useLookup } from '../lookup/useLookup';
import { Card, Field, readStyles } from '../lookup/ReadUI';
import { humanLabel } from '../lookup/filters';
import { FormPage } from '../sales/FormUI';
import { ScanPanel } from './ScanPanel';
import { productForCode } from './stock-api';
import { englishMessage } from './stock-logic';

const KEEP = 10;

/** Scan to see price and shared stock. Cost appears only when the PC sends it (admins). */
export function PriceCheckScreen() {
  const { client } = useLookup(),
    router = useRouter();
  const [results, setResults] = useState<ProductRead[]>([]),
    [error, setError] = useState('');

  const onCode = async (code: string) => {
    try {
      const product = await productForCode(client, code);
      setError('');
      setResults((list) => [product, ...list.filter((row) => row.id !== product.id)].slice(0, KEEP));
    } catch (failure) {
      setError(englishMessage(failure instanceof Error ? failure.message : 'Lookup failed.'));
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Price check' }} />
      <FormPage title="Price check">
        <ScanPanel onCode={onCode} hint="Scan a product to see its price and shared stock." />
        {error ? <StatusBanner tone="danger" message={error} /> : null}
        {results.map((product, index) => (
          <Card key={product.id} title={`${index === 0 ? 'Latest · ' : ''}${product.name}`}>
            <Text style={readStyles.subtitle}>
              {product.sku}
              {product.brand ? ` · ${product.brand}` : ''}
            </Text>
            <Field
              label="Cash price (including VAT)"
              value={product.pricing?.cashPriceIncVat ?? product.pricing?.cashPrice ?? product.netPrice}
              money
              currency={product.priceCurrency}
            />
            {product.pricing?.monthlyPayment !== undefined && (
              <Field
                label={`Monthly × ${product.pricing.installmentMonths ?? ''}`}
                value={product.pricing.monthlyPayment}
                money
                currency={product.priceCurrency}
              />
            )}
            {product.pricing?.costPrice ? (
              <Field label="Cost price" value={product.pricing.costPrice} money currency={product.priceCurrency} />
            ) : null}
            <Field
              label="Shared stock · all branches"
              value={product.trackStock ? product.stockQuantity : 'Not tracked'}
            />
            <Field label="Status" value={humanLabel(product.stockStatus)} />
            <AppButton
              label="Details"
              variant="secondary"
              onPress={() => router.push({ pathname: '/(tabs)/stock/product/[id]', params: { id: product.id } })}
            />
          </Card>
        ))}
      </FormPage>
    </>
  );
}
