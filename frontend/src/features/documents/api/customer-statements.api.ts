import { api } from '../../../services/api';
import type { CustomerStatement } from '../types/document.types';

export const customerStatementsApi = {
  get: async (customerId: string, from: string, to: string): Promise<CustomerStatement> =>
    (await api.get(`/customers/${customerId}/statement`, { params: { from, to } })).data.data,
};
