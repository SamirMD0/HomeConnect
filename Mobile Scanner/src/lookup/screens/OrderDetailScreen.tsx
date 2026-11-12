import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Text } from 'react-native';
import { formatBusinessDate } from '@shared/money-format';
import { getSalesOrder } from '../../api/sales-orders-api';
import { useLookup } from '../useLookup';
import { Card, Field, PagedRows, ReadScreen, ReadState, readStyles } from '../ReadUI';
import { humanLabel } from '../filters';
export function OrderDetailScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>(),
    { client, key, session } = useLookup();
  const order = useQuery({
    queryKey: key('sales-order', { id }),
    queryFn: () => getSalesOrder(client, id),
    enabled: session.can('sell'),
  });
  const data = order.data;
  return (
    <>
      <Stack.Screen options={{ title: 'Sales order' }} />
      <ReadScreen refreshing={order.isRefetching} onRefresh={() => void order.refetch()}>
        <ReadState query={order} />
        {data && (
          <>
            <Text accessibilityRole="header" style={readStyles.title}>
              {data.orderNumber}
            </Text>
            <Card title="Order">
              <Field label="Customer" value={data.customer?.name ?? 'Walk-in customer'} />
              <Field label="Phone" value={data.customer?.phone} />
              <Field label="Date" value={formatBusinessDate(data.orderDate)} />
              <Field label="Fulfillment" value={humanLabel(data.fulfillmentStatus)} />
              <Field label="Payment" value={humanLabel(data.paymentStatus)} />
              <Field label="Settlement" value={humanLabel(data.settlement)} />
              <Field
                label="Branch"
                value={
                  session.branch.branches.find((b) => b.id === data.branchId)?.name ??
                  session.branch.selected?.name
                }
              />
            </Card>
            <Card title="Totals">
              <Field
                label="Subtotal (excluding VAT)"
                value={data.subtotalExVat}
                money
                currency={data.currency}
              />
              <Field
                label="Delivery (including VAT)"
                value={data.deliveryFeeIncVat}
                money
                currency={data.currency}
              />
              <Field label="VAT" value={data.vatAmount} money currency={data.currency} />
              <Field label="Total" value={data.totalAmount} money currency={data.currency} />
              <Field label="Paid" value={data.paidAmount} money currency={data.currency} incoming />
              <Field
                label="Remaining"
                value={data.remainingAmount}
                money
                currency={data.currency}
              />
            </Card>
            <PagedRows
              title="Items"
              rows={data.items ?? []}
              rowKey={(item) => item.id}
              render={(item) => (
                <Card title={item.productNameSnapshot}>
                  <Field label="SKU" value={item.skuSnapshot} />
                  <Field label="Quantity" value={item.quantity} />
                  <Field label="Unit price" value={item.unitPrice} money currency={data.currency} />
                  <Field label="VAT" value={item.vatAmount} money currency={data.currency} />
                  <Field
                    label="Line total (including VAT)"
                    value={item.lineTotalIncVat}
                    money
                    currency={data.currency}
                  />
                </Card>
              )}
            />
            <Card title="Delivery">
              <Field label="Date" value={formatBusinessDate(data.deliveryDate)} />
              <Field label="Address" value={data.deliveryAddressSnapshot} />
              {data.deliveryNotes && <Text style={readStyles.subtitle}>{data.deliveryNotes}</Text>}
            </Card>
            {data.notes && (
              <Card title="Notes">
                <Text style={readStyles.subtitle}>{data.notes}</Text>
              </Card>
            )}
          </>
        )}
      </ReadScreen>
    </>
  );
}
