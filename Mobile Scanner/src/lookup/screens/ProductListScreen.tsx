import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { listProducts, getBrands, getCategories } from '../../api/catalog-api';
import { LookupList } from '../LookupList';
import { useLookup, useLookupPages } from '../useLookup';
import { SearchBar } from '../../components/SearchBar';
import { ListRow } from '../../components/ListRow';
import { MoneyText } from '../../components/MoneyText';
import { ErrorState } from '../../components/ErrorState';
import { SelectFilter, useDebouncedSearch } from '../FilterControls';
import { StockActions } from '../../stock/StockActions';
export function ProductListScreen() {
  const { client, key, session } = useLookup(),
    router = useRouter();
  const [search, setSearch] = useState(''),
    [brand, setBrand] = useState(''),
    [categoryId, setCategory] = useState('');
  const querySearch = useDebouncedSearch(search),
    filters = { search: querySearch, brand, categoryId, isActive: true };
  const products = useLookupPages(
    key('products', filters),
    (page) => listProducts(client, filters, page),
    session.can('stock')
  );
  const brands = useQuery({ queryKey: key('brands'), queryFn: () => getBrands(client) });
  const categories = useQuery({
    queryKey: key('categories'),
    queryFn: () => getCategories(client),
  });
  return (
    <LookupList
      title="Products & stock"
      query={products}
      itemKey={(item) => item.id}
      header={
        <View style={{ gap: 10 }}>
          <StockActions />
          <SearchBar
            label="Search products"
            placeholder="Name, SKU or barcode"
            value={search}
            onChangeText={setSearch}
          />
          <SelectFilter
            label="Brand"
            value={brand}
            onChange={setBrand}
            options={[
              { value: '', label: 'All brands' },
              ...(brands.data ?? []).map((b) => ({ value: b.canonical, label: b.canonical })),
            ]}
          />
          <SelectFilter
            label="Category"
            value={categoryId}
            onChange={setCategory}
            options={[
              { value: '', label: 'All categories' },
              ...(categories.data ?? [])
                .filter((c) => c.isActive)
                .map((c) => ({ value: c.id, label: c.path })),
            ]}
          />
          {(brands.isError || categories.isError) && (
            <ErrorState
              message="Could not load filter options."
              onRetry={() => {
                void brands.refetch();
                void categories.refetch();
              }}
            />
          )}
        </View>
      }
      renderItem={(item) => (
        <ListRow
          title={item.name}
          subtitle={`${item.sku} · ${item.brand ?? 'No brand'}\n${item.trackStock ? `${item.stockQuantity} in shared stock` : 'Stock not tracked'}`}
          trailing={
            <MoneyText
              value={
                item.pricing?.cashPriceIncVat ?? item.pricing?.cashPrice ?? item.netPrice ?? ''
              }
              currency={item.priceCurrency}
            />
          }
          onPress={() =>
            router.push({ pathname: '/(tabs)/stock/product/[id]', params: { id: item.id } })
          }
        />
      )}
    />
  );
}
