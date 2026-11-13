import { useState } from 'react';
import { Stack, useRouter } from 'expo-router';
import { View, useWindowDimensions } from 'react-native';
import { formatBusinessDate } from '@shared/money-format';
import { listSalesOrders, type OrderLookupFilters } from '../../api/sales-orders-api';
import { useLookup, useLookupPages } from '../useLookup';
import { LookupList } from '../LookupList';
import { SearchBar } from '../../components/SearchBar';
import { ListRow } from '../../components/ListRow';
import { MoneyText } from '../../components/MoneyText';
import { AppButton } from '../../components/AppButton';
import { Sheet } from '../../components/Sheet';
import { RangeFilter, SelectFilter, useDebouncedSearch } from '../FilterControls';
import { humanLabel, monthRange } from '../filters';
import { CustomersScreen } from './CustomersScreen';
export function OrdersScreen() {
  const { height } = useWindowDimensions();
  const { client, key, session } = useLookup(),
    router = useRouter();
  const [search, setSearch] = useState(''),
    term = useDebouncedSearch(search);
  const [status, setStatus] = useState(''),
    [payment, setPayment] = useState(''),
    [range, setRange] = useState(monthRange);
  const [customer, setCustomer] = useState<{ id: string; name: string } | null>(null),
    [picking, setPicking] = useState(false);
  const filters: OrderLookupFilters = {
    search: term,
    fulfillmentStatus: status ? [status] : undefined,
    paymentStatus: payment ? [payment] : undefined,
    dateFrom: range.from,
    dateTo: range.to,
    customerId: customer?.id,
  };
  const orders = useLookupPages(
    key('sales-orders', filters),
    (page) => listSalesOrders(client, filters, page),
    session.can('sell')
  );
  return (
    <>
      <Stack.Screen options={{ title: 'Sales orders' }} />
      <LookupList
        title="Sales orders"
        query={orders}
        itemKey={(item) => item.id}
        header={
          <View style={{ gap: 10 }}>
            <SearchBar
              label="Search sales orders"
              placeholder="Order or customer"
              value={search}
              onChangeText={setSearch}
            />
            <RangeFilter value={range} onChange={setRange} />
            <SelectFilter
              label="Status"
              value={status}
              onChange={setStatus}
              options={[
                { value: '', label: 'All statuses' },
                ...[
                  'DRAFT',
                  'CONFIRMED',
                  'PREPARING',
                  'READY_FOR_DELIVERY',
                  'OUT_FOR_DELIVERY',
                  'DELIVERED',
                  'PARTIALLY_RETURNED',
                  'CANCELLED',
                  'RETURNED',
                ].map((value) => ({ value, label: humanLabel(value) })),
              ]}
            />
            <SelectFilter
              label="Payment"
              value={payment}
              onChange={setPayment}
              options={[
                { value: '', label: 'All payments' },
                ...['UNPAID', 'PARTIALLY_PAID', 'PAID'].map((value) => ({
                  value,
                  label: humanLabel(value),
                })),
              ]}
            />
            <AppButton
              label={`Customer: ${customer?.name ?? 'All'}`}
              variant="secondary"
              onPress={() => setPicking(true)}
            />
            {customer && (
              <AppButton
                label="Clear customer filter"
                variant="secondary"
                onPress={() => setCustomer(null)}
              />
            )}
          </View>
        }
        renderItem={(item) => (
          <ListRow
            title={item.orderNumber}
            subtitle={`${item.customer?.name ?? 'Walk-in customer'} · ${formatBusinessDate(item.orderDate)}\n${humanLabel(item.fulfillmentStatus)} · ${humanLabel(item.paymentStatus)}`}
            trailing={<MoneyText value={item.totalAmount} currency={item.currency} />}
            onPress={() =>
              router.push({ pathname: '/(tabs)/sell/order/[id]', params: { id: item.id } })
            }
          />
        )}
      />
      <Sheet
        title="Filter by customer"
        visible={picking}
        onClose={() => setPicking(false)}
        scrollable={false}
      >
        <View style={{ height: Math.max(120, Math.min(500, height * 0.85 - 180)) }}>
          <CustomersScreen
            onSelect={(id, name) => {
              setCustomer({ id, name });
              setPicking(false);
            }}
          />
        </View>
      </Sheet>
    </>
  );
}
