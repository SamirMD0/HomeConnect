import { api } from '../../../services/api';
import type {
  CreateSupplierPurchaseInput, ReceiptCheckResult, SupplierPurchase, SupplierPurchaseListResult,
} from '../types/supplier-purchase.types';

export const supplierPurchasesApi = {
  list: async (supplierId: string, page = 1, pageSize = 25): Promise<SupplierPurchaseListResult> => {
    const response = await api.get(`/suppliers/${supplierId}/purchases`, { params: { page, pageSize } });
    return { items: response.data.data, pagination: response.data.meta.pagination };
  },
  get: async (id: string): Promise<SupplierPurchase> => (await api.get(`/supplier-purchases/${id}`)).data.data,
  create: async (supplierId: string, input: CreateSupplierPurchaseInput): Promise<SupplierPurchase> =>
    (await api.post(`/suppliers/${supplierId}/purchases`, input)).data.data,
  /** Advisory duplicate lookup. Never blocks saving. */
  receiptCheck: async (supplierId: string, receiptNumber: string): Promise<ReceiptCheckResult> =>
    (await api.get('/supplier-purchases/receipt-check', { params: { supplierId, receiptNumber } })).data.data,
};
