import { z } from 'zod';
import { databaseUuidSchema } from '../../../validators/database-uuid';
import { MAX_PRODUCT_IMPORT_BYTES, MAX_PRODUCT_IMPORT_ROWS } from './product-import.parser';
import { ALL_PRODUCT_IMPORT_BRANDS } from './product-catalog-defaults';

const categoryMappingsSchema = z.record(z.string().trim().min(1).max(120), databaseUuidSchema('Invalid category ID').nullable());

export const createProductImportSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  csvText: z.string().min(1).max(MAX_PRODUCT_IMPORT_BYTES),
  sourceSystem: z.string().trim().min(2).max(80),
  brand: z.string().trim().min(1).max(120).default(ALL_PRODUCT_IMPORT_BRANDS),
}).strict();

export const productImportParamsSchema = z.object({ importId: databaseUuidSchema('Invalid product import ID') });

export const updateProductImportSchema = z.object({
  categoryMappings: categoryMappingsSchema,
}).strict();

const importDecisionSchema = z.object({
  rowNumber: z.number().int().positive(),
  action: z.enum(['CREATE', 'MERGE', 'COMBINE', 'EXCLUDE']),
  targetProductId: databaseUuidSchema('Invalid target product ID').optional(),
  targetRowNumber: z.number().int().positive().optional(),
  externalCode: z.string().trim().min(1).max(120).optional(),
  name: z.string().trim().min(1).max(200).optional(),
  mergeFields: z.array(z.enum(['name', 'model', 'brand', 'category'])).max(4).optional(),
  inventoryAction: z.enum(['KEEP', 'OPENING', 'RECONCILE']).optional(),
}).strict().superRefine((value, context) => {
  if (value.action === 'MERGE' && !value.targetProductId) {
    context.addIssue({ code: 'custom', path: ['targetProductId'], message: 'Select the existing product to merge into' });
  }
  if (value.action === 'COMBINE' && !value.targetRowNumber) {
    context.addIssue({ code: 'custom', path: ['targetRowNumber'], message: 'Select the CSV row to combine into' });
  }
});

export const commitProductImportSchema = z.object({
  decisions: z.array(importDecisionSchema).max(MAX_PRODUCT_IMPORT_ROWS),
  accountPassword: z.string().min(1).optional(),
}).strict();

export type CreateProductImportInput = z.infer<typeof createProductImportSchema>;
export type ProductImportParamsInput = z.infer<typeof productImportParamsSchema>;
export type UpdateProductImportInput = z.infer<typeof updateProductImportSchema>;
export type CommitProductImportInput = z.infer<typeof commitProductImportSchema>;
export type ProductImportDecision = z.infer<typeof importDecisionSchema>;
