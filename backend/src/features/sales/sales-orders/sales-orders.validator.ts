import {
  InstallmentPlanFrequency,
  SalesChannel,
  SalesOrderFulfillmentStatus,
  SalesOrderPaymentStatus,
  SalesOrderSettlement,
} from '@prisma/client';
import { z } from 'zod';
import { userTextSchema } from '../../../validators/user-text';

const uuidSchema = z.string().uuid('Invalid ID');
const dateSchema = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD format');
const moneySchema = z.string().trim().regex(/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/, 'Money must be a non-negative decimal string with up to 2 decimal places');
const positiveMoneySchema = moneySchema.refine((value) => !/^0(?:\.0{1,2})?$/.test(value), 'Amount must be greater than zero');
const optionalText = (field: string, max: number) => userTextSchema({ field, max }).optional().nullable();
const reasonSchema = userTextSchema({ field: 'Reason', min: 5, max: 1000 });

const itemSchema = z.object({
  productId: uuidSchema.optional().nullable(),
  manualProductName: userTextSchema({ field: 'Manual product name', min: 2, max: 200 }).optional().nullable(),
  manualProductModel: optionalText('Manual product model', 120),
  quantity: z.coerce.number().int().min(1).max(999),
  unitPrice: positiveMoneySchema,
  discountAmount: moneySchema.optional().nullable(),
  notes: optionalText('Item notes', 1000),
}).superRefine(validateItemIdentity);

function validateItemIdentity(value: { productId?: string | null; manualProductName?: string | null }, context: z.RefinementCtx) {
  if (Boolean(value.productId) === Boolean(value.manualProductName)) {
    context.addIssue({ code: 'custom', path: ['productId'], message: 'Choose one existing product or enter a manual product name' });
  }
}

const createOrderObject = z.object({
  customerId: uuidSchema.optional().nullable(),
  salesChannel: z.nativeEnum(SalesChannel),
  orderDate: dateSchema,
  deliveryDate: dateSchema.optional().nullable(),
  fulfillmentStatus: z.enum([
    SalesOrderFulfillmentStatus.DRAFT,
    SalesOrderFulfillmentStatus.CONFIRMED,
    SalesOrderFulfillmentStatus.DELIVERED,
  ]).default(SalesOrderFulfillmentStatus.CONFIRMED),
  deliveryFee: moneySchema.optional().nullable(),
  paidAmount: moneySchema.default('0.00'),
  debtDueDate: dateSchema.optional().nullable(),
  deliveryAddressSnapshot: optionalText('Delivery address', 1000),
  deliveryNotes: optionalText('Delivery notes', 1000),
  notes: optionalText('Notes', 1000),
  items: z.array(itemSchema).min(1).max(50),
});

export const createSalesOrderSchema = createOrderObject.superRefine((value, context) => {
  if (value.salesChannel === SalesChannel.SHOP_DIRECT && (value.deliveryDate || value.deliveryFee)) {
    context.addIssue({ code: 'custom', path: ['deliveryDate'], message: 'Shop-direct orders cannot contain delivery date or fee' });
  }
  if (value.fulfillmentStatus === SalesOrderFulfillmentStatus.DELIVERED && value.salesChannel !== SalesChannel.SHOP_DIRECT) {
    context.addIssue({ code: 'custom', path: ['fulfillmentStatus'], message: 'Only shop-direct orders may be created as delivered' });
  }
});

export const updateSalesOrderSchema = z.object({
  customerId: uuidSchema.optional().nullable(),
  salesChannel: z.nativeEnum(SalesChannel).optional(),
  orderDate: dateSchema.optional(),
  deliveryDate: dateSchema.optional().nullable(),
  deliveryFee: moneySchema.optional().nullable(),
  debtDueDate: dateSchema.optional().nullable(),
  deliveryAddressSnapshot: optionalText('Delivery address', 1000),
  deliveryNotes: optionalText('Delivery notes', 1000),
  notes: optionalText('Notes', 1000),
  reason: reasonSchema.optional(),
  accountPassword: z.string().min(1).optional(),
});

export const addSalesOrderItemSchema = itemSchema.and(z.object({
  debtDueDate: dateSchema.optional().nullable(),
  reason: reasonSchema.optional(),
  accountPassword: z.string().min(1).optional(),
}));

export const updateSalesOrderItemSchema = z.object({
  productId: uuidSchema.optional().nullable(),
  manualProductName: userTextSchema({ field: 'Manual product name', min: 2, max: 200 }).optional().nullable(),
  manualProductModel: optionalText('Manual product model', 120),
  quantity: z.coerce.number().int().min(1).max(999).optional(),
  unitPrice: positiveMoneySchema.optional(),
  discountAmount: moneySchema.optional().nullable(),
  debtDueDate: dateSchema.optional().nullable(),
  notes: optionalText('Item notes', 1000),
  reason: reasonSchema.optional(),
  accountPassword: z.string().min(1).optional(),
});

export const salesOrderActionSchema = z.object({
  reason: reasonSchema,
  accountPassword: z.string().min(1, 'Account password is required'),
});

export const salesOrderItemActionSchema = z.object({
  debtDueDate: dateSchema.optional().nullable(),
  reason: reasonSchema.optional(),
  accountPassword: z.string().min(1).optional(),
});

export const changeSalesOrderStatusSchema = z.object({
  status: z.nativeEnum(SalesOrderFulfillmentStatus),
  reason: reasonSchema.optional(),
  accountPassword: z.string().min(1).optional(),
});

export const restoreSalesOrderSchema = salesOrderActionSchema.extend({
  status: z.enum([
    SalesOrderFulfillmentStatus.DRAFT,
    SalesOrderFulfillmentStatus.CONFIRMED,
    SalesOrderFulfillmentStatus.PREPARING,
    SalesOrderFulfillmentStatus.READY_FOR_DELIVERY,
    SalesOrderFulfillmentStatus.OUT_FOR_DELIVERY,
  ]),
});

export const changeSalesOrderPaymentSchema = z.object({
  paidAmount: moneySchema,
  debtDueDate: dateSchema.optional().nullable(),
  reason: reasonSchema,
  accountPassword: z.string().min(1, 'Account password is required'),
});

export const createSalesOrderDebtSchema = z.object({
  dueDate: dateSchema,
  description: userTextSchema({ field: 'Description', min: 1, max: 200 }).optional(),
  notes: optionalText('Notes', 1000),
});

export const createSalesOrderInstallmentPlanSchema = z.object({
  startDate: dateSchema,
  installmentCount: z.coerce.number().int().min(2).max(60),
  frequency: z.nativeEnum(InstallmentPlanFrequency).default(InstallmentPlanFrequency.MONTHLY),
  description: userTextSchema({ field: 'Description', min: 1, max: 200 }).optional(),
  notes: optionalText('Notes', 1000),
});

const csvEnum = <T extends Record<string, string>>(values: T) => z.string().optional().transform((value, context) => {
  if (!value) return undefined;
  const entries = value.split(',').filter(Boolean);
  const allowed = new Set(Object.values(values));
  if (entries.some((entry) => !allowed.has(entry))) {
    context.addIssue({ code: 'custom', message: 'Invalid filter value' });
    return z.NEVER;
  }
  return entries as T[keyof T][];
});

export const salesOrderListQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  customerId: uuidSchema.optional(),
  salesChannel: csvEnum(SalesChannel),
  fulfillmentStatus: csvEnum(SalesOrderFulfillmentStatus),
  paymentStatus: csvEnum(SalesOrderPaymentStatus),
  settlement: csvEnum(SalesOrderSettlement),
  dateFrom: dateSchema.optional(),
  dateTo: dateSchema.optional(),
  sort: z.enum(['createdDesc', 'createdAsc', 'customerAsc', 'totalDesc']).default('createdDesc'),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
});

/** Scopes the period cards to the date range the page is showing. Defaults to today. */
export const salesOrderSummaryQuerySchema = z.object({
  dateFrom: dateSchema.optional(),
  dateTo: dateSchema.optional(),
});

export const salesOrderParamsSchema = z.object({ salesOrderId: uuidSchema });
export const salesOrderItemParamsSchema = salesOrderParamsSchema.extend({ itemId: uuidSchema });
export const customerSalesOrdersParamsSchema = z.object({ customerId: uuidSchema });
export const salesAuditQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(50),
});

export type CreateSalesOrderInput = z.infer<typeof createSalesOrderSchema>;
export type UpdateSalesOrderInput = z.infer<typeof updateSalesOrderSchema>;
export type AddSalesOrderItemInput = z.infer<typeof addSalesOrderItemSchema>;
export type UpdateSalesOrderItemInput = z.infer<typeof updateSalesOrderItemSchema>;
export type SalesOrderActionInput = z.infer<typeof salesOrderActionSchema>;
export type SalesOrderItemActionInput = z.infer<typeof salesOrderItemActionSchema>;
export type ChangeSalesOrderStatusInput = z.infer<typeof changeSalesOrderStatusSchema>;
export type RestoreSalesOrderInput = z.infer<typeof restoreSalesOrderSchema>;
export type ChangeSalesOrderPaymentInput = z.infer<typeof changeSalesOrderPaymentSchema>;
export type CreateSalesOrderDebtInput = z.infer<typeof createSalesOrderDebtSchema>;
export type CreateSalesOrderInstallmentPlanInput = z.infer<typeof createSalesOrderInstallmentPlanSchema>;
export type SalesOrderListQueryInput = z.infer<typeof salesOrderListQuerySchema>;
export type SalesOrderSummaryQueryInput = z.infer<typeof salesOrderSummaryQuerySchema>;
export type SalesOrderParamsInput = z.infer<typeof salesOrderParamsSchema>;
export type SalesOrderItemParamsInput = z.infer<typeof salesOrderItemParamsSchema>;
export type CustomerSalesOrdersParamsInput = z.infer<typeof customerSalesOrdersParamsSchema>;
export type SalesAuditQueryInput = z.infer<typeof salesAuditQuerySchema>;
