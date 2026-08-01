export type SupplierTransactionType = 'SUPPLIER_DEBT'|'SUPPLIER_PAYMENT'|'SUPPLIER_CREDIT'|'SUPPLIER_ADJUSTMENT';
export type SupplierTransactionDirection = 'INCREASE_OWED'|'DECREASE_OWED';
export type SupplierTransactionStatus = 'ACTIVE'|'REMOVED';

export interface SupplierActor { id: string; fullName: string; username: string }
export interface SupplierSummary { totalOwed: string; totalPaid: string; totalCredit: string; balance: string; transactionCount: number; basis: 'lifetime'|'filtered'; supplierCount?: number }
export interface Supplier {
  id: string; name: string; phone: string; companyName: string|null; secondaryPhone: string|null;
  email: string|null; notes: string|null; isActive: boolean; archivedAt: string|null; archivedReason: string|null;
  createdAt: string; updatedAt: string; balance: string; summary?: SupplierSummary;
  createdBy?: SupplierActor; updatedBy?: SupplierActor|null;
}
export interface SupplierTransaction {
  id: string; supplierId: string; supplier: Pick<Supplier,'id'|'name'|'phone'|'companyName'|'isActive'>;
  type: SupplierTransactionType; direction: SupplierTransactionDirection; amount: string; transactionDate: string;
  description: string; reference: string|null; notes: string|null; status: SupplierTransactionStatus;
  removedAt: string|null; removedReason: string|null; createdAt: string; updatedAt: string;
  createdBy: SupplierActor; updatedBy?: SupplierActor|null; removedBy?: SupplierActor|null;
}
export interface PaginationMeta { page: number; pageSize: number; totalItems: number; totalPages: number }
export interface SupplierFilters { search?: string; isActive?: boolean; sortBy?: 'name'|'createdAt'|'balance'; sortOrder?: 'asc'|'desc'; page?: number; pageSize?: number }
export interface SupplierLedgerFilters { supplierId?: string; type?: SupplierTransactionType; direction?: SupplierTransactionDirection; dateFrom?: string; dateTo?: string; search?: string; includeRemoved?: boolean; page?: number; pageSize?: number; sortBy?: 'transactionDate'|'amount'|'supplier'; sortOrder?: 'asc'|'desc' }
export interface CreateSupplierInput { name: string; phone: string; companyName?: string|null; secondaryPhone?: string|null; email?: string|null; notes?: string|null }
export type UpdateSupplierInput = Partial<CreateSupplierInput> & { reason?: string; accountPassword?: string };
export interface ProtectedActionInput { reason: string; accountPassword: string }
export interface CreateSupplierTransactionInput { type: SupplierTransactionType; direction?: SupplierTransactionDirection; amount: string; transactionDate: string; description: string; reference?: string|null; notes?: string|null }
export type UpdateSupplierTransactionInput = Partial<CreateSupplierTransactionInput> & ProtectedActionInput;
export interface SupplierLedgerResult { summary: SupplierSummary; items: SupplierTransaction[]; pagination: { page:number; pageSize:number; total:number; totalPages:number } }
export interface SupplierAudit { id:string; action:string; changedByName:string; changedByUsername:string; changedAt:string; reason:string; beforeValues:Record<string,unknown>; afterValues:Record<string,unknown>; affectedTotals?:Record<string,unknown>|null }
