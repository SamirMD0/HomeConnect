export type ServiceRequestType = 'ON_CALL' | 'WORKSHOP_DROP_OFF' | 'PART_REPLACEMENT';
export type ServiceJobStatus =
  | 'RECEIVED' | 'INSPECTION_PENDING' | 'IN_WORKSHOP_REPAIR' | 'SENT_TO_COMPANY' | 'COMPANY_HOME_MAINTENANCE'
  | 'WAITING_FOR_PART' | 'WAITING_CUSTOMER_APPROVAL' | 'READY_FOR_PICKUP'
  | 'DELIVERED_TO_CUSTOMER' | 'PRODUCT_EXCHANGE' | 'CANCELLED' | 'NOT_REPAIRABLE';
export type ServiceRoutingDecision = 'WORKSHOP' | 'COMPANY' | 'CUSTOMER_DECISION' | 'NOT_REPAIRABLE';
export type WarrantyStatus = 'UNDER_WARRANTY' | 'NO_WARRANTY' | 'UNKNOWN';

export interface ServiceCustomer { id: string; name: string; phone: string; isActive: boolean }
export interface ServiceProduct { id: string; name: string; model: string; brand: string | null; barcode: string | null; isActive: boolean }
export interface ServiceActor { id: string; fullName: string; username: string }

export interface ServiceJob {
  id: string;
  jobNumber: string;
  customerId: string;
  customer: ServiceCustomer;
  productId: string | null;
  product: ServiceProduct | null;
  manualProductName: string | null;
  manualProductModel: string | null;
  manualProductBrand: string | null;
  manualProductNotes: string | null;
  requestType: ServiceRequestType;
  issueDescription: string;
  requestedPartName: string | null;
  routingDecision: ServiceRoutingDecision | null;
  companyName: string | null;
  sentToCompanyDate: string | null;
  receivedFromCompanyDate: string | null;
  warrantyStatus: WarrantyStatus;
  warrantyNotes: string | null;
  warrantyProvider: string | null;
  warrantyExpiresAt: string | null;
  estimatedPrice: string | null;
  finalPrice: string | null;
  priceNotes: string | null;
  serviceCreatedDate: string;
  homeVisitScheduledDate: string | null;
  returnedToCustomerDate: string | null;
  status: ServiceJobStatus;
  notes: string | null;
  createdBy: ServiceActor;
  updatedBy: ServiceActor | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelledReason: string | null;
}

export interface ServiceAudit {
  id: string;
  action: string;
  changedByName: string;
  changedByUsername: string;
  changedAt: string;
  reason: string;
  beforeValues: Record<string, unknown>;
  afterValues: Record<string, unknown>;
}

export interface ServiceSummary {
  open: number; atSupplier: number; waitingForPart: number; awaitingCustomer: number;
  readyForPickup: number; overdue: number; deliveredThisMonth: number;
}

export interface PaginationMeta { page: number; pageSize: number; totalItems: number; totalPages: number }
export interface ServiceJobFilters {
  search?: string; status?: string[]; includeDelivered?: boolean; requestType?: ServiceRequestType[];
  routingDecision?: ServiceRoutingDecision[]; warrantyStatus?: WarrantyStatus[];
  customerId?: string; productId?: string; dateFrom?: string; dateTo?: string;
  sort?: 'createdDesc' | 'createdAsc' | 'statusAsc' | 'customerAsc'; page?: number; pageSize?: number;
}

export interface CreateServiceJobInput {
  customerId: string; productId?: string | null; manualProductName?: string | null;
  manualProductModel?: string | null; manualProductBrand?: string | null;
  manualProductNotes?: string | null; requestType: ServiceRequestType;
  issueDescription: string; requestedPartName?: string | null;
  routingDecision?: ServiceRoutingDecision | null; companyName?: string | null;
  warrantyStatus?: WarrantyStatus; estimatedPrice?: string | null;
  serviceCreatedDate: string; homeVisitScheduledDate?: string | null; notes?: string | null;
}

export type UpdateServiceJobInput = Partial<Omit<CreateServiceJobInput, 'serviceCreatedDate'>> & {
  serviceCreatedDate?: string; finalPrice?: string | null; priceNotes?: string | null;
  warrantyNotes?: string | null; warrantyProvider?: string | null; warrantyExpiresAt?: string | null;
  sentToCompanyDate?: string | null; receivedFromCompanyDate?: string | null;
  returnedToCustomerDate?: string | null;
};

export function resolveProductDisplay(job: ServiceJob) {
  return job.product
    ? { name: job.product.name, model: job.product.model, brand: job.product.brand, isLinked: true }
    : { name: job.manualProductName ?? 'Unknown product', model: job.manualProductModel, brand: job.manualProductBrand, isLinked: false };
}
