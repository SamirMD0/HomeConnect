import { useQuery } from '@tanstack/react-query';
import { supplierLedgerApi } from '../api/supplier-ledger.api';
import { SupplierLedgerFilters } from '../types/supplier.types';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
export const supplierLedgerKeyPrefix=['supplier-ledger'] as const;
export const supplierLedgerQueryKey=(f:SupplierLedgerFilters={})=>['supplier-ledger',f] as const;
export const useSupplierLedger=(f:SupplierLedgerFilters={})=>{
  const search=useDebouncedValue(f.search??'');
  const filters={...f,search:search||undefined};
  return useQuery({queryKey:supplierLedgerQueryKey(filters),queryFn:()=>supplierLedgerApi.get(filters)});
};
