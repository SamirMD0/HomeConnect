import { api, fetchAuthenticatedImage } from '../../../services/api';

export interface SupplierBill {
  id: string;
  supplierId: string;
  branchId: string;
  supplierReceivingId: string | null;
  note: string | null;
  mime: string;
  bytes: number;
  capturedAt: string;
}
export type BillFilter = 'false' | 'true' | 'all';
export const supplierBillsApi = {
  list: async (supplierId: string, linked: BillFilter): Promise<SupplierBill[]> =>
    (await api.get(`/suppliers/${supplierId}/bills`, { params: { linked } })).data.data,
  forPurchase: async (id: string): Promise<SupplierBill[]> =>
    (await api.get(`/supplier-purchases/${id}/receipts`)).data.data,
  link: async (bill: SupplierBill, receivingId: string | null): Promise<void> => {
    await api.patch(
      `/supplier-bills/${bill.id}`,
      { supplierReceivingId: receivingId },
      { headers: { 'X-Branch-Scope': bill.branchId } }
    );
  },
  unlinkedCount: async (): Promise<number> =>
    (await api.get('/supplier-bills/unlinked-count')).data.data.count,
  image: (bill: SupplierBill) =>
    fetchAuthenticatedImage(`/supplier-bills/${bill.id}/image`, bill.branchId),
};
