import { z } from 'zod';
import { databaseUuidSchema } from '../../validators/database-uuid';
import {
  customerImportFields,
  MAX_CUSTOMER_IMPORT_BYTES,
  MAX_CUSTOMER_IMPORT_ROWS,
} from './customer-import.parser';

export const columnMappingSchema = z
  .object(
    Object.fromEntries(
      customerImportFields.map((field) => [field, z.number().int().min(0).nullable().optional()])
    ) as Record<(typeof customerImportFields)[number], z.ZodOptional<z.ZodNullable<z.ZodNumber>>>
  )
  .strict();
export const customerImportDecisionSchema = z
  .object({
    rowNumber: z.number().int().min(2),
    action: z.enum(['CREATE', 'UPDATE', 'SKIP']),
    targetCustomerId: databaseUuidSchema('Invalid target customer ID').optional(),
    updateFields: z
      .array(z.enum(['name', 'address', 'notes', 'creditLimit']))
      .max(4)
      .optional(),
    skipOpeningBalance: z.boolean().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.action === 'UPDATE' && !value.targetCustomerId)
      ctx.addIssue({
        code: 'custom',
        message: 'Select the matching customer to update',
        path: ['targetCustomerId'],
      });
    if (value.action !== 'UPDATE' && (value.targetCustomerId || value.updateFields))
      ctx.addIssue({ code: 'custom', message: 'Only UPDATE accepts a customer and update fields' });
    if (new Set(value.updateFields).size !== (value.updateFields?.length ?? 0))
      ctx.addIssue({ code: 'custom', message: 'Update fields must be unique' });
  });
const decisionsSchema = z
  .array(customerImportDecisionSchema)
  .max(MAX_CUSTOMER_IMPORT_ROWS)
  .refine(
    (rows) => new Set(rows.map((row) => row.rowNumber)).size === rows.length,
    'Each row may have only one decision'
  );
export const createCustomerImportSchema = z
  .object({
    branchId: databaseUuidSchema('Invalid destination branch ID'),
    fileName: z.string().trim().min(1).max(255),
    csvText: z.string().min(1).max(MAX_CUSTOMER_IMPORT_BYTES),
  })
  .strict();
export const customerImportParamsSchema = z.object({
  importId: databaseUuidSchema('Invalid customer import ID'),
});
export const updateCustomerImportSchema = z
  .object({ columnMapping: columnMappingSchema.optional(), decisions: decisionsSchema.optional() })
  .strict()
  .refine(
    (value) => value.columnMapping !== undefined || value.decisions !== undefined,
    'Supply mapping or decisions'
  );
export const commitCustomerImportSchema = z
  .object({ decisions: decisionsSchema, accountPassword: z.string().min(1).optional() })
  .strict();
export type CustomerImportDecision = z.infer<typeof customerImportDecisionSchema>;
export type CreateCustomerImportInput = z.infer<typeof createCustomerImportSchema>;
export type UpdateCustomerImportInput = z.infer<typeof updateCustomerImportSchema>;
export type CommitCustomerImportInput = z.infer<typeof commitCustomerImportSchema>;
