import { useState } from 'react';
import { Stack, useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { formatMoney } from '@shared/money-format';
import { ListRow } from '../components/ListRow';
import { SearchBar } from '../components/SearchBar';
import { LookupList } from '../lookup/LookupList';
import { SelectFilter, useDebouncedSearch } from '../lookup/FilterControls';
import { useLookup, useLookupPages } from '../lookup/useLookup';
import { readStyles } from '../lookup/ReadUI';
import { listPrepaid, statusLabels, type PrepaidStatusFilter } from './prepaid';

/** Prepaid items across customers, as on the desktop Prepaid purchases page. */
export function PrepaidListScreen() {
  const { client, key } = useLookup(),
    router = useRouter();
  const [status, setStatus] = useState<PrepaidStatusFilter>('PENDING'),
    [search, setSearch] = useState(''),
    term = useDebouncedSearch(search);
  const [remaining, setRemaining] = useState<string | null>(null);
  const query = useLookupPages(key('prepaid', { status, term }), async (page) => {
    const data = await listPrepaid(client, { status, search: term, page });
    if (page === 1) setRemaining(data.summary.totalRemainingToCollect);
    return {
      items: data.items,
      nextPage: data.pagination.page < data.pagination.totalPages ? page + 1 : undefined,
    };
  });
  return (
    <>
      <Stack.Screen options={{ title: 'Prepaid items' }} />
      <LookupList
        title="Prepaid items"
        subtitle="Items customers paid for in advance."
        query={query}
        itemKey={(item) => item.id}
        header={
          <View style={{ gap: 10 }}>
            <SelectFilter
              label="Status"
              value={status}
              onChange={(value) => setStatus(value as PrepaidStatusFilter)}
              options={[
                { value: 'PENDING', label: 'Awaiting delivery' },
                { value: 'DELIVERED', label: 'Delivered' },
                { value: 'CANCELLED', label: 'Cancelled' },
                { value: 'ALL', label: 'All' },
              ]}
            />
            <SearchBar label="Search prepaid items" placeholder="Customer or item" value={search} onChangeText={setSearch} />
            {remaining !== null && (
              <Text style={readStyles.subtitle}>Still to collect: {formatMoney(remaining)}</Text>
            )}
          </View>
        }
        renderItem={(item) => (
          <ListRow
            title={`${item.itemName} · ${item.customer.name}`}
            subtitle={`${statusLabels[item.status]} · Paid ${formatMoney(item.amountPaid)} of ${formatMoney(item.fullAmount)}`}
            onPress={() => router.push({ pathname: '/(tabs)/sell/prepaid/[id]', params: { id: item.id } })}
          />
        )}
      />
    </>
  );
}
