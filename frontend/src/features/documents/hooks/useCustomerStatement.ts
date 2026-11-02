import { useQuery } from '@tanstack/react-query';
import { customerStatementsApi, supplierStatementsApi } from '../api/customer-statements.api';

export const customerStatementKey = (customerId: string, from: string, to: string) =>
  ['customer-statement', customerId, from, to] as const;

export function useSupplierStatement(supplierId: string, from: string, to: string) {
  return useQuery({
    queryKey: ['supplier-statement', supplierId, from, to] as const,
    queryFn: () => supplierStatementsApi.get(supplierId, from, to),
    enabled: Boolean(supplierId && from && to && from <= to),
  });
}

export function useCustomerStatement(customerId: string, from: string, to: string) {
  return useQuery({
    queryKey: customerStatementKey(customerId, from, to),
    queryFn: () => customerStatementsApi.get(customerId, from, to),
    enabled: Boolean(customerId && from && to && from <= to),
  });
}
