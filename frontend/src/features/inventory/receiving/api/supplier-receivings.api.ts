import { api } from '../../../../services/api';
import type { CreateSupplierReceivingInput, DuplicateReceivingResult, ReceivingPagination, SupplierReceiving, SupplierReceivingFilters } from '../types/supplier-receiving.types';

const paramsFor = (values: object) => Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined && value !== null && value !== ''));

export const supplierReceivingsApi = {
  list: async (filters: SupplierReceivingFilters = {}): Promise<{ items: SupplierReceiving[]; pagination: ReceivingPagination }> => {
    const response = await api.get('/inventory/receivings', { params: paramsFor(filters) });
    return { items: response.data.data, pagination: response.data.meta.pagination };
  },
  get: async (id: string): Promise<SupplierReceiving> => (await api.get(`/inventory/receivings/${id}`)).data.data,
  create: async (input: CreateSupplierReceivingInput): Promise<SupplierReceiving> => (await api.post('/inventory/receivings', input)).data.data,
  duplicateCheck: async (supplierId: string, referenceNumber: string): Promise<DuplicateReceivingResult> =>
    (await api.get('/inventory/receivings/duplicate-check', { params: { supplierId, referenceNumber } })).data.data,
};
