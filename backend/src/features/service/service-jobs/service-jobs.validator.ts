import {
  ServiceJobStatus,
  ServiceRequestType,
  ServiceRoutingDecision,
  WarrantyStatus,
} from '@prisma/client';
import { z } from 'zod';
import { userTextSchema } from '../../../validators/user-text';
import { databaseUuidSchema } from '../../../validators/database-uuid';

const uuidSchema = databaseUuidSchema();
const dateSchema = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD format');
const moneySchema = z.string().trim().regex(/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/, 'Money must be a non-negative decimal string with up to 2 decimal places');
const optionalText = (field: string, max: number) => userTextSchema({ field, max }).optional().nullable();

const jobFields = {
  customerId: uuidSchema,
  productId: uuidSchema.optional().nullable(),
  manualProductName: optionalText('Manual product name', 200),
  manualProductModel: optionalText('Manual product model', 120),
  manualProductBrand: optionalText('Manual product brand', 120),
  manualProductNotes: optionalText('Manual product notes', 2000),
  requestType: z.nativeEnum(ServiceRequestType),
  issueDescription: userTextSchema({ field: 'Issue description', min: 3, max: 2000 }),
  requestedPartName: optionalText('Requested part', 200),
  routingDecision: z.nativeEnum(ServiceRoutingDecision).optional().nullable(),
  companyName: optionalText('Company name', 200),
  sentToCompanyDate: dateSchema.optional().nullable(),
  receivedFromCompanyDate: dateSchema.optional().nullable(),
  warrantyStatus: z.nativeEnum(WarrantyStatus).default(WarrantyStatus.UNKNOWN),
  warrantyNotes: optionalText('Warranty notes', 2000),
  warrantyProvider: optionalText('Warranty provider', 200),
  warrantyExpiresAt: dateSchema.optional().nullable(),
  estimatedPrice: moneySchema.optional().nullable(),
  finalPrice: moneySchema.optional().nullable(),
  priceNotes: optionalText('Price notes', 2000),
  serviceCreatedDate: dateSchema,
  homeVisitScheduledDate: dateSchema.optional().nullable(),
  returnedToCustomerDate: dateSchema.optional().nullable(),
  status: z.enum([ServiceJobStatus.RECEIVED, ServiceJobStatus.INSPECTION_PENDING]).default(ServiceJobStatus.RECEIVED),
  notes: optionalText('Notes', 2000),
};

function validateJobValues(values: Partial<ServiceJobValues>, context: z.RefinementCtx) {
  const hasProduct = Boolean(values.productId);
  const hasManualName = Boolean(values.manualProductName);
  if (hasProduct === hasManualName) {
    context.addIssue({ code: 'custom', path: ['productId'], message: 'Choose one existing product or enter a manual product name' });
  }
  if (hasProduct && [values.manualProductModel, values.manualProductBrand, values.manualProductNotes].some(Boolean)) {
    context.addIssue({ code: 'custom', path: ['productId'], message: 'Manual product fields cannot be used with an existing product' });
  }
  if (values.requestType === ServiceRequestType.PART_REPLACEMENT && !values.requestedPartName) {
    context.addIssue({ code: 'custom', path: ['requestedPartName'], message: 'Requested part is required for part replacement' });
  }
  if (values.routingDecision === ServiceRoutingDecision.COMPANY && !values.companyName) {
    context.addIssue({ code: 'custom', path: ['companyName'], message: 'Company name is required when routing to a company' });
  }
}

interface ServiceJobValues {
  customerId: string;
  productId?: string | null;
  manualProductName?: string | null;
  manualProductModel?: string | null;
  manualProductBrand?: string | null;
  manualProductNotes?: string | null;
  requestType: ServiceRequestType;
  issueDescription: string;
  requestedPartName?: string | null;
  routingDecision?: ServiceRoutingDecision | null;
  companyName?: string | null;
}

export const createServiceJobSchema = z.object(jobFields).superRefine(validateJobValues);

export const updateServiceJobSchema = z.object({
  customerId: jobFields.customerId.optional(),
  productId: jobFields.productId,
  manualProductName: jobFields.manualProductName,
  manualProductModel: jobFields.manualProductModel,
  manualProductBrand: jobFields.manualProductBrand,
  manualProductNotes: jobFields.manualProductNotes,
  requestType: jobFields.requestType.optional(),
  issueDescription: jobFields.issueDescription.optional(),
  requestedPartName: jobFields.requestedPartName,
  routingDecision: jobFields.routingDecision,
  companyName: jobFields.companyName,
  sentToCompanyDate: jobFields.sentToCompanyDate,
  receivedFromCompanyDate: jobFields.receivedFromCompanyDate,
  warrantyStatus: z.nativeEnum(WarrantyStatus).optional(),
  warrantyNotes: jobFields.warrantyNotes,
  warrantyProvider: jobFields.warrantyProvider,
  warrantyExpiresAt: jobFields.warrantyExpiresAt,
  estimatedPrice: jobFields.estimatedPrice,
  finalPrice: jobFields.finalPrice,
  priceNotes: jobFields.priceNotes,
  serviceCreatedDate: jobFields.serviceCreatedDate.optional(),
  homeVisitScheduledDate: jobFields.homeVisitScheduledDate,
  returnedToCustomerDate: jobFields.returnedToCustomerDate,
  notes: jobFields.notes,
  // Strict: normal service work is audited with a server-generated reason, so a
  // stale client still sending `reason` or `accountPassword` fails loudly rather
  // than having its text silently ignored.
}).strict();

export const changeServiceStatusSchema = z.object({
  status: z.nativeEnum(ServiceJobStatus),
  sentToCompanyDate: dateSchema.optional().nullable(),
  receivedFromCompanyDate: dateSchema.optional().nullable(),
  returnedToCustomerDate: dateSchema.optional().nullable(),
}).strict();

// Cancel and reopen stay strict. Their `reason` is not only audit text — cancel
// persists it to ServiceJob.cancelledReason — and they are terminal actions.
export const cancelServiceJobSchema = z.object({
  reason: userTextSchema({ field: 'Cancellation reason', min: 5, max: 1000 }),
  accountPassword: z.string().min(1, 'Account password is required'),
});

export const reopenServiceJobSchema = z.object({
  status: z.enum([
    ServiceJobStatus.RECEIVED, ServiceJobStatus.INSPECTION_PENDING,
    ServiceJobStatus.IN_WORKSHOP_REPAIR, ServiceJobStatus.SENT_TO_COMPANY,
    ServiceJobStatus.COMPANY_HOME_MAINTENANCE,
    ServiceJobStatus.WAITING_FOR_PART, ServiceJobStatus.WAITING_CUSTOMER_APPROVAL,
    ServiceJobStatus.READY_FOR_PICKUP,
  ]),
  reason: userTextSchema({ field: 'Reopen reason', min: 5, max: 1000 }),
  accountPassword: z.string().min(1, 'Account password is required'),
});

const csvEnums = <T extends Record<string, string>>(values: T) => z.string().optional().transform((value, context) => {
  if (!value) return undefined;
  const entries = value.split(',').filter(Boolean);
  const allowed = new Set(Object.values(values));
  if (entries.some((entry) => !allowed.has(entry))) {
    context.addIssue({ code: 'custom', message: 'Invalid filter value' });
    return z.NEVER;
  }
  return entries as T[keyof T][];
});

export const serviceJobListQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  status: z.string().optional().transform((value, context) => {
    if (!value) return undefined;
    const entries = value.split(',').filter(Boolean);
    const allowed = new Set([...Object.values(ServiceJobStatus), 'OPEN', 'CLOSED']);
    if (entries.some((entry) => !allowed.has(entry))) {
      context.addIssue({ code: 'custom', message: 'Invalid status filter' }); return z.NEVER;
    }
    return entries;
  }),
  includeDelivered: z.enum(['true', 'false']).optional().transform((value) => value === 'true'),
  requestType: csvEnums(ServiceRequestType),
  routingDecision: csvEnums(ServiceRoutingDecision),
  warrantyStatus: csvEnums(WarrantyStatus),
  customerId: uuidSchema.optional(),
  productId: uuidSchema.optional(),
  dateFrom: dateSchema.optional(),
  dateTo: dateSchema.optional(),
  sort: z.enum(['createdDesc', 'createdAsc', 'statusAsc', 'customerAsc']).default('createdDesc'),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
});

export const serviceJobParamsSchema = z.object({ serviceJobId: uuidSchema });
export const customerServiceJobsParamsSchema = z.object({ customerId: uuidSchema });
export const serviceAuditQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(50),
});

export type CreateServiceJobInput = z.infer<typeof createServiceJobSchema>;
export type UpdateServiceJobInput = z.infer<typeof updateServiceJobSchema>;
export type ChangeServiceStatusInput = z.infer<typeof changeServiceStatusSchema>;
export type CancelServiceJobInput = z.infer<typeof cancelServiceJobSchema>;
export type ReopenServiceJobInput = z.infer<typeof reopenServiceJobSchema>;
export type ServiceJobListQueryInput = z.infer<typeof serviceJobListQuerySchema>;
export type ServiceJobParamsInput = z.infer<typeof serviceJobParamsSchema>;
export type CustomerServiceJobsParamsInput = z.infer<typeof customerServiceJobsParamsSchema>;
export type ServiceAuditQueryInput = z.infer<typeof serviceAuditQuerySchema>;
