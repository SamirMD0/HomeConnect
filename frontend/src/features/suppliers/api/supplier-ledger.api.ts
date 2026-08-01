import { api } from '../../../services/api';
import { SupplierLedgerFilters, SupplierLedgerResult } from '../types/supplier.types';
const params=(v:object)=>Object.fromEntries(Object.entries(v).filter(([,x])=>x!==undefined&&x!==null&&x!==''));
export const supplierLedgerApi={ get:async(filters:SupplierLedgerFilters={}):Promise<SupplierLedgerResult> => (await api.get('/supplier-ledger',{params:params(filters)})).data.data };
