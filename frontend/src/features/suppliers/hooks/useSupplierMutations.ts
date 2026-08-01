import { useMutation,useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { suppliersApi } from '../api/suppliers.api';
import { supplierTransactionsApi } from '../api/supplier-transactions.api';
import { CreateSupplierInput,CreateSupplierTransactionInput,ProtectedActionInput,UpdateSupplierInput,UpdateSupplierTransactionInput } from '../types/supplier.types';
import { supplierKeys } from './useSuppliers';
import { supplierLedgerKeyPrefix } from './useSupplierLedger';
const useInvalidate=()=>{const q=useQueryClient();return()=>{void q.invalidateQueries({queryKey:supplierKeys.all});void q.invalidateQueries({queryKey:supplierLedgerKeyPrefix});};};
export function useSupplierMutations(){const done=useInvalidate();return{
 create:useMutation({mutationFn:(i:CreateSupplierInput)=>suppliersApi.create(i),onSuccess:()=>{done();toast.success('Supplier saved / تم حفظ المورّد');}}),
 update:useMutation({mutationFn:({id,input}:{id:string;input:UpdateSupplierInput})=>suppliersApi.update(id,input),onSuccess:done}),
 archive:useMutation({mutationFn:({id,input}:{id:string;input:ProtectedActionInput})=>suppliersApi.archive(id,input),onSuccess:done}),
 restore:useMutation({mutationFn:({id,input}:{id:string;input:ProtectedActionInput})=>suppliersApi.restore(id,input),onSuccess:done}),
 remove:useMutation({mutationFn:({id,input}:{id:string;input:ProtectedActionInput})=>suppliersApi.remove(id,input),onSuccess:done}),
};}
export function useSupplierTransactionMutations(){const done=useInvalidate();return{
 create:useMutation({mutationFn:({supplierId,input}:{supplierId:string;input:CreateSupplierTransactionInput})=>supplierTransactionsApi.create(supplierId,input),onSuccess:()=>{done();toast.success('Transaction saved / تم حفظ الحركة');}}),
 update:useMutation({mutationFn:({id,input}:{id:string;input:UpdateSupplierTransactionInput})=>supplierTransactionsApi.update(id,input),onSuccess:done}),
 remove:useMutation({mutationFn:({id,input}:{id:string;input:ProtectedActionInput})=>supplierTransactionsApi.remove(id,input),onSuccess:done}),
 restore:useMutation({mutationFn:({id,input}:{id:string;input:ProtectedActionInput})=>supplierTransactionsApi.restore(id,input),onSuccess:done}),
};}
