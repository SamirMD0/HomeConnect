import { api } from '../../../services/api';
import type {
  CreateSalesOrderInput, SalesAudit, SalesOrder, SalesOrderFilters, SalesOrderPagination, SalesOrderSummary,
  UpdateSalesOrderInput,
} from '../types/sales-orders.types';

export function salesOrderParams(filters: SalesOrderFilters = {}) {
  return Object.fromEntries(Object.entries(filters).flatMap(([key, value]) => {
    if (value === undefined || value === '') return [];
    return [[key, Array.isArray(value) ? value.join(',') : value]];
  }));
}

export const salesOrdersApi = {
  list: async (filters: SalesOrderFilters = {}): Promise<{ items: SalesOrder[]; pagination: SalesOrderPagination }> => {
    const response = await api.get('/sales-orders', { params: salesOrderParams(filters) });
    return { items: response.data.data, pagination: response.data.meta.pagination };
  },
  listCustomer: async (customerId: string, filters: SalesOrderFilters = {}): Promise<{ items: SalesOrder[]; pagination: SalesOrderPagination }> => {
    const response = await api.get(`/customers/${customerId}/sales-orders`, { params: salesOrderParams(filters) });
    return { items: response.data.data, pagination: response.data.meta.pagination };
  },
  get: async (id: string): Promise<SalesOrder> => (await api.get(`/sales-orders/${id}`)).data.data,
  summary: async (range: { dateFrom?: string; dateTo?: string } = {}): Promise<SalesOrderSummary> =>
    (await api.get('/sales-orders/summary', { params: range })).data.data,
  create: async (input: CreateSalesOrderInput): Promise<SalesOrder> => (await api.post('/sales-orders', input)).data.data,
  update: async (id: string, input: UpdateSalesOrderInput): Promise<SalesOrder> => (await api.patch(`/sales-orders/${id}`, input)).data.data,
  addItem: async (id: string, input: object): Promise<SalesOrder> => (await api.post(`/sales-orders/${id}/items`, input)).data.data,
  updateItem: async (id: string, itemId: string, input: object): Promise<SalesOrder> => (await api.patch(`/sales-orders/${id}/items/${itemId}`, input)).data.data,
  removeItem: async (id: string, itemId: string, input: object): Promise<SalesOrder> => (await api.post(`/sales-orders/${id}/items/${itemId}/remove`, input)).data.data,
  status: async (id: string, input: { status: string; reason?: string; accountPassword?: string }): Promise<SalesOrder> => (await api.post(`/sales-orders/${id}/fulfillment-status`, input)).data.data,
  payment: async (id: string, input: { paidAmount: string; debtDueDate?: string | null; reason: string; accountPassword: string }): Promise<SalesOrder> => (await api.post(`/sales-orders/${id}/payment`, input)).data.data,
  cancel: async (id: string, input: { reason: string; accountPassword: string }): Promise<SalesOrder> => (await api.post(`/sales-orders/${id}/cancel`, input)).data.data,
  restore: async (id: string, input: { status: string; reason: string; accountPassword: string }): Promise<SalesOrder> => (await api.post(`/sales-orders/${id}/restore`, input)).data.data,
  returnOrder: async (id: string, input: { reason: string; accountPassword: string }): Promise<SalesOrder> => (await api.post(`/sales-orders/${id}/return`, input)).data.data,
  createDebt: async (id: string, input: { dueDate: string; description?: string; notes?: string | null }): Promise<SalesOrder> => (await api.post(`/sales-orders/${id}/create-debt`, input)).data.data,
  createInstallmentPlan: async (id: string, input: { startDate: string; installmentCount: number; frequency?: 'MONTHLY' | 'WEEKLY'; description?: string; notes?: string | null }): Promise<SalesOrder> => (await api.post(`/sales-orders/${id}/create-installment-plan`, input)).data.data,
  unlinkFinancial: async (id: string, input: { reason: string; accountPassword: string }): Promise<SalesOrder> => (await api.post(`/sales-orders/${id}/unlink-financial`, input)).data.data,
  audit: async (id: string): Promise<SalesAudit[]> => (await api.get(`/sales-orders/${id}/audit`)).data.data,
};
