import { api } from '../../../services/api';
import { CreateSupplierInput, PaginationMeta, ProtectedActionInput, Supplier, SupplierAudit, SupplierFilters, UpdateSupplierInput } from '../types/supplier.types';

const params = (v: object) => Object.fromEntries(Object.entries(v).filter(([,x]) => x !== undefined && x !== null && x !== ''));
export const suppliersApi = {
  list: async (filters: SupplierFilters = {}): Promise<{items:Supplier[];pagination:PaginationMeta}> => { const r=await api.get('/suppliers',{params:params(filters)}); return {items:r.data.data,pagination:r.data.meta.pagination}; },
  get: async (id:string):Promise<Supplier> => (await api.get(`/suppliers/${id}`)).data.data,
  create: async (input:CreateSupplierInput):Promise<Supplier> => (await api.post('/suppliers',input)).data.data,
  update: async (id:string,input:UpdateSupplierInput):Promise<Supplier> => (await api.patch(`/suppliers/${id}`,input)).data.data,
  archive: async (id:string,input:ProtectedActionInput):Promise<Supplier> => (await api.post(`/suppliers/${id}/archive`,input)).data.data,
  restore: async (id:string,input:ProtectedActionInput):Promise<Supplier> => (await api.post(`/suppliers/${id}/restore`,input)).data.data,
  remove: async (id:string,input:ProtectedActionInput):Promise<{id:string;deleted:boolean}> => (await api.delete(`/suppliers/${id}`,{data:input})).data.data,
  summary: async (id:string) => (await api.get(`/suppliers/${id}/summary`)).data.data,
  audit: async (id:string,page=1,pageSize=25):Promise<{items:SupplierAudit[];pagination:PaginationMeta}> => { const r=await api.get(`/suppliers/${id}/audit`,{params:{page,pageSize}}); return {items:r.data.data,pagination:r.data.meta.pagination}; },
};
