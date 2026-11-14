import { useState, type ReactNode } from 'react';
import { useRouter } from 'expo-router';
import { listCustomers } from '../../api/customers-api';
import { useLookup, useLookupPages } from '../useLookup';
import { LookupList } from '../LookupList';
import { SearchBar } from '../../components/SearchBar';
import { ListRow } from '../../components/ListRow';
import { MoneyText } from '../../components/MoneyText';
import { useDebouncedSearch } from '../FilterControls';
export function CustomersScreen({
  onSelect,
  intro,
}: {
  onSelect?: (id: string, name: string) => void;
  /** Shown above the search box and scrolls with the list (Customers tab actions). */
  intro?: ReactNode;
}) {
  const { client, key, session } = useLookup(),
    router = useRouter();
  const [search, setSearch] = useState(''),
    term = useDebouncedSearch(search);
  const customers = useLookupPages(
    key('customers', { search: term, include: 'financial' }),
    (page) => listCustomers(client, term, page),
    session.can('sell')
  );
  return (
    <LookupList
      title="Customers"
      query={customers}
      itemKey={(item) => item.id}
      header={
        <>
          {intro}
          <SearchBar
            label="Search customers"
            placeholder="Name or phone"
            value={search}
            onChangeText={setSearch}
          />
        </>
      }
      renderItem={(item) => (
        <ListRow
          title={item.name}
          subtitle={`${item.phone}\n${item.financial?.tier ? item.financial.tier.replace(/_/g, ' ') : item.isActive ? 'Active' : 'Archived'}`}
          trailing={<MoneyText value={item.financial?.outstanding ?? ''} />}
          onPress={() =>
            onSelect
              ? onSelect(item.id, item.name)
              : router.push({ pathname: '/(tabs)/sell/customer/[id]', params: { id: item.id } })
          }
        />
      )}
    />
  );
}
