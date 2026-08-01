import { useQuery } from '@tanstack/react-query';
import { suppliersApi } from '../api/suppliers.api';
import { supplierTransactionsApi } from '../api/supplier-transactions.api';
import { SupplierFilters } from '../types/supplier.types';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
export const supplierKeys={ all:['suppliers'] as const,list:(f:SupplierFilters)=>['suppliers','list',f] as const,detail:(id:string)=>['suppliers','detail',id] as const,summary:(id:string)=>['suppliers','summary',id] as const,transactions:(id:string,removed=false,page=1)=>['suppliers','transactions',id,removed,page] as const,audit:(id:string)=>['suppliers','audit',id] as const };
export const useSuppliers=(f:SupplierFilters={})=>{
  // The input stays responsive; the query fires once typing pauses.
  const search=useDebouncedValue(f.search??'');
  const filters={...f,search:search||undefined};
  return useQuery({queryKey:supplierKeys.list(filters),queryFn:()=>suppliersApi.list(filters)});
};
export const useSupplier=(id:string)=>useQuery({queryKey:supplierKeys.detail(id),queryFn:()=>suppliersApi.get(id),enabled:Boolean(id)});
export const useSupplierTransactions=(id:string,removed=false,page=1)=>useQuery({queryKey:supplierKeys.transactions(id,removed,page),queryFn:()=>supplierTransactionsApi.list(id,removed,page),enabled:Boolean(id)});
export const useSupplierAudit=(id:string,enabled=true)=>useQuery({queryKey:supplierKeys.audit(id),queryFn:()=>suppliersApi.audit(id),enabled:Boolean(id)&&enabled});
