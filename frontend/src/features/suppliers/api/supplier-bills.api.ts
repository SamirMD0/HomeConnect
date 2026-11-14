import { api, fetchAuthenticatedImage } from '../../../services/api';

/** One bill page. List endpoints return one entry per bill with its `pages`. */
export interface SupplierBill {
  id: string;
  supplierId: string;
  branchId: string;
  supplierReceivingId: string | null;
  /** A payment, or a purchase that received no stock. */
  supplierTransactionId?: string | null;
  billGroupId?: string | null;
  pageNumber?: number;
  capturedById?: string;
  note: string | null;
  mime: string;
  bytes: number;
  capturedAt: string;
  pages?: SupplierBill[];
  pageCount?: number;
}
export type BillFilter = 'false' | 'true' | 'all';

const branchHeader = (bill: SupplierBill) => ({ headers: { 'X-Branch-Scope': bill.branchId } });
export const supplierBillsApi = {
  list: async (supplierId: string, linked: BillFilter): Promise<SupplierBill[]> =>
    (await api.get(`/suppliers/${supplierId}/bills`, { params: { linked } })).data.data,
  forPurchase: async (id: string): Promise<SupplierBill[]> =>
    (await api.get(`/supplier-purchases/${id}/receipts`)).data.data,
  forTransaction: async (id: string): Promise<SupplierBill[]> =>
    (await api.get(`/supplier-bills/for-transaction/${id}`)).data.data,
  link: async (bill: SupplierBill, receivingId: string | null): Promise<void> => {
    await api.patch(`/supplier-bills/${bill.id}`, { supplierReceivingId: receivingId }, branchHeader(bill));
  },
  /** Link to a ledger entry; the server routes stock purchases to their receiving. */
  linkEntry: async (bill: SupplierBill, transactionId: string): Promise<void> => {
    await api.patch(`/supplier-bills/${bill.id}`, { supplierTransactionId: transactionId }, branchHeader(bill));
  },
  unlinkAll: async (bill: SupplierBill): Promise<void> => {
    await api.patch(
      `/supplier-bills/${bill.id}`,
      { supplierReceivingId: null, supplierTransactionId: null },
      branchHeader(bill)
    );
  },
  replace: async (page: SupplierBill, file: File): Promise<SupplierBill> =>
    (
      await api.post(`/supplier-bills/${page.id}/replace`, file, {
        headers: { 'Content-Type': file.type, 'X-Branch-Scope': page.branchId },
      })
    ).data.data,
  remove: async (page: SupplierBill, wholeBill: boolean): Promise<void> => {
    await api.delete(`/supplier-bills/${page.id}`, {
      params: { bill: String(wholeBill) },
      ...branchHeader(page),
    });
  },
  unlinkedCount: async (): Promise<number> =>
    (await api.get('/supplier-bills/unlinked-count')).data.data.count,
  image: (bill: SupplierBill) =>
    fetchAuthenticatedImage(`/supplier-bills/${bill.id}/image`, bill.branchId),
};
