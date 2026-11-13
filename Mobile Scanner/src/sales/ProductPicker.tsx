import { useState } from 'react';
import type { ProductRead } from '@shared/lookup-contracts';
import { listProducts } from '../api/catalog-api';
import { useLookup, useLookupPages } from '../lookup/useLookup';
import { LookupList } from '../lookup/LookupList';
import { SearchBar } from '../components/SearchBar';
import { ListRow } from '../components/ListRow';
import { MoneyText } from '../components/MoneyText';
import { useDebouncedSearch } from '../lookup/FilterControls';
export function ProductPicker({ onSelect }: { onSelect: (product: ProductRead) => void }) {
  const { client, key } = useLookup();
  const [search, setSearch] = useState(''),
    term = useDebouncedSearch(search);
  const query = useLookupPages(key('order-product-picker', { search: term }), (page) =>
    listProducts(client, { search: term, isActive: true }, page)
  );
  return (
    <LookupList
      title="Add a product"
      query={query}
      itemKey={(row) => row.id}
      header={
        <SearchBar
          label="Search order products"
          value={search}
          onChangeText={setSearch}
          placeholder="Name, SKU or barcode"
        />
      }
      renderItem={(row) => (
        <ListRow
          title={row.name}
          subtitle={`${row.sku} · Shared stock: ${row.stockQuantity}`}
          trailing={
            <MoneyText
              value={row.pricing?.cashPrice ?? row.netPrice ?? row.price ?? ''}
              currency={row.priceCurrency}
            />
          }
          onPress={() => onSelect(row)}
        />
      )}
    />
  );
}
