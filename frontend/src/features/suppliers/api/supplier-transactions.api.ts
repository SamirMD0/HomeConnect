import { api } from '../../../services/api';
import { CreateSupplierTransactionInput, PaginationMeta, ProtectedActionInput, SupplierLedgerFilters, SupplierTransaction, UpdateSupplierTransactionInput } from '../types/supplier.types';
const params=(value:object)=>Object.fromEntries(Object.entries(value).filter(([,item])=>item!==undefined&&item!==null&&item!==''));
export const supplierTransactionsApi = {
  listGlobal: async (filters:SupplierLedgerFilters={}):Promise<{items:SupplierTransaction[];pagination:PaginationMeta}> => { const r=await api.get('/supplier-transactions',{params:params(filters)}); return {items:r.data.data,pagination:r.data.meta.pagination}; },
  list: async (supplierId:string,includeRemoved=false,page=1,pageSize=25):Promise<{items:SupplierTransaction[];pagination:PaginationMeta}> => { const r=await api.get(`/suppliers/${supplierId}/transactions`,{params:{includeRemoved,page,pageSize}}); return {items:r.data.data,pagination:r.data.meta.pagination}; },
  get: async (id:string):Promise<SupplierTransaction> => (await api.get(`/supplier-transactions/${id}`)).data.data,
  create: async (supplierId:string,input:CreateSupplierTransactionInput):Promise<SupplierTransaction> => (await api.post(`/suppliers/${supplierId}/transactions`,input)).data.data,
  update: async (id:string,input:UpdateSupplierTransactionInput):Promise<SupplierTransaction> => (await api.patch(`/supplier-transactions/${id}`,input)).data.data,
  remove: async (id:string,input:ProtectedActionInput):Promise<SupplierTransaction> => (await api.post(`/supplier-transactions/${id}/remove`,input)).data.data,
  restore: async (id:string,input:ProtectedActionInput):Promise<SupplierTransaction> => (await api.post(`/supplier-transactions/${id}/restore`,input)).data.data,
};
