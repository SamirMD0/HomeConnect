import { api } from '../../../services/api';
import type { CustomerStatement, SupplierStatement } from '../types/document.types';

export const supplierStatementsApi = {
  get: async (supplierId: string, from: string, to: string): Promise<SupplierStatement> =>
    (await api.get(`/suppliers/${supplierId}/statement`, { params: { from, to } })).data.data,
};

export const customerStatementsApi = {
  get: async (customerId: string, from: string, to: string): Promise<CustomerStatement> =>
    (await api.get(`/customers/${customerId}/statement`, { params: { from, to } })).data.data,
};
