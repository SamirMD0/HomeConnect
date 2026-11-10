import { SupplierTransactionDirection, SupplierTransactionStatus, SupplierTransactionType } from '../types/supplier.types';
export const supplierTransactionTypeLabels:Record<SupplierTransactionType,string>={SUPPLIER_DEBT:'Bill / فاتورة مورّد',SUPPLIER_PAYMENT:'Payment made / دفعة للمورّد',SUPPLIER_CREDIT:'Supplier Credit / رصيد من المورّد',SUPPLIER_ADJUSTMENT:'Adjustment / تعديل'};
export const supplierDirectionLabels:Record<SupplierTransactionDirection,string>={INCREASE_OWED:'Increases what we owe / يزيد المستحق',DECREASE_OWED:'Reduces what we owe / ينقص المستحق'};
export const supplierTransactionStatusLabels:Record<SupplierTransactionStatus,string>={ACTIVE:'Active / نشط',REMOVED:'Removed / محذوف'};
