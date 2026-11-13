import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Image, Text, View } from 'react-native';
import { formatDateTime } from '@shared/money-format';
import type { BillRead } from '@shared/lookup-contracts';
import { getBillImage, listBills } from '../../api/supplier-lookup-api';
import { useLookup } from '../useLookup';
import { ListRow } from '../../components/ListRow';
import { Sheet } from '../../components/Sheet';
import { PagedRows, ReadScreen, ReadState, readStyles } from '../ReadUI';
import { SelectFilter } from '../FilterControls';
export function BillsScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>(),
    { client, key } = useLookup();
  const [linked, setLinked] = useState<'all' | 'true' | 'false'>('all'),
    [selected, setSelected] = useState<BillRead | null>(null);
  const bills = useQuery({
    queryKey: key('supplier-bills', { id, linked }),
    queryFn: () => listBills(client, id, linked),
  });
  const image = useQuery({
    queryKey: key('bill-image', { id: selected?.id }),
    queryFn: () => getBillImage(client, selected!),
    enabled: Boolean(selected),
    gcTime: 0,
  });
  return (
    <>
      <Stack.Screen options={{ title: 'Supplier bills' }} />
      <ReadScreen refreshing={bills.isRefetching} onRefresh={() => void bills.refetch()}>
        <SelectFilter
          label="Linked purchase"
          value={linked}
          onChange={(value) => setLinked(value as typeof linked)}
          options={[
            { value: 'all', label: 'All bills' },
            { value: 'true', label: 'Linked' },
            { value: 'false', label: 'Unlinked' },
          ]}
        />
        <ReadState query={bills} />
        {bills.data && (
          <PagedRows
            key={linked}
            title="Bills"
            rows={bills.data}
            rowKey={(bill) => bill.id}
            render={(bill) => (
              <ListRow
                title={bill.note || 'Bill photo'}
                subtitle={`${formatDateTime(bill.capturedAt)} · ${bill.supplierReceivingId ? 'Linked' : 'Unlinked'}`}
                onPress={() => setSelected(bill)}
              />
            )}
          />
        )}
      </ReadScreen>
      <Sheet title="Bill photo" visible={Boolean(selected)} onClose={() => setSelected(null)}>
        <View style={{ padding: 16, gap: 12 }}>
          <ReadState query={image} />
          {image.data && (
            <Image
              accessibilityLabel="Supplier bill photo"
              source={{ uri: image.data }}
              style={{ width: '100%', height: 480 }}
              resizeMode="contain"
            />
          )}
          {selected?.note && <Text style={readStyles.subtitle}>{selected.note}</Text>}
        </View>
      </Sheet>
    </>
  );
}
