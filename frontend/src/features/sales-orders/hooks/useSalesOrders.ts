import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { salesOrdersApi } from '../api/sales-orders.api';
import type { CreateSalesOrderInput, SalesOrderFilters, UpdateSalesOrderInput } from '../types/sales-orders.types';

export const salesOrderKeys = {
  all: ['sales-orders'] as const,
  list: (filters: SalesOrderFilters) => [...salesOrderKeys.all, 'list', filters] as const,
  detail: (id: string) => [...salesOrderKeys.all, 'detail', id] as const,
  customer: (id: string, filters: SalesOrderFilters) => [...salesOrderKeys.all, 'customer', id, filters] as const,
  summary: (range: { dateFrom?: string; dateTo?: string } = {}) => [...salesOrderKeys.all, 'summary', range] as const,
};
export const useSalesOrders = (filters: SalesOrderFilters = {}) => useQuery({ queryKey: salesOrderKeys.list(filters), queryFn: () => salesOrdersApi.list(filters) });
export const useCustomerSalesOrders = (id: string, filters: SalesOrderFilters = {}) => useQuery({ queryKey: salesOrderKeys.customer(id, filters), queryFn: () => salesOrdersApi.listCustomer(id, filters), enabled: Boolean(id) });
export const useSalesOrder = (id: string) => useQuery({ queryKey: salesOrderKeys.detail(id), queryFn: () => salesOrdersApi.get(id), enabled: Boolean(id) });
export const useSalesOrderSummary = (range: { dateFrom?: string; dateTo?: string } = {}) => useQuery({ queryKey: salesOrderKeys.summary(range), queryFn: () => salesOrdersApi.summary(range), refetchInterval: 30_000 });
export const useSalesOrderAudit = (id: string, enabled: boolean) => useQuery({ queryKey: [...salesOrderKeys.detail(id), 'audit'], queryFn: () => salesOrdersApi.audit(id), enabled: Boolean(id) && enabled });
function useRefresh() { const client = useQueryClient(); return () => client.invalidateQueries({ queryKey: salesOrderKeys.all }); }
export function useCreateSalesOrder() { const refresh = useRefresh(); return useMutation({ mutationFn: (input: CreateSalesOrderInput) => salesOrdersApi.create(input), onSuccess: refresh }); }
export function useUpdateSalesOrder(id: string) { const refresh = useRefresh(); return useMutation({ mutationFn: (input: UpdateSalesOrderInput) => salesOrdersApi.update(id, input), onSuccess: refresh }); }
export function useSalesOrderAction<T>(action: (id: string, input: T) => Promise<unknown>, id: string) { const refresh = useRefresh(); return useMutation({ mutationFn: (input: T) => action(id, input), onSuccess: refresh }); }
