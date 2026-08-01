import { z } from 'zod';
import { userTextSchema } from '../../../validators/user-text';
import { containsSensitiveSupplierFields } from '../authorization/supplier-policy';

const emptyToNull = (value: unknown) => typeof value === 'string' && value.trim() === '' ? null : value;
const optionalText = (field: string, max: number) => z.preprocess(emptyToNull, userTextSchema({ field, max }).optional().nullable());
const phone = z.string().trim().min(6).max(20).regex(/^[+]?[0-9\s\-()]{6,20}$/, 'Invalid phone number');
const optionalPhone = z.preprocess(emptyToNull, phone.optional().nullable());
const supplierFields = {
  name: userTextSchema({ field: 'Supplier name', min: 2, max: 120 }),
  phone,
  companyName: optionalText('Company name', 160),
  secondaryPhone: optionalPhone,
  email: z.preprocess(emptyToNull, z.string().trim().email().max(254).optional().nullable()),
  notes: optionalText('Notes', 2000),
};

export const createSupplierSchema = z.object(supplierFields).strict();
export const updateSupplierSchema = z.object({
  name: supplierFields.name.optional(), phone: supplierFields.phone.optional(),
  companyName: supplierFields.companyName, secondaryPhone: supplierFields.secondaryPhone,
  email: supplierFields.email, notes: supplierFields.notes,
  reason: userTextSchema({ field: 'Reason', min: 5, max: 1000 }).optional(),
  accountPassword: z.string().min(1).optional(),
}).strict().superRefine((values, context) => {
  const fields = Object.keys(values).filter((key) => !['reason', 'accountPassword'].includes(key) && values[key as keyof typeof values] !== undefined);
  if (!containsSensitiveSupplierFields(fields)) return;
  if (!values.reason) context.addIssue({ code: 'custom', path: ['reason'], message: 'Reason is required for name or phone changes' });
  if (!values.accountPassword) context.addIssue({ code: 'custom', path: ['accountPassword'], message: 'Account password is required' });
});
export const supplierActionSchema = z.object({
  reason: userTextSchema({ field: 'Reason', min: 5, max: 1000 }),
  accountPassword: z.string().min(1, 'Account password is required'),
}).strict();
export const supplierParamsSchema = z.object({ supplierId: z.string().uuid() });
export const supplierListQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  isActive: z.enum(['true', 'false']).optional().transform((value) => value === undefined ? undefined : value === 'true'),
  sortBy: z.enum(['name', 'createdAt', 'balance']).default('name'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
});
export const supplierAuditQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
});

export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;
export type SupplierActionInput = z.infer<typeof supplierActionSchema>;
export type SupplierParamsInput = z.infer<typeof supplierParamsSchema>;
export type SupplierListQueryInput = z.infer<typeof supplierListQuerySchema>;
export type SupplierAuditQueryInput = z.infer<typeof supplierAuditQuerySchema>;
