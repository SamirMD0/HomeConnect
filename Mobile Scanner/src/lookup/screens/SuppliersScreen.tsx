import { useState } from 'react';
import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { SupplierShortcuts } from '../../suppliers/SupplierShortcuts';
import { listSupplierLookup } from '../../api/supplier-lookup-api';
import { useLookup, useLookupPages } from '../useLookup';
import { LookupList } from '../LookupList';
import { SearchBar } from '../../components/SearchBar';
import { ListRow } from '../../components/ListRow';
import { MoneyText } from '../../components/MoneyText';
import { useDebouncedSearch } from '../FilterControls';
export function SuppliersScreen({ statement = false }: { statement?: boolean }) {
  const { client, key, session } = useLookup(),
    router = useRouter();
  const [search, setSearch] = useState(''),
    term = useDebouncedSearch(search);
  const suppliers = useLookupPages(
    key('suppliers', { search: term }),
    (page) => listSupplierLookup(client, term, page),
    session.can('suppliers.read')
  );
  return (
    <LookupList
      title={statement ? 'Choose a supplier' : 'Suppliers'}
      query={suppliers}
      itemKey={(item) => item.id}
      header={
        <View style={{ gap: 10 }}>
          {!statement && <SupplierShortcuts />}
          <SearchBar
            label="Search suppliers"
            placeholder="Name, company or phone"
            value={search}
            onChangeText={setSearch}
          />
        </View>
      }
      renderItem={(item) => (
        <ListRow
          title={item.name}
          subtitle={[item.companyName, item.phone, item.isActive ? '' : 'Archived']
            .filter(Boolean)
            .join(' · ')}
          trailing={<MoneyText value={item.balance} />}
          onPress={() =>
            router.push({
              pathname: statement
                ? '/(tabs)/suppliers/detail/[id]/statement'
                : '/(tabs)/suppliers/detail/[id]',
              params: { id: item.id },
            })
          }
        />
      )}
    />
  );
}
