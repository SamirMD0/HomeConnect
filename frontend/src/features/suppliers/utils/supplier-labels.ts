import { SupplierTransactionDirection, SupplierTransactionStatus, SupplierTransactionType } from '../types/supplier.types';
export const supplierTransactionTypeLabels:Record<SupplierTransactionType,string>={SUPPLIER_DEBT:'Supplier Debt / دين للمورّد',SUPPLIER_PAYMENT:'Payment to Supplier / دفعة للمورّد',SUPPLIER_CREDIT:'Supplier Credit / رصيد من المورّد',SUPPLIER_ADJUSTMENT:'Adjustment / تعديل'};
export const supplierDirectionLabels:Record<SupplierTransactionDirection,string>={INCREASE_OWED:'Increases Owed / يزيد المستحق',DECREASE_OWED:'Decreases Owed / ينقص المستحق'};
export const supplierTransactionStatusLabels:Record<SupplierTransactionStatus,string>={ACTIVE:'Active / نشط',REMOVED:'Removed / محذوف'};
