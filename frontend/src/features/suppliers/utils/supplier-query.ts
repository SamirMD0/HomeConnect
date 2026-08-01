import { SupplierLedgerFilters } from '../types/supplier.types';
export const defaultSupplierLedgerFilters:SupplierLedgerFilters={page:1,pageSize:25,sortBy:'transactionDate',sortOrder:'desc',includeRemoved:false};
export const hasActiveSupplierLedgerFilters=(f:SupplierLedgerFilters)=>Boolean(f.supplierId||f.type||f.direction||f.dateFrom||f.dateTo||f.search||f.includeRemoved);
export const resetSupplierLedgerFilters=():SupplierLedgerFilters=>({...defaultSupplierLedgerFilters});
export function applySupplierLedgerMonthFilter(f:SupplierLedgerFilters,month:string):SupplierLedgerFilters {if(!month)return{...f,dateFrom:undefined,dateTo:undefined,page:1};const [y,m]=month.split('-').map(Number);const end=new Date(Date.UTC(y,m,0)).getUTCDate();return{...f,dateFrom:`${month}-01`,dateTo:`${month}-${String(end).padStart(2,'0')}`,page:1};}
