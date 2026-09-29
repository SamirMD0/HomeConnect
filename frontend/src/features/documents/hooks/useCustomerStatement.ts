import { useQuery } from '@tanstack/react-query';
import { customerStatementsApi } from '../api/customer-statements.api';

export const customerStatementKey = (customerId: string, from: string, to: string) =>
  ['customer-statement', customerId, from, to] as const;

export function useCustomerStatement(customerId: string, from: string, to: string) {
  return useQuery({
    queryKey: customerStatementKey(customerId, from, to),
    queryFn: () => customerStatementsApi.get(customerId, from, to),
    enabled: Boolean(customerId && from && to && from <= to),
  });
}
