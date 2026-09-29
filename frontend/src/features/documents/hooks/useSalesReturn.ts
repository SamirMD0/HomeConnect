import { useQuery } from '@tanstack/react-query';
import { salesReturnsApi } from '../../sales-orders/api/sales-orders.api';

export const useSalesReturn = (id: string) => useQuery({
  queryKey: ['sales-returns', id],
  queryFn: () => salesReturnsApi.get(id),
  enabled: Boolean(id),
});
